import { STRICT_MARKET_POLICY, type MarketPolicy } from "./policy.js";
import { performance } from "node:perf_hooks";
import { freshnessReasons } from "../freshness.js";
import {
  verified,
  unknown,
  failed,
  type MarketState,
  type MarketSubject,
  type Signal,
  type Quote,
} from "./types.js";
export interface MarketRisk {
  signals: Record<string, Signal>;
  reasons: string[];
  eligible: boolean;
}
export function validateQuote(
  state: MarketState<MarketSubject>,
  q: Quote,
  now = performance.now(),
) {
  if (
    q.stateDigest !== state.digest ||
    q.slot !== state.slot ||
    q.provider !== state.provider ||
    q.input <= 0n ||
    q.output <= 0n ||
    q.minimumOutput <= 0n ||
    q.minimumOutput > q.output ||
    q.computedMono > now ||
    now > q.expiresMono ||
    now < state.retrievedMono ||
    now - state.retrievedMono > 1500 ||
    Date.now() < state.retrievedAt ||
    Date.now() - state.retrievedAt > 1500
  )
    throw Error("Stale quote or inconsistent market evidence");
}
export function marketRisk(
  state: MarketState<MarketSubject>,
  buy: Quote | undefined,
  sell: Quote | undefined,
  fees: Signal,
  version: Signal,
  now = Date.now(),
  policy: Readonly<MarketPolicy> = STRICT_MARKET_POLICY,
): MarketRisk {
  const signals: Record<string, Signal> = {
    ...state.signals,
    networkFees: fees,
    deployment: version,
    volumeHistory: unknown("Verified volume history unavailable"),
    momentumHistory: unknown("Verified momentum history unavailable"),
  };
  signals.creationCommitment =
    state.launch.creationCommitment === "finalized"
      ? verified("finalized", "Finalized transaction verification")
      : unknown("Finalized transaction verification unavailable");
  if (
    !state.launch.freshness ||
    state.launch.freshness.eventSlot !== state.launch.slot ||
    state.slot < state.launch.slot ||
    state.slot - state.launch.slot > policy.maxMarketSlotLag
  )
    signals.eventIdentity = failed(
      "Launch identity/slot differs from freshness or market evidence",
    );
  else
    signals.eventIdentity = verified(
      true,
      "Event slot and recent market bank agree",
    );
  const freshness = state.launch.freshness;
  const freshnessFailures = freshnessReasons(
    freshness,
    policy,
    now,
  );
  signals.freshness = !freshness
    ? unknown("Launch freshness unavailable")
    : freshnessFailures.length === 0
      ? verified(true, "Live recent receipt, slot and block time")
      : {
          status:
            freshness.origin !== "live"
              ? "failed"
              : freshness.eventTimeMs === undefined ||
                  freshness.chainHeadSlot === null
                ? "unknown"
                : "stale",
          reason: freshnessFailures.join("; "),
        };
  const feeData = fees.value as
    | { baseLamports?: string; priorityLamports?: string; observedAt?: number }
    | undefined;
  if (fees.status === "verified") {
    if (
      !feeData ||
      !/^\d{1,20}$/.test(feeData.baseLamports ?? "") ||
      !/^\d{1,20}$/.test(feeData.priorityLamports ?? "") ||
      !Number.isFinite(feeData.observedAt)
    )
      signals.networkFees = failed("Invalid fee evidence");
    else if (now < feeData.observedAt! || now - feeData.observedAt! > 5000)
      signals.networkFees = {
        status: "stale",
        reason: "Network fee evidence expired",
      };
  }
  signals.exitEconomics =
    signals.networkFees.status === "verified" &&
    sell &&
    sell.minimumOutput >
      BigInt(feeData!.baseLamports!) + BigInt(feeData!.priorityLamports!)
      ? verified(
          true,
          "Conservative sell proceeds cover estimated network costs",
        )
      : failed("Unknown or nonpositive net sell proceeds after network costs");
  signals.quoteFreshness = {
    status:
      now >= state.retrievedAt &&
      now - state.retrievedAt <= 1500 &&
      performance.now() >= state.retrievedMono &&
      performance.now() - state.retrievedMono <= 1500
        ? "verified"
        : "stale",
    reason:
      "Quote state must be at most 1500 ms old by wall and process-monotonic clocks",
  };
  for (const [name, q] of [
    ["buyRoute", buy],
    ["sellRoute", sell],
  ] as const) {
    try {
      if (!q) throw Error("Route unavailable");
      validateQuote(state, q);
      signals[name] = verified(
        {
          input: q.input.toString(),
          output: q.output.toString(),
          minimumOutput: q.minimumOutput.toString(),
        },
        "Integer account-state quote; transaction simulation remains a funded-trading blocker",
        state.slot,
      );
    } catch {
      signals[name] = failed("Missing, stale or inconsistent route");
    }
  }
  signals.priceImpact =
    buy && buy.impactBps >= 0n && buy.impactBps <= 500n && sell && sell.impactBps >= 0n && sell.impactBps <= 500n
      ? verified(
          {
            buyBps: buy.impactBps.toString(),
            sellBps: sell.impactBps.toString(),
          },
          "Conservative all-in spot-to-quote shortfall including fees; maximum 500 bps per side",
          state.slot,
        )
      : failed("Unknown or excessive estimated impact");
  for (const key of [
    "mintAuthority",
    "freezeAuthority",
    "transferRestrictions",
  ])
    if (signals[key]?.status === "verified" && signals[key].value !== false)
      signals[key] = failed("Mandatory safety value is not verified false");
  const holder = signals.holderConcentration;
  if (
    holder?.status === "verified" &&
    (!Number.isSafeInteger((holder.value as any)?.topOwnerBps) ||
      (holder.value as any)?.topOwnerBps < 0 ||
      (holder.value as any)?.topOwnerBps > 2000)
  )
    signals.holderConcentration = failed(
      "Largest observed owner exceeds 20% of circulating supply",
    );
  const required = [
    "mintAuthority",
    "freezeAuthority",
    "transferRestrictions",
    "holderConcentration",
    "liquidity",
    "buyRoute",
    "sellRoute",
    "priceImpact",
    "freshness",
    "quoteFreshness",
    "networkFees",
    "deployment",
    "eventIdentity",
    "creationCommitment",
    "exitEconomics",
  ];
  const reasons = required
    .filter((k) => signals[k]?.status !== "verified")
    .map(
      (k) =>
        `${k}: ${signals[k]?.status ?? "unknown"} (${signals[k]?.reason ?? "Evidence unavailable"})`,
    );
  if (signals.quoteVariant && signals.quoteVariant.status !== "verified")
    reasons.push(signals.quoteVariant.reason);
  if (signals.liquidityChanges?.status === "failed")
    reasons.push(signals.liquidityChanges.reason);
  if (BigInt((signals.liquidityChanges?.value as any)?.dropBps ?? 0) > 5000n)
    reasons.push("Verified liquidity dropped more than 50%");
  for (const [key, signal] of Object.entries(signals)) {
    const creation = key === "creationCommitment";
    const event = key === "freshness" || key === "eventIdentity";
    const fee = key === "networkFees";
    const observedAt = key === "deployment" ? version.observedAt : fee ? feeData?.observedAt : creation ? state.launch.verifiedAt :
      event ? state.launch.freshness?.receiptAt : signal.status === "unknown" ? undefined : state.retrievedAt;
    signals[key] = { ...signal, observedAt,
      ageMs: observedAt !== undefined ? now - observedAt : undefined,
      provider: creation ? state.launch.sourceProvider : state.provider,
      commitment: signal.status === "unknown" ? "unknown" : fee || event ? "mixed" :
        creation ? (state.launch.creationCommitment ?? "unknown") : state.commitment,
      basis: fee ? "Base fee at finalized context plus recent prioritization sample and modeled CU/rent" :
        creation ? "Finalized creation verification" : event ? "Receipt age and finalized creation slot/block time" :
        key === "deployment" ? "Separately retrieved deployment header; see nested signal slots" :
        "Derived from current finalized market account batch; unknown signals remain unknown",
    };
  }
  return { signals, reasons, eligible: reasons.length === 0 };
}
