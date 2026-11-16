export interface EventFreshness {
  origin: "live" | "history" | "restart";
  receiptAt: number;
  eventSlot: number;
  chainHeadSlot: number | null;
  eventTimeMs?: number;
}
export interface FreshnessPolicy {
  maxReceiptAgeMs: number;
  maxSlotLag: number;
  allowHistorical: boolean;
  maxEventAgeMs?: number;
}
export function freshnessReasons(
  event: EventFreshness | undefined,
  policy: FreshnessPolicy,
  now: number,
): string[] {
  if (!event) return ["Launch freshness unavailable"];
  const r: string[] = [];
  if (event.origin !== "live" && !policy.allowHistorical)
    r.push("Historical or resumed launch");
  if (
    !Number.isFinite(event.receiptAt) ||
    event.receiptAt > now ||
    now - event.receiptAt > policy.maxReceiptAgeMs
  )
    r.push("Stale launch receipt");
  if (
    event.chainHeadSlot === null ||
    event.eventSlot > event.chainHeadSlot ||
    event.chainHeadSlot - event.eventSlot > policy.maxSlotLag
  )
    r.push("Unknown or stale launch slot");
  if (
    policy.maxEventAgeMs !== undefined &&
    (event.eventTimeMs === undefined ||
      event.eventTimeMs > now ||
      now - event.eventTimeMs > policy.maxEventAgeMs)
  )
    r.push("Unknown or stale chain event time");
  return r;
}
