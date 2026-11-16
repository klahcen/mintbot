import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import schema from "./pump-layouts.json" with { type: "json" };
import {
  account,
  struct,
  mint,
  vault,
  pda,
  PUMP,
  FEES,
  ZERO,
  SOL,
  provenance,
  validateBatch,
  concentration,
} from "./accounts.js";
import {
  ceilDiv,
  verified,
  unknown,
  type MarketAdapter,
  type MarketReader,
  type MarketState,
  type Quote,
} from "./types.js";
import type { VerifiedLaunch } from "../verified-decoders.js";
export const PUMP_GLOBAL = pda(PUMP, "global");
export const PUMP_FEES = pda(
  FEES,
  "fee_config",
  new PublicKey(PUMP).toBuffer(),
);
const FEE_VERSION_SIZES = [2512, 4073, 4097];
/** Prefix versions documented in official @pump-fun/pump-sdk 4.3.1; no layout guessing. */
export function decodePump(
  batch: Parameters<typeof struct>[0],
  address: string,
  name: "BondingCurve" | "Global" | "FeeConfig",
) {
  const owner = name === "FeeConfig" ? FEES : PUMP;
  const data = account(batch, address, owner).data;
  if (name === "BondingCurve") {
    if (data.length !== 166) throw Object.assign(Error("Unsupported Pump curve version"),{marketFailure:{kind:"unsupported-layout",account:address,actualBytes:data.length,reviewedBytes:166}});
    // Current pinned IDL occupies exactly 166 bytes, including post-completion fields.
    return struct(batch, address, owner, schema, name);
  }
  if (name === "Global") {
    if (![1045, 1088].includes(data.length))
      throw Error("Unsupported Pump global version");
    return struct(batch, address, owner, schema, name, 1088);
  }
  if (!FEE_VERSION_SIZES.includes(data.length))
    throw Error("Unsupported Pump fee version");
  // Versioned FeeConfig ignores preallocated/stale vector tail, exactly as the upstream reader.
  const tiersEnd = (offset: number) => {
    if (offset + 4 > data.length) throw Error("Truncated fee vector");
    const n = data.readUInt32LE(offset);
    if (n < 1 || n > 60 || offset + 4 + n * 40 > data.length)
      throw Error("Invalid fee tier vector");
    return offset + 4 + n * 40;
  };
  let end = tiersEnd(65);
  if (data.length >= 4073) {
    const n = data.readUInt32LE(end);
    if (n > 38 || end + 4 + n * 40 > data.length)
      throw Error("Invalid stable fee vector");
    end += 4 + n * 40;
  }
  if (data.length >= 4097) end += 24;
  const temporary = {
    ...batch,
    accounts: {
      ...batch.accounts,
      [address]: {
        ...batch.accounts[address]!,
        data: [
          Buffer.concat([
            data.subarray(0, end),
            Buffer.alloc(data.length < 4073 ? 28 : data.length < 4097 ? 24 : 0),
          ]).toString("base64"),
          "base64",
        ] as [string, "base64"],
      },
    },
  };
  return struct(temporary, address, owner, schema, name);
}
export class PumpMarketAdapter implements MarketAdapter {
  readonly venue = "pump";
  async read(launch: VerifiedLaunch, rpc: MarketReader): Promise<MarketState> {
    if (
      launch.layoutRevision !== "639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22" ||
      launch.program !== this.venue ||
      launch.mints.length !== 1 ||
      launch.instruction !== "create_v2"
    )
      throw Error("Unsupported Pump launch");
    const mintAddress = launch.mints[0];
    if (
      launch.address !==
      pda(PUMP, "bonding-curve", new PublicKey(mintAddress).toBuffer())
    )
      throw Error("Curve PDA mismatch");
    const first = await rpc.accounts([mintAddress], launch.slot);
    validateBatch(first, rpc.provider, launch.slot);
    const firstMint = mint(first, mintAddress);
    const ata = getAssociatedTokenAddressSync(
      new PublicKey(mintAddress),
      new PublicKey(launch.address),
      true,
      new PublicKey(firstMint.program),
    ).toBase58();
    const holderKeys =
      (await rpc
        .holders?.(mintAddress, firstMint.program, first.contextSlot)
        .catch(() => [])) ?? [];
    const batch = await rpc.accounts(
      [
        ...new Set([
          launch.address,
          mintAddress,
          ata,
          PUMP_GLOBAL,
          PUMP_FEES,
          ...holderKeys,
        ]),
      ],
      first.contextSlot,
      { fresh: true },
    );
    validateBatch(
      batch,
      rpc.provider,
      Math.max(first.contextSlot, launch.slot),
    );
    const m = mint(batch, mintAddress);
    if (m.program !== firstMint.program || m.decimals !== firstMint.decimals)
      throw Error("Inconsistent mint decimals or owner");
    const curve = decodePump(batch, launch.address, "BondingCurve");
    const global = decodePump(batch, PUMP_GLOBAL, "Global");
    const config = decodePump(batch, PUMP_FEES, "FeeConfig");
    if (
      curve.complete ||
      curve.is_cashback_coin ||
      curve.is_holder_reward ||
      curve.quote_mint !== ZERO ||
      curve.depth !== 0 ||
      curve.can_edit_creator_fee
    )
      throw Object.assign(Error("Unsupported completed, configurable or non-native Pump curve"),{marketFailure:{kind:"unsupported-variant",complete:curve.complete,cashback:curve.is_cashback_coin,holderRewards:curve.is_holder_reward,quoteMint:curve.quote_mint,depth:curve.depth,editableCreatorFee:curve.can_edit_creator_fee}});
    if (
      curve.creator !== launch.creator ||
      BigInt(curve.token_total_supply) < m.supply ||
      m.decimals !== 6
    )
      throw Object.assign(Error("Curve identity, supply or decimals mismatch"),{marketFailure:{kind:"identity-or-supply",creatorMatches:curve.creator===launch.creator,creationCreator:launch.creator,currentCurveCreator:curve.creator,mintSupply:m.supply.toString(),curveTotalSupply:String(curve.token_total_supply),decimals:m.decimals}});
    const baseReserve = BigInt(curve.virtual_token_reserves),
      quoteReserve = BigInt(curve.virtual_quote_reserves);
    const realBase = BigInt(curve.real_token_reserves),
      realQuote = BigInt(curve.real_quote_reserves);
    const lamports = batch.accounts[launch.address]?.lamports;
    if (
      !Number.isSafeInteger(lamports) ||
      BigInt(lamports!) <
        realQuote + BigInt(curve.creator_fee) + BigInt(curve.protocol_fees)
    )
      throw Error("Curve SOL custody does not reconcile");
    const custody = vault(batch, ata, mintAddress, launch.address, m.program);
    if (
      baseReserve <= 0n ||
      quoteReserve <= 0n ||
      custody < realBase ||
      realBase <= 0n ||
      realQuote <= 0n
    )
      throw Error("Insufficient or inconsistent Pump liquidity");
    // SOL-like non-Mayhem fee schedules use one billion 6-decimal tokens, per upstream getFee.
    const marketCap =
      ((curve.is_mayhem_mode ? m.supply : 1_000_000_000_000_000n) *
        quoteReserve) /
      baseReserve;
    const tiers = config.fee_tiers;
    if (
      !tiers.length ||
      tiers.some(
        (t: any, i: number) =>
          i &&
          BigInt(t.market_cap_lamports_threshold) <=
            BigInt(tiers[i - 1].market_cap_lamports_threshold),
      )
    )
      throw Error("Invalid fee schedule");
    const tier =
      [...tiers]
        .reverse()
        .find(
          (t: any) => marketCap >= BigInt(t.market_cap_lamports_threshold),
        ) ?? tiers[0];
    const protocolFeeBps = BigInt(tier.fees.protocol_fee_bps);
    const creatorFeeBps =
      curve.creator === ZERO
        ? 0n
        : global.creator_fee_configurable && BigInt(curve.creator_fee_bps) > 0n
          ? BigInt(curve.creator_fee_bps)
          : BigInt(tier.fees.creator_fee_bps);
    if (
      protocolFeeBps < 0n ||
      creatorFeeBps < 0n ||
      protocolFeeBps + creatorFeeBps > 2000n
    )
      throw Error("Unsupported fee rate");
    const accounts = provenance(batch);
    const digest = createHash("sha256")
      .update(JSON.stringify({ slot: batch.contextSlot, accounts }))
      .digest("hex");
    return {
      venue: this.venue,
      launch,
      provider: batch.provider,
      slot: batch.contextSlot,
      commitment: "finalized",
      retrievedAt: batch.retrievedAt,
      retrievedMono: batch.retrievedMono,
      digest,
      revision:
        "pump-public-docs@639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22; pump-sdk@4.3.1",
      mint: mintAddress,
      decimals: m.decimals,
      supply: m.supply,
      baseReserve,
      quoteReserve,
      liquidityLamports: realQuote,
      protocolFeeBps,
      creatorFeeBps,
      accounts,
      source: "https://www.npmjs.com/package/@pump-fun/pump-sdk/v/4.3.1",
      signals: {
        ...m.signals,
        mintDecimals: verified(
          {
            decimals: m.decimals,
            program: m.program,
            supply: m.supply.toString(),
          },
          "Mint account decimals, program and integer supply",
          batch.contextSlot,
        ),
        feeSchedule: verified(
          {
            threshold: tier.market_cap_lamports_threshold,
            protocolFeeBps: protocolFeeBps.toString(),
            creatorFeeBps: creatorFeeBps.toString(),
            globalConfigurable: global.creator_fee_configurable,
            curveCreatorFeeBps: curve.creator_fee_bps,
          },
          "Selected on-chain fee tier and creator override",
          batch.contextSlot,
        ),
        custody: verified(
          {
            tokenAccount: ata,
            tokenAtoms: custody.toString(),
            solLamports: String(lamports),
            realQuoteLamports: realQuote.toString(),
            creatorFeeLamports: curve.creator_fee,
            protocolFeeLamports: curve.protocol_fees,
          },
          "Actual custody covers claimed real reserves and fee buckets",
          batch.contextSlot,
        ),
        realTokenReserves: verified(
          realBase.toString(),
          "Curve and token custody reconciled",
          batch.contextSlot,
        ),
        liquidity: verified(
          realQuote.toString(),
          "Real SOL reserves; virtual SOL excluded",
          batch.contextSlot,
        ),
        holderConcentration: holderKeys.length
          ? concentration(batch, holderKeys, mintAddress, m.program, m.supply, [
              ata,
            ])
          : unknown(
              "Complete holder enumeration unavailable; largest accounts cannot establish owner concentration",
            ),
        creatorHistory: unknown(
          "Creator trading history has not been independently established",
        ),
        liquidityChanges: unknown(
          "First observation; no prior reserve evidence",
        ),
        protocolVersion: verified(
          "166/1045|1088/2512|4073|4097",
          "Strict pinned account variants; upgrade drift must be separately checked",
          batch.contextSlot,
        ),
      },
    };
  }
  quote(
    state: MarketState,
    side: Quote["side"],
    input: bigint,
    slippageBps: number,
    now = performance.now(),
  ): Quote {
    if (
      state.signals.transferRestrictions?.status !== "verified" ||
      state.signals.transferRestrictions.value !== false
    )
      throw Error("Unsupported token transfer restrictions; quote unavailable");
    if (
      state.venue !== this.venue ||
      input <= 0n ||
      input > (1n << 64n) - 1n ||
      !Number.isInteger(slippageBps) ||
      slippageBps < 0 ||
      slippageBps > 2000 ||
      now < state.retrievedMono ||
      now - state.retrievedMono > 1500
    )
      throw Error("Invalid amount, slippage or stale market state");
    let output: bigint, fee: bigint, gross: bigint;
    if (side === "buy") {
      const netBudget =
        ((input - 1n) * 10000n) /
        (10000n + state.protocolFeeBps + state.creatorFeeBps);
      output =
        (netBudget * state.baseReserve) / (state.quoteReserve + netBudget);
      const realBase = BigInt(state.signals.realTokenReserves.value as string);
      // Completion/migration and fee tier crossings need a separate execution model.
      if (output >= realBase || output <= 0n)
        throw Error("Insufficient token liquidity or curve completion");
      gross = (output * state.quoteReserve) / (state.baseReserve - output) + 1n;
      fee =
        ceilDiv(gross * state.protocolFeeBps, 10000n) +
        ceilDiv(gross * state.creatorFeeBps, 10000n);
      if (gross + fee > input)
        throw Error("Buy budget cannot cover exact rounded fees");
    } else {
      gross = (input * state.quoteReserve) / (state.baseReserve + input);
      fee =
        ceilDiv(gross * state.protocolFeeBps, 10000n) +
        ceilDiv(gross * state.creatorFeeBps, 10000n);
      output = gross - fee;
      if (gross > state.liquidityLamports || output <= 0n)
        throw Error("Unavailable sell route or insufficient real SOL reserves");
    }
    const spotOutput =
      side === "buy"
        ? (input * state.baseReserve) / state.quoteReserve
        : (input * state.quoteReserve) / state.baseReserve;
    const impactBps =
      spotOutput > 0n && spotOutput > output
        ? ceilDiv((spotOutput - output) * 10000n, spotOutput)
        : 0n;
    return {
      side,
      input,
      output,
      minimumOutput: (output * BigInt(10000 - slippageBps)) / 10000n,
      poolFee: fee,
      poolFeeAsset: SOL,
      impactBps,
      stateDigest: state.digest,
      slot: state.slot,
      provider: state.provider,
      computedMono: now,
      expiresMono: state.retrievedMono + 1500,
      kind: "account-state-estimate",
    };
  }
}
