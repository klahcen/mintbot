/** Transport freshness and durable processing coverage are separate admission requirements. */
export function researchCoverage(
  feed: { liveReady: boolean },
  journal: { gaps: { status: string }[]; quarantined: number; writerFailure?: unknown; unverifiableIdentities?: number },
  fatal?: string | null,
): { status: "verified" | "unknown" | "failed"; reasons: string[] } {
  const reasons: string[] = [];
  if (!feed.liveReady) reasons.push("Research notification receipt unavailable or stale");
  if (journal.gaps.some(gap => gap.status !== "recovered")) reasons.push("Research chain coverage unresolved");
  if (journal.quarantined !== 0) reasons.push("Research observations quarantined; processing coverage unknown");
  if (journal.unverifiableIdentities !== undefined && (!Number.isSafeInteger(journal.unverifiableIdentities) || journal.unverifiableIdentities !== 0)) reasons.push("Unverifiable transaction identities require independent review");
  if (journal.writerFailure || fatal) reasons.push("Research durable ingestion failed");
  return { status: journal.writerFailure || fatal ? "failed" : reasons.length ? "unknown" : "verified", reasons };
}
