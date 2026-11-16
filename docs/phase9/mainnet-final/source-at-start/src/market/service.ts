import { coalescingReader } from "./reader.js";
import { verifiedLifecycle, transition } from "./lifecycle.js";
import { performance } from "node:perf_hooks";
import { BoundedStage } from "../stages.js";
import { telemetry, type Telemetry } from "../telemetry.js";
import type { VerifiedLaunch } from "../verified-decoders.js";
import { VERIFIED_PROGRAMS } from "../chain.js";
import { freshnessReasons } from "../freshness.js";
import { PumpMarketAdapter } from "./pump.js";
import { PoolMarketAdapter } from "./pools.js";
import { RealMarketPaper } from "./paper.js";
import {
  atoms,
  unknown,
  failed,
  verified,
  publicEvidence,
  type MarketReader,
  type MarketState,
  type Signal,
  type MarketAdapter,
  type Quote,
} from "./types.js";
import { FEES } from "./accounts.js";
export class MarketService {
  private adapters = new Map<string, MarketAdapter>(
    [
      new PumpMarketAdapter(),
      new PoolMarketAdapter("pumpswap"),
      new PoolMarketAdapter("raydium-cpmm"),
      new PoolMarketAdapter("meteora-dlmm"),
    ].map((a) => [a.venue, a]),
  );
  private previous = new Map<
    string,
    {
      slot: number;
      liquidity: bigint;
      digest: string;
      accounts: Record<string, string>;
    }
  >();
  private stage: BoundedStage;
  private closing = false;
  private polling = false;
  constructor(
    readonly paper: RealMarketPaper,
    private rpc: MarketReader,
    private metrics: Telemetry = telemetry,
  ) {
    this.rpc = coalescingReader(rpc, metrics);
    this.stage = new BoundedStage("market.pipeline", 32, 2, metrics);
  }
  async observe(event: { program: string; signature: string; slot: number; observedAt: number },
    commitment: "processed" | "confirmed" | "finalized", provider: string) {
    return this.paper.store.paperTransaction(s => {
      const subject = { id: `${event.program}:${event.signature}`, signature: event.signature,
        program: event.program, slot: event.slot, receiptAt: event.observedAt };
      if (!s.marketLifecycle?.some(r => r.id === subject.id))
        transition(s, subject, "DETECTED", commitment, provider, "Notification; creation instruction remains unverified");
      return transition(s, subject, "PROVISIONAL", commitment, provider,
        "Read-only preparation permitted; no eligibility or finalized proof claimed");
    });
  }
  private async external(launch: VerifiedLaunch) {
    const program = VERIFIED_PROGRAMS.find(
      (p) => p.name === launch.program,
    )?.address;
    const reads = await Promise.allSettled([
      this.rpc.fees?.([launch.address]) ??
        Promise.resolve(unknown("Network fee reader unavailable")),
      program
        ? (this.rpc.deployment?.(program, launch.slot) ??
          Promise.resolve(unknown("Deployment reader unavailable")))
        : Promise.resolve(failed("Unsupported program")),
      launch.program === "pump" || launch.program === "pumpswap"
        ? (this.rpc.deployment?.(FEES, launch.slot) ??
          Promise.resolve(unknown("Fee-program deployment reader unavailable")))
        : Promise.resolve(verified(true, "No external fee program")),
    ]);
    const signals = reads.map((r) =>
      r.status === "fulfilled"
        ? r.value
        : failed("Read-only evidence retrieval failed"),
    );
    return {
      fees: signals[0],
      version:
        signals[1].status === "verified" && signals[2].status === "verified"
          ? { ...verified(
              { program: signals[1], feeProgram: signals[2] },
              "Pinned deployment headers checked",
            ), observedAt: signals[1].observedAt !== undefined
                ? Math.min(signals[1].observedAt, signals[2].observedAt ?? signals[1].observedAt) : undefined,
              provider: this.rpc.provider, commitment: "finalized" as const }
          : failed("Unknown or upgraded protocol/fee-program deployment"),
    };
  }
  private remember(s: MarketState) {
    const key = `${s.venue}:${s.launch.address}`,
      old = this.previous.get(key),
      accounts = Object.fromEntries(
        s.accounts.map((a) => [a.address, a.sha256]),
      );
    if (old) {
      if (
        s.slot < old.slot ||
        (s.slot === old.slot &&
          Object.entries(old.accounts).some(
            ([key, digest]) => key in accounts && accounts[key] !== digest,
          ))
      )
        throw Error("Reorganized or inconsistent provider market snapshot");
      const drop =
        old.liquidity > s.liquidityLamports && old.liquidity > 0n
          ? ((old.liquidity - s.liquidityLamports) * 10000n) / old.liquidity
          : 0n;
      s.signals.liquidityChanges = verified(
        {
          previousSlot: old.slot,
          previousLamports: old.liquidity.toString(),
          currentLamports: s.liquidityLamports.toString(),
          dropBps: drop.toString(),
        },
        "Same-process sequential finalized observations; not historical liquidity reconstruction",
        s.slot,
      );
    }
    this.previous.delete(key);
    this.previous.set(key, {
      slot: s.slot,
      liquidity: s.liquidityLamports,
      digest: s.digest,
      accounts,
    });
    if (this.previous.size > 200)
      this.previous.delete(this.previous.keys().next().value!);
  }
  private async read(launch: VerifiedLaunch) {
    const adapter = this.adapters.get(launch.program);
    if (!adapter) throw Error("Unsupported venue");
    const state = await this.metrics.measureAsync(
      "market.state_retrieval_ms",
      () => adapter.read(launch, this.rpc),
    );
    this.remember(state);
    return { adapter, state };
  }
  async evaluate(launch: VerifiedLaunch) {
    const enqueued = performance.now();
    const op = this.stage.trySubmit(async () => {
      this.metrics.observe(
        "market.queue_backlog_age_ms",
        performance.now() - enqueued,
      );
      if (this.paper.store.state.seen.includes(launch.id))
        return { duplicate: true };
      if (launch.receiptMonoMs !== undefined)
        this.metrics.observe(
          "market.receipt_to_evaluation_ms",
          Math.max(0, performance.now() - launch.receiptMonoMs),
        );
      const stale = freshnessReasons(
        launch.freshness,
        this.paper.policy,
        Date.now(),
      );
      if (launch.creationCommitment !== "finalized")
        stale.push("Finalized creation verification unavailable");
      if (stale.length) return this.reject(launch, stale);
      try {
        // Independent fee/deployment and account discovery reads overlap; the final market bank is still validated.
        const [external, { adapter, state }] = await Promise.all([this.external(launch), this.read(launch)]);
        let buy: Quote | undefined, sell: Quote | undefined;
        try {
          this.metrics.measure("market.quote_computation_ms", () => {
            buy = adapter.quote(
              state,
              "buy",
              atoms(
                this.paper.store.state.strategies[0].tradeSol.toString(),
                9,
              ),
              this.paper.store.state.strategies[0].maxSlippageBps,
            );
            sell = adapter.quote(
              state,
              "sell",
              buy.minimumOutput,
              this.paper.store.state.strategies[0].maxSlippageBps,
            );
          });
        } catch {
          this.metrics.increment("market.quote_failed");
        }
        const result = await this.paper.review(
          state,
          buy,
          sell,
          external.fees,
          external.version,
        );
        if (launch.receiptMonoMs !== undefined)
          this.metrics.observe(
            "market.receipt_to_decision_ms",
            Math.max(0, performance.now() - launch.receiptMonoMs),
          );
        return result;
      } catch (error) {
        this.metrics.increment("market.failed");
        return this.reject(launch, [
          error instanceof Error ? error.message : "Market evidence failed",
        ],(error as any)?.marketFailure);
      }
    }, enqueued, launch.freshness?.origin === "live" ? 1 : 0);
    if (!op) throw Error("Market pipeline backlog capacity");
    return op;
  }
  private async reject(launch: VerifiedLaunch, reasons: string[],marketFailure?:unknown) {
    this.metrics.increment("market.rejected_before_quote");
    return this.paper.store.paperTransaction((s) => {
      if (s.seen.includes(launch.id)) return { duplicate: true };
      if (launch.creationCommitment === "finalized") verifiedLifecycle(s, launch);
      s.seen.push(launch.id);
      s.seen = s.seen.slice(-10000);
      s.marketReviews ??= [];
      s.marketReviews.unshift({
        id: launch.id,
        at: Date.now(),
        reasons,
        evidence: publicEvidence({
          launch,
          policy: this.paper.policy,
          status: "failed",
          ...(marketFailure?{marketFailure}:{}),
          liveTrading: false,
        }) as Record<string, unknown>,
      });
      s.marketReviews = s.marketReviews.slice(0, 200);
      return { reasons };
    });
  }
  async exit(id: string, automatic = false) {
    const op = this.stage.trySubmit(() => this.exitNow(id, automatic), performance.now(), 2);
    if (!op) throw Error("Market exit backlog capacity");
    return op;
  }
  private async exitNow(id: string, automatic = false) {
    const p = this.paper.store.state.positions.find((p) => p.id === id);
    if (!p?.market) throw Error("Real-market position missing");
    const launch = JSON.parse(p.market.launch) as VerifiedLaunch;
    try {
      const external = await this.external(launch);
      const { adapter, state } = await this.read(launch);
      const quote = this.metrics.measure("market.quote_computation_ms", () =>
        adapter.quote(
          state,
          "sell",
          BigInt(p.market!.atoms),
          this.paper.store.state.strategies[0].maxSlippageBps,
        ),
      );
      return await this.paper.exit(
        id,
        state,
        quote,
        external.fees,
        external.version,
        automatic,
      );
    } catch (error) {
      await this.paper.store.paperTransaction((s) => {
        s.failures++;
        if (s.failures >= s.strategies[0].maxFailures) s.running = false;
        s.marketReviews ??= [];
        s.marketReviews.unshift({
          id: `exit:${id}`,
          at: Date.now(),
          reasons: [error instanceof Error ? error.message : "Sell failed"],
          evidence: { status: "failed", positionRetained: true },
        });
        s.marketReviews = s.marketReviews.slice(0, 200);
      });
      throw error;
    }
  }
  async poll() {
    if (
      this.closing ||
      this.polling ||
      !this.paper.store.state.running ||
      this.paper.store.state.killed
    )
      return;
    this.polling = true;
    try {
      for (const p of [...this.paper.store.state.positions]) {
        if (this.closing || !this.paper.store.state.running) break;
        await this.exit(p.id, true).catch(() => undefined);
      }
    } finally {
      this.polling = false;
    }
  }
  async close() {
    this.closing = true;
    this.stage.close();
    await this.stage.drain();
  }
  snapshot() {
    return {
      mode: "real-market-paper",
      policy: this.paper.policy,
      liveTrading: false,
      state: this.paper.store.state,
      telemetry: this.metrics.report(),
    };
  }
}
