import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PublicKey } from "@solana/web3.js";
import pumpSchema from "./pumpswap-layouts.json" with { type: "json" };
import dlmmSchema from "./meteora-layouts.json" with { type: "json" };
import { quoteDlmm } from "./dlmm-quote.js";
import { BorshReader } from "../borsh-reader.js";
import {
  PROTOCOL_REVISIONS,
  type VerifiedLaunch,
} from "../verified-decoders.js";
import {
  account,
  struct,
  mint,
  vault,
  pda,
  FEES,
  ZERO,
  SOL,
  CLOCK,
  PUMP,
  provenance,
  validateBatch,
  concentration,
} from "./accounts.js";
import { decodePump } from "./pump.js";
import {
  ceilDiv,
  verified,
  unknown,
  failed,
  type MarketBatch,
  type MarketSubject,
  type MarketInspection,
  type MarketState,
  type MarketReader,
  type MarketAdapter,
  type Quote,
} from "./types.js";
export const SWAP = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const RAY = "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C";
export const DLMM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
interface PoolSpec {
  base: string;
  quote: string;
  baseVault: string;
  quoteVault: string;
  authority: string;
  extras: string[];
}
function rayRoot(batch: MarketBatch, address: string) {
  const data = account(batch, address, RAY).data;
  if (
    data.length !== 637 ||
    !data
      .subarray(0, 8)
      .equals(
        createHash("sha256")
          .update("account:PoolState")
          .digest()
          .subarray(0, 8),
      )
  )
    throw Error("Unsupported Raydium pool version");
  const r = new BorshReader(data.subarray(8));
  const keys = [
    "config",
    "creator",
    "vault0",
    "vault1",
    "lp",
    "mint0",
    "mint1",
    "program0",
    "program1",
    "observation",
  ];
  const v: any = Object.fromEntries(keys.map((k) => [k, r.read("pubkey")]));
  for (const k of ["bump", "status", "lpDecimals", "decimals0", "decimals1"])
    v[k] = r.read("u8");
  for (const k of [
    "lpSupply",
    "protocol0",
    "protocol1",
    "fund0",
    "fund1",
    "openTime",
    "epoch",
  ])
    v[k] = BigInt(r.read("u64"));
  v.creatorFeeOn = r.read("u8");
  v.enableCreatorFee = r.read("bool");
  if (r.take(6).some((x) => x)) throw Error("Unknown Raydium flags");
  v.creator0 = BigInt(r.read("u64"));
  v.creator1 = BigInt(r.read("u64"));
  r.finish(true);
  return v;
}
function root(venue: string, b: MarketBatch, a: string): any {
  if (venue === "pumpswap") {
    const n = account(b, a, SWAP).data.length;
    if (![243, 245, 261, 270, 271, 272, 300, 301].includes(n))
      throw Error("Unsupported PumpSwap pool version");
    return struct(b, a, SWAP, pumpSchema, "Pool", 300);
  }
  if (venue === "raydium-cpmm") return rayRoot(b, a);
  if (account(b, a, DLMM).data.length !== 904)
    throw Error("Unsupported DLMM pair version");
  return struct(b, a, DLMM, dlmmSchema, "LbPair");
}
export function poolSpec(venue: string, b: MarketBatch, a: string): PoolSpec {
  const v = root(venue, b, a);
  if (venue === "pumpswap")
    return {
      base: v.base_mint,
      quote: v.quote_mint,
      baseVault: v.pool_base_token_account,
      quoteVault: v.pool_quote_token_account,
      authority: a,
      extras: [
        pda(SWAP, "global_config"),
        pda(FEES, "fee_config", new PublicKey(SWAP).toBuffer()),
      ],
    };
  if (venue === "raydium-cpmm") {
    const flip = v.mint0 === SOL;
    return {
      base: flip ? v.mint1 : v.mint0,
      quote: flip ? v.mint0 : v.mint1,
      baseVault: flip ? v.vault1 : v.vault0,
      quoteVault: flip ? v.vault0 : v.vault1,
      authority: pda(RAY, "vault_and_lp_mint_auth_seed"),
      extras: [v.config, CLOCK],
    };
  }
  const index = Math.floor(v.active_id / 70);
  const bytes = Buffer.alloc(8);
  bytes.writeBigInt64LE(BigInt(index));
  const arrays = [index, index - 1, index + 1].map((i) => {
    const n = Buffer.alloc(8);
    n.writeBigInt64LE(BigInt(i));
    return pda(DLMM, "bin_array", new PublicKey(a).toBuffer(), n);
  });
  return {
    base: v.token_x_mint === SOL ? v.token_y_mint : v.token_x_mint,
    quote: v.token_x_mint === SOL ? v.token_x_mint : v.token_y_mint,
    baseVault: v.token_x_mint === SOL ? v.reserve_y : v.reserve_x,
    quoteVault: v.token_x_mint === SOL ? v.reserve_x : v.reserve_y,
    authority: a,
    extras: [...arrays, CLOCK],
  };
}
export class PoolMarketAdapter implements MarketAdapter {
  constructor(readonly venue: "pumpswap" | "raydium-cpmm" | "meteora-dlmm") {}
  /** Read-only inspection deliberately carries no transaction signature, freshness or finalized creation claim. */
  async inspect(address: string, rpc: MarketReader): Promise<MarketState<MarketInspection>> {
    const batch = await rpc.accounts([address], 0);
    validateBatch(batch, rpc.provider, 0);
    const spec = poolSpec(this.venue, batch, address);
    return this.readSubject({ purpose: "market-inspection", id: `inspection:${this.venue}:${address}`,
      program: this.venue, slot: batch.contextSlot, kind: "pool", address,
      mints: [spec.base, spec.quote], creator: null, chainTimestamp: null,
      instruction: "market-inspection", layoutRevision: PROTOCOL_REVISIONS[this.venue],
      accountContextSlot: batch.contextSlot, executionEligible: false }, rpc);
  }
  async read(launch: VerifiedLaunch, rpc: MarketReader): Promise<MarketState> {
    return this.readSubject(launch, rpc);
  }
  private async readSubject<T extends MarketSubject>(launch: T, rpc: MarketReader): Promise<MarketState<T>> {
    if (
      launch.program !== this.venue ||
      launch.layoutRevision !== PROTOCOL_REVISIONS[this.venue]
    )
      throw Error("Unsupported protocol revision");
    const first = await rpc.accounts([launch.address], launch.slot);
    validateBatch(first, rpc.provider, launch.slot);
    const spec = poolSpec(this.venue, first, launch.address);
    if (
      spec.quote !== SOL ||
      !launch.mints.includes(spec.base) ||
      !launch.mints.includes(SOL)
    )
      throw Error("Unsupported non-SOL pool orientation");
    const discovered = await rpc.accounts(
      [spec.base, spec.quote],
      first.contextSlot,
    );
    validateBatch(discovered, rpc.provider, first.contextSlot);
    const firstMint = mint(discovered, spec.base);
    const holderKeys =
      (await rpc
        .holders?.(spec.base, firstMint.program, discovered.contextSlot)
        .catch(() => [])) ?? [];
    const keys = [
      ...new Set([
        launch.address,
        spec.base,
        spec.quote,
        spec.baseVault,
        spec.quoteVault,
        ...spec.extras,
        ...holderKeys,
      ]),
    ];
    const b = await rpc.accounts(keys, discovered.contextSlot, { fresh: true });
    validateBatch(b, rpc.provider, discovered.contextSlot);
    if (
      JSON.stringify(poolSpec(this.venue, b, launch.address)) !==
      JSON.stringify(spec)
    )
      throw Error("Pool account topology changed");
    const v = root(this.venue, b, launch.address),
      m = mint(b, spec.base),
      q = mint(b, spec.quote);
    if (
      m.decimals !== firstMint.decimals ||
      m.program !== firstMint.program ||
      q.decimals !== 9
    )
      throw Error("Inconsistent token decimals");
    let baseReserve = vault(
        b,
        spec.baseVault,
        spec.base,
        spec.authority,
        m.program,
      ),
      quoteReserve = vault(b, spec.quoteVault, SOL, spec.authority, q.program);
    const actualQuoteReserve = quoteReserve;
    let fees: bigint[] = [];
    let denominator = 10000n;
    let feeOnBuyInput = true,
      feeOnSellInput = true;
    let price = 0n;
    let kind = this.venue;
    const signals: any = {
      ...m.signals,
      mintDecimals: verified(
        {
          decimals: m.decimals,
          program: m.program,
          supply: m.supply.toString(),
        },
        "Mint account decimals, owner and integer supply",
        b.contextSlot,
      ),
      custody: verified(
        {
          baseVault: spec.baseVault,
          quoteVault: spec.quoteVault,
          baseAtoms: baseReserve.toString(),
          quoteAtoms: quoteReserve.toString(),
        },
        "Actual vault balances before fee-bucket/bin exclusions",
        b.contextSlot,
      ),
      holderConcentration: holderKeys.length
        ? concentration(b, holderKeys, spec.base, m.program, m.supply, [
            spec.baseVault,
          ])
        : unknown("Complete holder enumeration unavailable"),
      creatorHistory: unknown("Creator history unavailable"),
      liquidityChanges: unknown("First observation"),
    };
    if (this.venue === "pumpswap") {
      const g = struct(b, spec.extras[0], SWAP, pumpSchema, "GlobalConfig");
      const f = decodePump(b, spec.extras[1], "FeeConfig");
      if (
        g.disable_flags !== 0 ||
        v.is_mayhem_mode ||
        v.is_cashback_coin ||
        v.is_holder_reward ||
        BigInt(v.virtual_quote_reserves) < 0n ||
        v.can_edit_creator_fee
      )
        throw Error("Unsupported or paused PumpSwap mode");
      const index = Buffer.alloc(2);
      index.writeUInt16LE(v.index);
      if (
        launch.address !==
        pda(
          SWAP,
          "pool",
          index,
          new PublicKey(v.creator).toBuffer(),
          new PublicKey(spec.base).toBuffer(),
          new PublicKey(SOL).toBuffer(),
        )
      )
        throw Error("Pool PDA mismatch");
      quoteReserve += BigInt(v.virtual_quote_reserves);
      signals.virtualQuoteReserves = verified(
        v.virtual_quote_reserves,
        "Virtual quote reserves affect pricing but are excluded from liquidity",
        b.contextSlot,
      );
      const canonical =
        v.creator ===
        pda(PUMP, "pool-authority", new PublicKey(spec.base).toBuffer());
      const cap = (m.supply * quoteReserve) / baseReserve;
      const tiers = f.fee_tiers;
      if (
        !tiers.length ||
        tiers.some(
          (t: any, i: number) =>
            i &&
            BigInt(t.market_cap_lamports_threshold) <=
              BigInt(tiers[i - 1].market_cap_lamports_threshold),
        )
      )
        throw Error("Invalid pool fee tiers");
      const tier =
        [...tiers]
          .reverse()
          .find((t: any) => cap >= BigInt(t.market_cap_lamports_threshold)) ??
        tiers[0];
      const rate = canonical ? tier.fees : f.flat_fees;
      fees = [
        BigInt(rate.lp_fee_bps),
        BigInt(rate.protocol_fee_bps),
        v.coin_creator === ZERO
          ? 0n
          : g.creator_fee_configurable && BigInt(v.creator_fee_bps) > 0n
            ? BigInt(v.creator_fee_bps)
            : BigInt(rate.creator_fee_bps),
      ];
      const buckets = BigInt(v.protocol_fees) + BigInt(v.creator_fees);
      if (buckets > actualQuoteReserve)
        throw Error("Pool fee custody exceeds reserves");
      signals.feeBuckets = verified(
        buckets.toString(),
        "Accumulated quote fee buckets excluded from sell liquidity",
        b.contextSlot,
      );
    } else if (this.venue === "raydium-cpmm") {
      const config = account(b, spec.extras[0], RAY).data;
      if (
        config.length !== 236 ||
        !config
          .subarray(0, 8)
          .equals(
            createHash("sha256")
              .update("account:AmmConfig")
              .digest()
              .subarray(0, 8),
          )
      )
        throw Error("Unsupported Raydium fee config");
      const time = account(b, CLOCK).data.readBigInt64LE(32);
      if (
        (v.status & 4) !== 0 ||
        BigInt(time) < v.openTime ||
        ![0, 1, 2].includes(v.creatorFeeOn)
      )
        throw Error("Pool paused, unopened or unsupported fee model");
      const flip = v.mint0 === SOL;
      if (
        v.decimals0 !== (flip ? 9 : m.decimals) ||
        v.decimals1 !== (flip ? m.decimals : 9) ||
        v.program0 !== (flip ? q.program : m.program) ||
        v.program1 !== (flip ? m.program : q.program)
      )
        throw Error("Pool decimals or token program mismatch");
      const index = config.subarray(10, 12);
      if (
        spec.extras[0] !==
          pda(RAY, "amm_config", Buffer.from(index).reverse()) ||
        launch.address !==
          pda(
            RAY,
            "pool",
            new PublicKey(v.config).toBuffer(),
            new PublicKey(v.mint0).toBuffer(),
            new PublicKey(v.mint1).toBuffer(),
          )
      )
        throw Error("Raydium PDA mismatch");
      const bFees = flip
        ? v.protocol1 + v.fund1 + v.creator1
        : v.protocol0 + v.fund0 + v.creator0;
      const qFees = flip
        ? v.protocol0 + v.fund0 + v.creator0
        : v.protocol1 + v.fund1 + v.creator1;
      baseReserve -= bFees;
      quoteReserve -= qFees;
      denominator = 1000000n;
      fees = [
        config.readBigUInt64LE(12),
        v.enableCreatorFee ? config.readBigUInt64LE(108) : 0n,
      ];
      feeOnBuyInput = v.creatorFeeOn === 0 || v.creatorFeeOn === (flip ? 1 : 2);
      feeOnSellInput =
        v.creatorFeeOn === 0 || v.creatorFeeOn === (flip ? 2 : 1);
      signals.feeDistribution = verified(
        {
          protocolRate: config.readBigUInt64LE(20).toString(),
          fundRate: config.readBigUInt64LE(28).toString(),
          creatorShareRate: config.readBigUInt64LE(116).toString(),
        },
        "Protocol/fund shares split the trade fee; never charged a second time",
        b.contextSlot,
      );
    } else {
      const timestamp = account(b, CLOCK).data.readBigInt64LE(32);
      // Pinned isSupportLimitOrder: Undetermined with no rewards uses order fields;
      // LiquidityMining and rewarded Undetermined pairs reuse these bytes as legacy reward state.
      const supportsOrders = v.parameters.function_type === 2 ||
        (v.parameters.function_type === 0 && v.reward_infos.every((r: any) => r.mint === ZERO));
      const bins: any[] = [];
      for (const address of spec.extras.slice(0, 3)) {
        if (!b.accounts[address]) continue;
        const array = struct(b, address, DLMM, dlmmSchema, "BinArray");
        const index = BigInt(array.index);
        if (array.lb_pair !== launch.address || ![2, 3].includes(array.version))
          throw Error("DLMM bin array identity/version mismatch");
        const seed = Buffer.alloc(8);
        seed.writeBigInt64LE(index);
        if (
          address !==
          pda(DLMM, "bin_array", new PublicKey(launch.address).toBuffer(), seed)
        )
          throw Error("DLMM bin PDA mismatch");
        for (let i = 0; i < 70; i++) {
          const bin = array.bins[i];
          bins.push({
            id: Number(index) * 70 + i,
            x: bin.amount_x,
            y: bin.amount_y,
            price: bin.price,
            orders: supportsOrders ?
              BigInt(bin.open_order_amount) +
              BigInt(bin.total_processing_order_amount) +
              BigInt(bin.processed_order_remaining_amount) : 0n,
          });
        }
      }
      if (
        ![0, 1].includes(v.token_mint_x_program_flag) ||
        ![0, 1].includes(v.token_mint_y_program_flag) ||
        (v.token_mint_x_program_flag === 0) !==
          ((v.token_x_mint === SOL ? q : m).program === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") ||
        (v.token_mint_y_program_flag === 0) !==
          ((v.token_x_mint === SOL ? m : q).program === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")
      )
        throw Error("DLMM token program flag mismatch");
      const unsupported =
        v.status !== 0 ||
        ![0, 3].includes(v.pair_type) ||
        ![0, 1].includes(v.parameters.function_type) ||
        ![0, 1].includes(v.parameters.collect_fee_mode) ||
        v.version !== 1 ||
        v.parameters.base_fee_power_factor > 6 ||
        bins.some((b) => b.orders !== 0n) ||
        BigInt(v.v_parameters.last_update_timestamp) > timestamp;
      signals.quoteVariant = unsupported
        ? failed(
            "DLMM activation, limit orders, unknown versions or fee modes unsupported",
          )
        : verified(
            true,
            "Dynamic fees and full fills within at most three verified bin arrays; limit orders excluded",
            b.contextSlot,
          );
      const sumX = bins.reduce((s, b) => s + BigInt(b.x), 0n),
        sumY = bins.reduce((s, b) => s + BigInt(b.y), 0n);
      const flip = v.token_x_mint === SOL;
      if (sumX > (flip ? quoteReserve : baseReserve) || sumY > (flip ? baseReserve : quoteReserve))
        throw Error("DLMM bin inventory exceeds token custody");
      baseReserve = flip ? sumY : sumX;
      quoteReserve = flip ? sumX : sumY;
      signals.dlmmModel = verified(
        {
          bins: bins.map(({ orders, ...b }) => b),
          solIsX: flip,
          activeId: v.active_id,
          binStep: v.bin_step,
          parameters: v.parameters,
          volatility: v.v_parameters,
          timestamp: timestamp.toString(),
        },
        "Pinned dynamic fee and bounded bin traversal model",
        b.contextSlot,
      );
      denominator = 1000000000n;
      fees = [
        BigInt(v.parameters.base_factor) *
          BigInt(v.bin_step) *
          10n *
          10n ** BigInt(v.parameters.base_fee_power_factor),
      ];
    }
    if (
      baseReserve <= 0n ||
      quoteReserve <= 0n ||
      fees.some((f) => f < 0n) ||
      fees.reduce((a, b) => a + b, 0n) > denominator / 5n
    )
      throw Error("Insufficient liquidity or unsupported fees");
    signals.quoteModel = verified(
      {
        kind,
        fees: fees.map(String),
        denominator: denominator.toString(),
        feeOnBuyInput,
        feeOnSellInput,
        price: price.toString(),
      },
      "Pinned protocol integer quote model",
      b.contextSlot,
    );
    signals.liquidity = verified(
      quoteReserve.toString(),
      "Actual spendable pool/bin SOL reserves",
      b.contextSlot,
    );
    const accounts = provenance(b);
    const digest = createHash("sha256")
      .update(JSON.stringify({ slot: b.contextSlot, accounts }))
      .digest("hex");
    return {
      venue: this.venue,
      launch,
      provider: b.provider,
      slot: b.contextSlot,
      commitment: "finalized",
      retrievedAt: b.retrievedAt,
      retrievedMono: b.retrievedMono,
      digest,
      revision: PROTOCOL_REVISIONS[this.venue],
      mint: spec.base,
      decimals: m.decimals,
      supply: m.supply,
      baseReserve,
      quoteReserve,
      liquidityLamports:
        this.venue === "pumpswap" ? actualQuoteReserve : quoteReserve,
      protocolFeeBps: 0n,
      creatorFeeBps: 0n,
      signals,
      accounts,
      source:
        this.venue === "pumpswap"
          ? "https://www.npmjs.com/package/@pump-fun/pump-sdk/v/4.3.1"
          : this.venue === "raydium-cpmm"
            ? "https://github.com/raydium-io/raydium-cp-swap/tree/" +
              PROTOCOL_REVISIONS[this.venue]
            : "https://github.com/MeteoraAg/dlmm-sdk/tree/" +
              PROTOCOL_REVISIONS[this.venue],
    };
  }
  quote(
    s: MarketState<MarketSubject>,
    side: Quote["side"],
    input: bigint,
    slippageBps: number,
    now = performance.now(),
  ): Quote {
    if (
      s.signals.transferRestrictions?.status !== "verified" ||
      s.signals.transferRestrictions.value !== false
    )
      throw Error("Unsupported token transfer restrictions; quote unavailable");
    if (
      s.venue !== this.venue ||
      input <= 0n ||
      input > (1n << 64n) - 1n ||
      !Number.isInteger(slippageBps) ||
      slippageBps < 0 ||
      slippageBps > 2000 ||
      now < s.retrievedMono ||
      now - s.retrievedMono > 1500
    )
      throw Error("Invalid or stale pool quote");
    if (s.signals.quoteVariant && s.signals.quoteVariant.status !== "verified")
      throw Error(s.signals.quoteVariant.reason);
    const model = s.signals.quoteModel.value as any;
    const fees = model.fees.map(BigInt) as bigint[];
    const den = BigInt(model.denominator);
    const active = s.signals.activeBin?.value as
      | { x: string; y: string }
      | undefined;
    const base = active ? BigInt(active.x) : s.baseReserve,
      quote = active ? BigInt(active.y) : s.quoteReserve;
    const rIn = side === "buy" ? quote : base,
      rOut = side === "buy" ? base : quote;
    let output: bigint,
      fee = 0n;
    let outputFee: Quote["outputFee"];
    if (this.venue === "pumpswap") {
      if (side === "buy") {
        let net = (input * den) / (den + fees.reduce((a, b) => a + b, 0n));
        fee = fees.reduce((a, f) => a + ceilDiv(net * f, den), 0n);
        if (net + fee > input) net -= net + fee - input;
        if (net <= 1n) throw Error("Fees exceed input");
        output = ((net - 1n) * rOut) / (rIn + net - 1n);
      } else {
        const gross = (input * rOut) / (rIn + input);
        const parts = fees.map((f) => ceilDiv(gross * f, den));
        fee = parts.reduce((a, b) => a + b, 0n);
        output = gross - fee;
        const buckets = BigInt(s.signals.feeBuckets.value as string);
        if (gross - parts[0] > s.liquidityLamports - buckets)
          throw Error("Unavailable sell liquidity");
      }
    } else if (this.venue === "raydium-cpmm") {
      const onInput =
        side === "buy" ? model.feeOnBuyInput : model.feeOnSellInput;
      const charged = ceilDiv(
        input * (fees[0] + (onInput ? fees[1] : 0n)),
        den,
      );
      const net = input - charged;
      const gross = (net * rOut) / (rIn + net);
      const outFee = onInput ? 0n : ceilDiv(gross * fees[1], den);
      output = gross - outFee;
      // Pool fee can be denominated in two tokens; preserve each component explicitly in model evidence.
      fee = charged;
      if (outFee > 0n)
        outputFee = { atoms: outFee, mint: side === "buy" ? s.mint : SOL };
    } else {
      const result = quoteDlmm(s.signals.dlmmModel.value,
        (s.signals.dlmmModel.value as any).solIsX ? (side === "buy" ? "sell" : "buy") : side, input);
      output = result.output;
      fee = result.fee;
    }
    if (output <= 0n || output >= rOut)
      throw Error("Insufficient executable liquidity");
    const spot =
      this.venue === "meteora-dlmm"
        ? quoteDlmm(s.signals.dlmmModel.value,
        (s.signals.dlmmModel.value as any).solIsX ? (side === "buy" ? "sell" : "buy") : side, input).spot
        : (input * rOut) / rIn;
    return {
      side,
      input,
      output,
      minimumOutput: (output * BigInt(10000 - slippageBps)) / 10000n,
      poolFee: fee,
      poolFeeAsset: this.venue === "meteora-dlmm"
        ? (s.signals.dlmmModel.value as any).parameters.collect_fee_mode === 1
          ? (s.signals.dlmmModel.value as any).solIsX ? s.mint : SOL
          : side === "buy" ? SOL : s.mint
        : this.venue === "pumpswap" || side === "buy" ? SOL : s.mint,
      ...(outputFee ? { outputFee } : {}),
      impactBps: spot > output ? ceilDiv((spot - output) * 10000n, spot) : 0n,
      stateDigest: s.digest,
      slot: s.slot,
      provider: s.provider,
      computedMono: now,
      expiresMono: s.retrievedMono + 1500,
      kind: "account-state-estimate",
    };
  }
}
