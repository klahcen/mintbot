import type { VerifiedLaunch, AccountEvidence } from "../verified-decoders.js";
export type EvidenceStatus = "verified" | "unknown" | "stale" | "failed";
export interface Signal<T = unknown> {
  status: EvidenceStatus;
  value?: T;
  reason: string;
  slot?: number;
  observedAt?: number;
  ageMs?: number;
  provider?: string;
  commitment?: "processed" | "confirmed" | "finalized" | "mixed" | "unknown";
  basis?: string;
}
export interface MarketBatch extends AccountEvidence {
  provider: string;
  retrievedAt: number;
  retrievedMono: number;
}
export interface MarketReader {
  readonly provider: string;
  accounts(keys: string[], minimumSlot: number, options?: { fresh: true }): Promise<MarketBatch>;
  largest(
    mint: string,
    minimumSlot: number,
  ): Promise<{ slot: number; amounts: string[] }>;
  holders?(
    mint: string,
    program: string,
    minimumSlot: number,
  ): Promise<string[]>;
  fees?(
    addresses: string[],
  ): Promise<
    Signal<{
      baseLamports: string;
      priorityLamports: string;
      rentLamports: string;
      computeUnitLimit: number;
      observedAt: number;
    }>
  >;
  deployment?(program: string, minimumSlot: number): Promise<Signal>;
}
/** Account-only inspection is not a creation proof and cannot enter paper trading. */
export type MarketInspection = Omit<VerifiedLaunch, "signature" | "creationCommitment" | "freshness"> & {
  purpose: "market-inspection";
  signature?: never;
  creationCommitment?: never;
  freshness?: never;
};
export type MarketSubject = VerifiedLaunch | MarketInspection;
export interface MarketState<T extends MarketSubject = VerifiedLaunch> {
  venue: string;
  launch: T;
  provider: string;
  slot: number;
  commitment: "finalized";
  retrievedAt: number;
  retrievedMono: number;
  digest: string;
  revision: string;
  mint: string;
  decimals: number;
  supply: bigint;
  baseReserve: bigint;
  quoteReserve: bigint;
  liquidityLamports: bigint;
  protocolFeeBps: bigint;
  creatorFeeBps: bigint;
  signals: Record<string, Signal>;
  accounts: { address: string; owner: string; sha256: string }[];
  source: string;
}
export interface Quote {
  side: "buy" | "sell";
  input: bigint;
  output: bigint;
  minimumOutput: bigint;
  poolFee: bigint;
  poolFeeAsset: string;
  outputFee?: { atoms: bigint; mint: string };
  impactBps: bigint;
  stateDigest: string;
  slot: number;
  provider: string;
  computedMono: number;
  expiresMono: number;
  /** Estimate against finalized reserves; never a transaction simulation or guarantee. */
  kind: "account-state-estimate";
}
export interface MarketAdapter {
  readonly venue: string;
  read(launch: VerifiedLaunch, rpc: MarketReader): Promise<MarketState>;
  quote(
    state: MarketState,
    side: Quote["side"],
    input: bigint,
    slippageBps: number,
    now?: number,
  ): Quote;
}
export const verified = <T>(
  value: T,
  reason: string,
  slot?: number,
): Signal<T> => ({ status: "verified", value, reason, slot });
export const unknown = (reason: string): Signal => ({
  status: "unknown",
  reason,
});
export const failed = (reason: string): Signal => ({
  status: "failed",
  reason,
});
export function atoms(value: string, decimals: number): bigint {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18 ||
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)
  )
    throw Error("Invalid decimal conversion");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals) throw Error("Inexact decimal conversion");
  return (
    BigInt(whole) * 10n ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0")
  );
}
export function decimal(value: bigint, decimals: number): string {
  if (value < 0n) return `-${decimal(-value, decimals)}`;
  const unit = 10n ** BigInt(decimals);
  return `${value / unit}.${(value % unit).toString().padStart(decimals, "0")}`;
}
export const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
export function publicEvidence(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
}
