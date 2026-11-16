import type { FreshnessPolicy } from "../freshness.js";
/** Entry-only policies. Neither profile changes quote expiry or mandatory safety signals. */
export interface MarketPolicy extends FreshnessPolicy {
  readonly name: "strict-finalized" | "finalized-paper-research";
  readonly requiredCommitment: "finalized";
  readonly maxMarketSlotLag: number;
  readonly allowHistorical: false;
}
export const STRICT_MARKET_POLICY: Readonly<MarketPolicy> = Object.freeze({
  name: "strict-finalized", requiredCommitment: "finalized",
  maxReceiptAgeMs: 5000, maxEventAgeMs: 5000, maxSlotLag: 8,
  maxMarketSlotLag: 8, allowHistorical: false,
});
export function marketPolicy(name = "strict-finalized"): Readonly<MarketPolicy> {
  if (name === "strict-finalized") return STRICT_MARKET_POLICY;
  if (name !== "finalized-paper-research") throw Error("Unknown market research policy");
  return Object.freeze({ name, requiredCommitment: "finalized", maxReceiptAgeMs: 60000,
    maxEventAgeMs: 60000, maxSlotLag: 160, maxMarketSlotLag: 160, allowHistorical: false });
}
