import { transactionIdentityIssue } from './wire-identity.js';

/** Delivery evidence only. Verified receipts never certify finalized history or provider authority. */
export class VenueFeedHealth {
  private rows = new Map<string, { acknowledgedAt?: number; firstReceiptAt?: number;
    lastReceiptAt?: number; lastValidReceiptAt?: number; notifications: number; invalidIdentities: number }>();
  constructor(venues: readonly string[], private staleMs = 30000) {
    if (!venues.length || new Set(venues).size !== venues.length ||
        !Number.isSafeInteger(staleMs) || staleMs < 1) throw Error('Venue delivery bounds');
    for (const venue of venues) this.rows.set(venue, { notifications: 0, invalidIdentities: 0 });
  }
  /** A new connection discards all prior ACK and receipt freshness evidence. */
  reset() {
    for (const row of this.rows.values()) {
      delete row.acknowledgedAt; delete row.firstReceiptAt; delete row.lastReceiptAt;
      delete row.lastValidReceiptAt;
    }
  }
  acknowledged(now: number) {
    if (!Number.isFinite(now) || now < 0) throw Error('Invalid delivery clock');
    for (const row of this.rows.values()) row.acknowledgedAt = now;
  }
  receipt(venue: string, signature: unknown, now: number) {
    const row = this.rows.get(venue);
    if (!row || !Number.isFinite(now) || now < 0) throw Error('Invalid venue receipt');
    row.notifications++; row.firstReceiptAt ??= now; row.lastReceiptAt = now;
    if (transactionIdentityIssue(signature)) row.invalidIdentities++;
    else row.lastValidReceiptAt = now;
  }
  snapshot(now: number, connected: boolean) {
    return Object.fromEntries([...this.rows].map(([venue, row]) => {
      const age = row.lastValidReceiptAt === undefined ? null : now - row.lastValidReceiptAt;
      const ackAge = row.acknowledgedAt === undefined ? null : now - row.acknowledgedAt;
      const fresh = connected && ackAge !== null && ackAge >= 0 && age !== null &&
        age >= 0 && age <= this.staleMs;
      const status = !connected ? 'unhealthy' : fresh ? 'verified' :
        ackAge !== null && ackAge > this.staleMs ? 'degraded' : 'unknown';
      return [venue, { ...row, status, assessedAtMonoMs: now,
        validReceiptAgeMs: age, allowDelivery: fresh,
        evidence: fresh ? 'Fresh valid-identity receipt on current acknowledged connection; delivery only' :
          'Missing current valid-identity delivery; ACK and other-venue traffic are insufficient',
        invalidIdentityRate: row.notifications ? row.invalidIdentities / row.notifications : null,
        denominator: 'Normalized delivered notifications, including invalid identities; not chain events' }];
    }));
  }
}
