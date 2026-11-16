import { freshnessReasons } from "./freshness.js";
import { telemetry, type Telemetry } from "./telemetry.js";
import type { Launch, State, Strategy, Position } from "./model.js";
export function assess(l: Launch, metrics: Telemetry = telemetry) {
  return metrics.measure("risk_evaluation_ms", () => assessImpl(l));
}
function assessImpl(l: Launch) {
  let score = 0;
  const reasons: string[] = [];
  const add = (n: number, s: string) => {
    score += n;
    reasons.push(s);
  };
  if (l.mintAuthority !== false) add(30, "Mint authority present or unknown");
  if (l.freezeAuthority !== false)
    add(30, "Freeze authority present or unknown");
  if (l.restricted !== false)
    add(40, "Transfer restrictions present or unknown");
  if (l.sellSimulation !== true)
    add(25, "Sell simulation failed or unavailable");
  if (l.topHolderPct === null) add(20, "Holder concentration unknown");
  else if (l.topHolderPct > 20) add(25, "Top holder exceeds 20%");
  if (l.liquiditySol <= 0) add(40, "No verified liquidity");
  return { score: Math.min(100, score), reasons };
}
export function decision(
  l: Launch,
  s: State,
  c: Strategy,
  now = Date.now(),
  metrics: Telemetry = telemetry,
): string[] {
  return metrics.measure("strategy_decision_ms", () =>
    decisionImpl(l, s, c, now, metrics),
  );
}
function decisionImpl(
  l: Launch,
  s: State,
  c: Strategy,
  now: number,
  metrics: Telemetry,
): string[] {
  const r: string[] = [];
  if (l.source === "verified" || l.freshness)
    r.push(
      ...freshnessReasons(
        l.freshness,
        c.freshness ?? {
          maxReceiptAgeMs: 5000,
          maxSlotLag: 8,
          allowHistorical: false,
        },
        now,
      ),
    );
  const risk = assess(l, metrics);
  if (
    l.mintAuthority !== false ||
    l.freezeAuthority !== false ||
    l.restricted !== false ||
    l.sellSimulation !== true
  )
    r.push("Mandatory token safety");
  if (!s.running || s.killed || !c.enabled) r.push("Trading disabled");
  if (s.failures >= c.maxFailures) r.push("Failure circuit breaker");
  if (
    !Number.isFinite(l.priceSol) ||
    l.priceSol <= 0 ||
    l.priceAt > now ||
    now - l.priceAt > c.maxPriceAgeMs
  )
    r.push("Invalid or stale price");
  if (now - l.detectedAt < c.delayMs) r.push("Entry delay");
  if (
    (c.kind === "launch" && l.kind !== "launch") ||
    (c.kind === "pool" && l.kind !== "pool")
  )
    r.push("Event kind");
  if (c.kind === "momentum" && l.momentumBps < c.minMomentumBps)
    r.push("Momentum");
  if (l.liquiditySol < c.minLiquiditySol) r.push("Liquidity");
  if (l.marketCapSol < c.minMarketCapSol || l.marketCapSol > c.maxMarketCapSol)
    r.push("Market cap");
  if (l.volumeSol < c.minVolumeSol) r.push("Volume");
  if (
    c.creatorBlocklist.includes(l.creator) ||
    (c.creatorAllowlist.length > 0 && !c.creatorAllowlist.includes(l.creator))
  )
    r.push("Creator policy");
  if (risk.score > c.maxRiskScore) r.push("Risk score");
  if (c.tradeSol > c.maxTradeSol) r.push("Trade limit");
  if (s.dailySpendSol + c.tradeSol + 0.00001 > c.maxDailySpendSol)
    r.push("Daily spend");
  if (s.balanceSol - c.tradeSol - 0.00001 < c.reserveSol)
    r.push("Wallet reserve");
  if (s.positions.length >= c.maxPositions) r.push("Position limit");
  if (s.positions.some((p) => p.mint === l.mint)) r.push("Already held");
  return r;
}
export function exitReason(
  p: Position,
  c: Strategy,
  now = Date.now(),
  metrics: Telemetry = telemetry,
): string | null {
  return metrics.measure("exit_decision_ms", () => exitReasonImpl(p, c, now));
}
function exitReasonImpl(p: Position, c: Strategy, now: number): string | null {
  if (now - p.priceAt > c.maxPriceAgeMs || p.priceAt > now || p.priceSol <= 0)
    return null;
  const bps = (p.priceSol / p.entryPriceSol - 1) * 10000;
  if (p.liquiditySol < p.initialLiquiditySol * 0.5) return "liquidity-drop";
  if (bps <= -c.stopLossBps) return "stop-loss";
  if (bps >= c.takeProfitBps) return "take-profit";
  if (
    c.trailingStopBps > 0 &&
    p.priceSol <= p.highPriceSol * (1 - c.trailingStopBps / 10000)
  )
    return "trailing-stop";
  if (now - p.openedAt >= c.maxHoldMs) return "time-exit";
  return null;
}
