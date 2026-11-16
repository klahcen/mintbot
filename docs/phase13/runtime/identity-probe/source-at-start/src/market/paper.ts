import { STRICT_MARKET_POLICY, type MarketPolicy } from "./policy.js";
import { verifiedLifecycle, transition } from "./lifecycle.js";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { Engine, alert } from "../engine.js";
import { decision, exitReason } from "../risk.js";
import type { Launch, State } from "../model.js";
import {
  atoms,
  decimal,
  publicEvidence,
  type MarketState,
  type Quote,
  type Signal,
} from "./types.js";
import { marketRisk, validateQuote, type MarketRisk } from "./risk.js";
import { SOL } from "./accounts.js";
type Fees = {
  baseLamports: string;
  priorityLamports: string;
  rentLamports: string;
  computeUnitLimit: number;
  observedAt: number;
};
function sol(amount: bigint) {
  const n = Number(amount) / 1e9;
  if (!Number.isFinite(n)) throw Error("Display amount overflow");
  return n;
}
function ui(amount: bigint, decimals: number) {
  return Number(decimal(amount, decimals));
}
function feeAmounts(f: Signal, includeRent: boolean) {
  if (f.status !== "verified") throw Error("Unknown mandatory fee evidence");
  const v = f.value as Fees;
  if (
    !v ||
    Date.now() < v.observedAt ||
    Date.now() - v.observedAt > 5000 ||
    !["baseLamports", "priorityLamports", "rentLamports"].every((k) =>
      /^\d{1,20}$/.test((v as any)[k]),
    )
  )
    throw Error("Stale or invalid network fee evidence");
  return (
    BigInt(v.baseLamports) +
    BigInt(v.priorityLamports) +
    (includeRent ? BigInt(v.rentLamports) : 0n)
  );
}
function ledger(s: State) {
  if (!s.marketLedger) throw Error("Real-market ledger required");
  if (s.balanceSol !== sol(BigInt(s.marketLedger.balanceLamports)))
    throw Error("Mixed synthetic and real-market balance changes rejected");
  const day = new Date().toISOString().slice(0, 10);
  if (s.marketLedger.day !== day) {
    s.marketLedger.day = day;
    s.marketLedger.dailySpendLamports = "0";
    s.day = day;
    s.dailySpendSol = 0;
  }
  return s.marketLedger;
}
export function initializeMarketLedger(s: State) {
  if (s.positions.some((p) => !p.market))
    throw Error("Synthetic positions cannot share a real-market ledger");
  if (!s.marketLedger) {
    if (s.trades.length || s.seen.length || s.launches.length)
      throw Error(
        "Existing synthetic history cannot initialize a real-market ledger",
      );
    s.marketLedger = {
      balanceLamports: atoms(s.balanceSol.toString(), 9).toString(),
      dailySpendLamports: atoms(s.dailySpendSol.toString(), 9).toString(),
      realizedPnlLamports: "0",
      day: s.day,
    };
  }
  s.marketReviews ??= [];
  return s;
}
/** Shares Store, Engine controls, strategy rules and position/trade schema; isolated from synthetic funds. */
export class RealMarketPaper extends Engine {
  readonly policy: Readonly<MarketPolicy>;
  readonly decisionFence?: () => void;
  constructor(...args: [ConstructorParameters<typeof Engine>[0], ConstructorParameters<typeof Engine>[1]?, Readonly<MarketPolicy>?, (() => void)?]) {
    super(args[0], args[1]);
    this.decisionFence = args[3];
    this.policy = Object.freeze({ ...(args[2] ?? STRICT_MARKET_POLICY) });
  }
  async review(
    state: MarketState,
    buy: Quote | undefined,
    sell: Quote | undefined,
    fees: Signal,
    version: Signal,
  ) {
    if ("purpose" in state.launch || !state.launch.signature) throw Error("Market inspection cannot enter paper trading");
    const launch = state.launch;
    return this.store.paperTransaction((s) => {
      this.decisionFence?.();
      const exact = ledger(s);
      if (s.seen.includes(state.launch.id)) return { duplicate: true };
      const risk = this.metrics.measure("market.risk_evaluation_ms", () =>
        marketRisk(state, buy, sell, fees, version, Date.now(), this.policy),
      );
      if (state.launch.creationCommitment === "finalized") verifiedLifecycle(s, launch);
      const c = s.strategies[0];
      const reasons = [...risk.reasons];
      let l: Launch | undefined;
      let network = 0n;
      try {
        network = feeAmounts(fees, true);
      } catch (e) {
        reasons.push((e as Error).message);
      }
      if (buy && sell) {
        if (
          buy.side !== "buy" ||
          sell.side !== "sell" ||
          sell.input !== buy.minimumOutput ||
          buy.input !== atoms(c.tradeSol.toString(), 9)
        )
          reasons.push(
            "Quote direction, route amount or configured budget mismatch",
          );
        const holder = state.signals.holderConcentration.value as
          | { topOwnerBps: number }
          | undefined;
        l = {
          id: state.launch.id,
          mint: state.mint,
          symbol: state.mint.slice(0, 8),
          platform: state.venue,
          kind: state.launch.kind,
          creator: state.launch.creator ?? "",
          priceSol: sol(buy.input) / ui(buy.output, state.decimals),
          priceAt: state.retrievedAt,
          detectedAt: state.launch.freshness?.receiptAt ?? state.retrievedAt,
          freshness: state.launch.freshness,
          liquiditySol: sol(state.liquidityLamports),
          marketCapSol: sol(
            (state.supply * state.quoteReserve) / state.baseReserve,
          ),
          volumeSol: 0,
          momentumBps: 0,
          mintAuthority:
            state.signals.mintAuthority.status === "verified" ? false : null,
          freezeAuthority:
            state.signals.freezeAuthority.status === "verified" ? false : null,
          restricted:
            state.signals.transferRestrictions.status === "verified"
              ? false
              : null,
          topHolderPct: holder ? holder.topOwnerBps / 100 : null,
          sellSimulation: risk.signals.sellRoute.status === "verified",
          source: "verified",
        };
        reasons.push(
          ...this.metrics.measure("market.strategy_decision_ms", () =>
            decision(l!, s, { ...c, freshness: this.policy }, Date.now(), this.metrics),
          ),
        );
        if (c.minVolumeSol > 0)
          reasons.push("Verified volume history unavailable");
        if (c.kind === "momentum" || c.minMomentumBps > 0)
          reasons.push("Verified momentum history unavailable");
        const capNumerator = state.supply * state.quoteReserve;
        if (state.liquidityLamports < atoms(c.minLiquiditySol.toString(), 9))
          reasons.push("Exact liquidity threshold");
        if (
          capNumerator <
            atoms(c.minMarketCapSol.toString(), 9) * state.baseReserve ||
          capNumerator >
            atoms(c.maxMarketCapSol.toString(), 9) * state.baseReserve
        )
          reasons.push("Exact indicative market-cap threshold");
        if (buy.input > atoms(c.maxTradeSol.toString(), 9))
          reasons.push("Exact per-trade limit");
        const cost = buy.input + network;
        if (
          BigInt(exact.balanceLamports) - cost <
          atoms(c.reserveSol.toString(), 9)
        )
          reasons.push("Exact wallet reserve");
        if (
          BigInt(exact.dailySpendLamports) + cost >
          atoms(c.maxDailySpendSol.toString(), 9)
        )
          reasons.push("Exact daily spend including fees and rent");
        if (buy.minimumOutput <= 0n)
          reasons.push("Slippage leaves no executable output");
      }
      s.seen.push(state.launch.id);
      s.seen = s.seen.slice(-10000);
      s.marketReviews!.unshift({
        id: state.launch.id,
        at: Date.now(),
        reasons: [...new Set(reasons)],
        evidence: publicEvidence({
          policy: this.policy,
          state,
          buy,
          sell,
          risk,
          fees,
          version,
          scope:
            "Account-state estimates, not on-chain transaction simulation. New ATA rent conservatively charged and not refunded.",
        }) as Record<string, unknown>,
      });
      s.marketReviews = s.marketReviews!.slice(0, 200);
      if (l) {
        s.launches.unshift(l);
        s.launches = s.launches.slice(0, 200);
      }
      if (reasons.length || !buy || !sell || !l) {
        this.metrics.increment("market.rejected");
        return { reasons: [...new Set(reasons)] };
      }
      const subject = verifiedLifecycle(s, launch);
      transition(s, subject, "ELIGIBLE", "finalized", state.provider, "All mandatory risk and strategy checks passed");
      return this.metrics.measure("market.paper_execution_ms", () => {
        validateQuote(state, buy);
        validateQuote(state, sell);
        const quantity = buy.minimumOutput,
          cost = buy.input + network,
          id = randomUUID(),
          price = sol(cost) / ui(quantity, state.decimals);
        exact.balanceLamports = (
          BigInt(exact.balanceLamports) - cost
        ).toString();
        exact.dailySpendLamports = (
          BigInt(exact.dailySpendLamports) + cost
        ).toString();
        s.balanceSol = sol(BigInt(exact.balanceLamports));
        s.dailySpendSol = sol(BigInt(exact.dailySpendLamports));
        s.positions.push({
          id,
          mint: state.mint,
          symbol: l!.symbol,
          quantity: ui(quantity, state.decimals),
          entryPriceSol: price,
          priceSol: price,
          priceAt: state.retrievedAt,
          highPriceSol: price,
          costSol: sol(cost),
          openedAt: Date.now(),
          liquiditySol: sol(state.liquidityLamports),
          initialLiquiditySol: sol(state.liquidityLamports),
          source: `real-market-paper:${state.venue}`,
          market: {
            venue: state.venue,
            launch: JSON.stringify(state.launch),
            atoms: quantity.toString(),
            decimals: state.decimals,
            costLamports: cost.toString(),
            stateDigest: state.digest,
            entryNetworkLamports: network.toString(),
          },
        });
        s.trades.unshift({
          id: randomUUID(),
          positionId: id,
          symbol: l!.symbol,
          side: "buy",
          amountSol: sol(buy.input),
          quantity: ui(quantity, state.decimals),
          feeSol: sol(network + (buy.poolFeeAsset === SOL ? buy.poolFee : 0n)),
          slippageSol:
            sol(buy.input) * (1 - Number(quantity) / Number(buy.output)),
          pnlSol: 0,
          status: "paper-filled",
          at: Date.now(),
          reason:
            "Validated real-market quote; conservative minimum-output simulation",
          source: `real-market-paper:${state.venue}`,
          market: {
            inputAtoms: buy.input.toString(),
            outputAtoms: quantity.toString(),
            networkLamports: network.toString(),
            poolFee: buy.poolFee.toString(),
            poolFeeAsset: buy.poolFeeAsset,
            ...(buy.outputFee
              ? {
                  outputFeeAtoms: buy.outputFee.atoms.toString(),
                  outputFeeMint: buy.outputFee.mint,
                }
              : {}),
            stateDigest: state.digest,
            slot: state.slot,
            provider: state.provider,
          },
        });
        s.trades = s.trades.slice(0, 1000);
        transition(s, subject, "PAPER_EXECUTED", "finalized", state.provider, "Minimum-output paper debit/position recorded atomically; no chain transaction");
        this.metrics.increment("market.buys_committed");
        alert(s, `Real-market paper buy ${l!.symbol}`);
        return { positionId: id };
      });
    });
  }
  async exit(
    id: string,
    state: MarketState,
    quote: Quote,
    fees: Signal,
    version: Signal,
    automatic = false,
  ) {
    return this.store.paperTransaction((s) => {
      this.decisionFence?.();
      const exact = ledger(s),
        p = s.positions.find((p) => p.id === id);
      if (
        !p?.market ||
        p.mint !== state.mint ||
        p.market.venue !== state.venue ||
        p.market.decimals !== state.decimals ||
        quote.side !== "sell" ||
        quote.input !== BigInt(p.market.atoms)
      )
        throw Error("Position or sell quote identity mismatch");
      if (s.killed) throw Error("Kill switch active");
      if (s.failures >= s.strategies[0].maxFailures)
        throw Error("Failure circuit breaker active");
      validateQuote(state, quote);
      if (
        version.status !== "verified" ||
        state.signals.transferRestrictions.status !== "verified" ||
        state.signals.transferRestrictions.value !== false
      )
        throw Error("Sell safety evidence unavailable");
      if (quote.impactBps < 0n || quote.impactBps > 500n) throw Error("Sell price impact exceeds 500 bps; position retained");
      const network = feeAmounts(fees, false),
        proceeds = quote.minimumOutput - network;
      if (proceeds < 0n) throw Error("Sell fees exceed proceeds");
      const price = sol(proceeds) / p.quantity;
      let trigger: string | null = null;
      if (automatic) {
        if (!s.running) throw Error("Trading disabled");
        p.priceSol = price;
        p.priceAt = state.retrievedAt;
        p.highPriceSol = Math.max(p.highPriceSol, price);
        p.liquiditySol = sol(state.liquidityLamports);
        trigger = exitReason(p, s.strategies[0], Date.now(), this.metrics);
        if (!trigger)
          return { marked: true };
      }
      return this.metrics.measure("market.paper_execution_ms", () => {
        s.marketReviews!.unshift({
          id: `exit:${id}`,
          at: Date.now(),
          reasons: [],
          evidence: publicEvidence({
            state,
            quote,
            fees,
            version,
            scope:
              "Fresh full-position exit quote; conservative minimum output",
          }) as Record<string, unknown>,
        });
        s.marketReviews = s.marketReviews!.slice(0, 200);
        const pnl = proceeds - BigInt(p.market!.costLamports);
        exact.balanceLamports = (
          BigInt(exact.balanceLamports) + proceeds
        ).toString();
        exact.realizedPnlLamports = (
          BigInt(exact.realizedPnlLamports) + pnl
        ).toString();
        s.balanceSol = sol(BigInt(exact.balanceLamports));
        s.realizedPnlSol = sol(BigInt(exact.realizedPnlLamports));
        s.positions = s.positions.filter((p) => p.id !== id);
        s.trades.unshift({
          id: randomUUID(),
          positionId: id,
          symbol: p.symbol,
          side: "sell",
          amountSol: sol(proceeds),
          quantity: p.quantity,
          feeSol: sol(
            network +
              (quote.poolFeeAsset === SOL ? quote.poolFee : 0n) +
              (quote.outputFee?.mint === SOL ? quote.outputFee.atoms : 0n),
          ),
          slippageSol: sol(quote.output - quote.minimumOutput),
          pnlSol: sol(pnl),
          status: "paper-filled",
          at: Date.now(),
          reason: automatic
            ? `Validated quote ${trigger}`
            : "Manual validated quote exit",
          source: p.source,
          market: {
            inputAtoms: quote.input.toString(),
            outputAtoms: quote.minimumOutput.toString(),
            networkLamports: network.toString(),
            poolFee: quote.poolFee.toString(),
            poolFeeAsset: quote.poolFeeAsset,
            ...(quote.outputFee
              ? {
                  outputFeeAtoms: quote.outputFee.atoms.toString(),
                  outputFeeMint: quote.outputFee.mint,
                }
              : {}),
            stateDigest: state.digest,
            slot: state.slot,
            provider: state.provider,
          },
        });
        s.trades = s.trades.slice(0, 1000);
        this.metrics.increment("market.sells_committed");
        return { pnlLamports: pnl.toString() };
      });
    });
  }
}
