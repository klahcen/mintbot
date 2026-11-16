/** Transport observations only. Success never establishes coverage or provider independence. */
export class RpcHealth {
  private successes = 0;
  private errors = 0;
  private rateLimits = 0;
  private consecutiveErrors = 0;
  private lastSuccessAt?: number;
  private lastFailureAt?: number;
  private lastHttpStatus?: number;
  private lastRpcCode?: number;
  success(now = Date.now()) { this.successes++; this.consecutiveErrors = 0; this.lastSuccessAt = now; }
  failure(detail: {httpStatus?: number; rpcCode?: number}, now = Date.now()) {
    this.errors++; this.consecutiveErrors++; this.lastFailureAt = now;
    if (detail.httpStatus === 429) this.rateLimits++;
    this.lastHttpStatus = detail.httpStatus; this.lastRpcCode = detail.rpcCode;
  }
  snapshot(now = Date.now()) {
    return { status: this.consecutiveErrors ? 'failed' as const : this.lastSuccessAt === undefined ? 'unknown' as const :
      now < this.lastSuccessAt || now - this.lastSuccessAt > 30000 ? 'stale' as const : 'healthy' as const,
      successes: this.successes, errors: this.errors, rateLimits: this.rateLimits, consecutiveErrors: this.consecutiveErrors,
      lastSuccessAt: this.lastSuccessAt, lastFailureAt: this.lastFailureAt,
      lastHttpStatus: this.lastHttpStatus, lastRpcCode: this.lastRpcCode,
      coverageVerified: false as const };
  }
}
