import { PublicKey } from "@solana/web3.js";
import { EventIngestion } from "./ingestion.js";
import { VERIFIED_PROGRAMS, type ProgramObservation } from "./chain.js";
import { eventIdentity, type Anchor, type Gap } from "./event-journal.js";
import { telemetry, type Telemetry } from "./telemetry.js";
export interface SignatureInfo {
  signature: string;
  slot: number;
  err: unknown;
}
export interface HistoricalTransaction {
  slot: number;
  meta: { err: unknown; logMessages: string[] | null } | null;
  transaction: {
    signatures: string[];
    message: { accountKeys: (string | { pubkey: string })[] };
  };
}
export interface RecoveryRpc {
  getSlot(): Promise<number>;
  getSignaturesForAddress(
    address: string,
    options: { before?: string; limit: number },
  ): Promise<SignatureInfo[]>;
  getTransaction(signature: string): Promise<HistoricalTransaction | null>;
}
export class RecoveryRpcError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly retryAfterMs = 0,
  ) {
    super("Read-only recovery RPC failed");
  }
}
/** Only read-only supported RPC methods, bounded response size and abortable request lifetime. */
export class HttpRecoveryRpc implements RecoveryRpc {
  private sequence = 0;
  constructor(
    private url: string,
    private timeoutMs = 5000,
    private maxResponseBytes = 4 * 1024 * 1024,
    private commitment: "confirmed" | "finalized" = "confirmed",
  ) {
    const parsed = new URL(url);
    if (
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 60000 ||
      !Number.isSafeInteger(maxResponseBytes) ||
      maxResponseBytes < 1 ||
      maxResponseBytes > 16 * 1024 * 1024
    )
      throw Error("Invalid recovery HTTP bound");
    if (!["https:", "http:"].includes(parsed.protocol))
      throw Error("Invalid recovery RPC URL");
  }
  private async call<T>(method: string, params: unknown[]): Promise<T> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: ++this.sequence,
        method,
        params,
      }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      const retry = response.headers.get("retry-after");
      const parsed = retry
        ? Number.isFinite(Number(retry))
          ? Number(retry) * 1000
          : Math.max(0, Date.parse(retry) - Date.now())
        : 0;
      throw new RecoveryRpcError(
        response.status === 429 || response.status >= 500,
        Number.isFinite(parsed) ? parsed : 0,
      );
    }
    const reader = response.body?.getReader();
    if (!reader) throw new RecoveryRpcError(true);
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > this.maxResponseBytes) {
          await reader.cancel();
          throw new RecoveryRpcError(false);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.error)
      throw new RecoveryRpcError([-32005, -32004].includes(body.error.code));
    return body.result as T;
  }
  getSlot() {
    return this.call<number>("getSlot", [{ commitment: this.commitment }]);
  }
  getSignaturesForAddress(
    address: string,
    options: { before?: string; limit: number },
  ) {
    new PublicKey(address);
    return this.call<SignatureInfo[]>("getSignaturesForAddress", [
      address,
      { ...options, commitment: this.commitment },
    ]);
  }
  getTransaction(signature: string) {
    return this.call<HistoricalTransaction | null>("getTransaction", [
      signature,
      {
        encoding: "jsonParsed",
        commitment: this.commitment,
        maxSupportedTransactionVersion: 1,
      },
    ]);
  }
}
export interface BackfillOptions {
  onProgress?: (progress: {program:string;target:number;fromSlot:number;pages:number;cursor:string;retrieved:number;duplicates:number;unavailable:number;anchorSeen:boolean;boundary:boolean}) => Promise<void>;
  pageSize?: number;
  maxPages?: number;
  maxTransactions?: number;
  maxWindowSlots?: number;
  overlapSlots?: number;
  concurrency?: number;
  retries?: number;
  retryBaseMs?: number;
  maxRetryDelayMs?: number;
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
}
export interface BackfillResult {
  status: "recovered" | "partial" | "unrecoverable";
  program: string;
  fromSlot: number;
  toSlot: number;
  pages: number;
  retrieved: number;
  duplicates: number;
  unavailable: number;
  reason: string;
}
/** One bounded scan. Coverage is provider-reported, not a cryptographic proof of complete chain history. */
export async function recoverGap(
  pipeline: EventIngestion,
  rpc: RecoveryRpc,
  program: string,
  anchor: Anchor | undefined,
  options: BackfillOptions = {},
): Promise<BackfillResult> {
  const metrics = pipeline.metrics;
  const definition = VERIFIED_PROGRAMS.find((p) => p.name === program);
  if (!definition) throw Error("Unverified backfill program");
  const pageSize = options.pageSize ?? 100,
    maxPages = options.maxPages ?? 20,
    maxTransactions = options.maxTransactions ?? 2000,
    maxWindow = options.maxWindowSlots ?? 10000,
    overlap = options.overlapSlots ?? 32,
    concurrency = options.concurrency ?? 4,
    retries = options.retries ?? 2;
  for (const n of [pageSize, maxPages, maxTransactions, maxWindow, concurrency])
    if (!Number.isSafeInteger(n) || n < 1)
      throw Error("Invalid recovery bounds");
  if (
    pageSize > 1000 ||
    maxPages > 100 ||
    maxTransactions > 10000 ||
    concurrency > 16 ||
    !Number.isSafeInteger(overlap) ||
    overlap < 0 ||
    !Number.isSafeInteger(retries) ||
    retries < 0 ||
    retries > 5
  )
    throw Error("Recovery bounds exceeded");
  const deadline = Date.now() + (options.deadlineMs ?? 30000),
    pause = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const call = async <T>(method: string, fn: () => Promise<T>): Promise<T> => {
    for (let attempt = 0; ; attempt++) {
      if (Date.now() > deadline) throw new RecoveryRpcError(false);
      try {
        return await metrics.rpc(method, fn);
      } catch (error) {
        const retryable =
          error instanceof RecoveryRpcError ? error.retryable : true;
        const requested =
          error instanceof RecoveryRpcError ? error.retryAfterMs : 0;
        const wait = Math.max(
          requested,
          Math.min(1000, (options.retryBaseMs ?? 25) * 2 ** attempt),
        );
        if (
          !retryable ||
          attempt >= retries ||
          wait > (options.maxRetryDelayMs ?? 5000) ||
          Date.now() + wait > deadline
        )
          throw error;
        metrics.increment("backfill.retries");
        await pause(wait);
      }
    }
  };
  let target = 0;
  const result: BackfillResult = {
    status: "partial",
    program,
    fromSlot: 0,
    toSlot: 0,
    pages: 0,
    retrieved: 0,
    duplicates: 0,
    unavailable: 0,
    reason: "not-started",
  };
  let gap: Gap | undefined;
  const accepted = new Set<string>();
  let boundary = false,
    anchorSeen = !anchor,
    exhausted = false;
  const previousGap = pipeline.journal.gaps.get(program);
  gap = pipeline.recordGap(
    program,
    previousGap?.fromSlot ?? Math.max(0, (anchor?.slot ?? 0) - overlap),
    previousGap?.toSlot ?? anchor?.slot ?? 0,
    "recovery-attempt",
    anchor,
  );
  if (gap) {
    gap = { ...gap, status: "recovering", attempts: gap.attempts + 1 };
    pipeline.journal.updateGap(gap);
  }
  try {
    if (!gap) throw new RecoveryRpcError(false);
    target = await call("getSlot", () => rpc.getSlot());
    if (!Number.isSafeInteger(target) || target < 0)
      throw new RecoveryRpcError(false);
    if (anchor && target < anchor.slot) {
      result.reason = "provider-behind-checkpoint";
      throw new RecoveryRpcError(false);
    }
    const prior = pipeline.journal.gaps.get(program);
    const requestedFrom =
      prior && prior.status !== "recovered"
        ? prior.fromSlot
        : Math.max(0, (anchor?.slot ?? target) - overlap);
    result.fromSlot = Math.max(requestedFrom, Math.max(0, target - maxWindow));
    result.toSlot = target;
    const truncated = result.fromSlot > requestedFrom;
    gap = pipeline.recordGap(
      program,
      result.fromSlot,
      target,
      "reconnect-or-capacity-gap",
      anchor,
    );
    if (gap) {
      gap = { ...gap, status: "recovering" };
      pipeline.journal.updateGap(gap);
    }
    let before: string | undefined;
    const cursors = new Set<string>();
    let scanned = 0;
    let previousSlot = Infinity;
    for (let page = 0; page < maxPages; page++) {
      const rows = await call("getSignaturesForAddress", () =>
        rpc.getSignaturesForAddress(definition.address, {
          before,
          limit: pageSize,
        }),
      );
      result.pages++;
      if (!Array.isArray(rows) || rows.length > pageSize)
        throw new RecoveryRpcError(false);
      if (!rows.length) {
        exhausted = true;
        break;
      }
      const within: SignatureInfo[] = [];
      for (const row of rows) {
        if (row.slot > previousSlot) throw new RecoveryRpcError(false);
        previousSlot = row.slot;
        if (
          typeof row.signature !== "string" ||
          row.signature.length > 128 ||
          !Number.isSafeInteger(row.slot) ||
          row.slot < 0
        )
          throw new RecoveryRpcError(false);
        if (row.signature === anchor?.signature) anchorSeen = true;
        if (row.slot < result.fromSlot) {
          boundary = true;
          continue;
        }
        if (row.slot <= target) {
          if (++scanned > maxTransactions) {
            result.reason = "transaction-cap";
            break;
          }
          within.push(row);
        }
      }
      for (
        let offset = 0;
        offset < within.length;
        offset += Math.min(concurrency, pipeline.journal.maxPending)
      ) {
        const batch = within.slice(
          offset,
          offset + Math.min(concurrency, pipeline.journal.maxPending),
        );
        if (
          pipeline.journal.pending.size >
          pipeline.journal.maxPending - batch.length
        )
          await pipeline.drain(Math.max(1, deadline - Date.now()));
        await Promise.all(
          batch.map(async (row) => {
            try {
              const identity = eventIdentity({
                program,
                signature: row.signature,
              });
              if (
                pipeline.journal.pending.has(identity) ||
                pipeline.journal.completed.has(identity)
              ) {
                result.duplicates++;
                accepted.add(identity);
                return;
              }
              const tx = await call("getTransaction", async () => {
                const value = await rpc.getTransaction(row.signature);
                if (!value) throw new RecoveryRpcError(true);
                return value;
              });
              if (
                !tx.meta ||
                !Array.isArray(tx.meta.logMessages) ||
                tx.slot !== row.slot ||
                !tx.transaction?.signatures?.includes(row.signature) ||
                !tx.transaction.message.accountKeys.some(
                  (k) =>
                    (typeof k === "string" ? k : k.pubkey) ===
                    definition.address,
                )
              )
                throw new RecoveryRpcError(false);
              const event: ProgramObservation = {
                program,
                signature: row.signature,
                slot: row.slot,
                logs: tx.meta.logMessages,
                failed: tx.meta.err !== null,
                observedAt: Date.now(),
              };
              const offered = await pipeline.acceptDurable(event, "history");
              if (offered.status === "duplicate") result.duplicates++;
              else if (offered.status === "unrecoverable") result.unavailable++;
              if (offered.id) accepted.add(offered.id);
              result.retrieved++;
            } catch {
              result.unavailable++;
              metrics.increment("backfill.unavailable");
            }
          }),
        );
      }
      await options.onProgress?.({program,target,fromSlot:result.fromSlot,pages:result.pages,cursor:rows.at(-1)!.signature,retrieved:result.retrieved,duplicates:result.duplicates,unavailable:result.unavailable,anchorSeen,boundary});
      if (scanned > maxTransactions) break;
      if (boundary) break;
      const cursor = rows.at(-1)!.signature;
      if (cursors.has(cursor)) {
        result.reason = "non-advancing-pagination";
        break;
      }
      cursors.add(cursor);
      before = cursor;
    }
    await pipeline.drain(Math.max(1, deadline - Date.now()));
    const unfinished = [...accepted].filter((id) =>
      pipeline.journal.pending.has(id),
    );
    const complete =
      anchor !== undefined &&
      anchorSeen &&
      boundary &&
      !truncated &&
      result.unavailable === 0 &&
      unfinished.length === 0;
    result.status = complete ? "recovered" : "partial";
    result.reason = complete
      ? "provider-window-covered"
      : result.reason !== "not-started"
        ? result.reason
        : truncated
          ? "slot-window-cap"
          : !boundary && !exhausted
            ? "pagination-cap"
            : !anchor
              ? "no-trusted-anchor"
              : !anchorSeen
                ? "anchor-unavailable"
                : result.unavailable
                  ? "transaction-data-unavailable"
                  : unfinished.length
                    ? "processing-incomplete"
                    : exhausted
                      ? "retention-or-boundary-unavailable"
                      : "pagination-cap";
  } catch {
    result.status = "unrecoverable";
    if (result.reason === "not-started")
      result.reason = "rpc-or-processing-budget-exhausted";
  }
  if (gap) {
    const latest = pipeline.journal.gaps.get(program) ?? gap;
    if (
      result.status === "recovered" &&
      (latest.toSlot > target ||
        latest.fromSlot < result.fromSlot ||
        latest.knownRefused > gap.knownRefused)
    ) {
      result.status = "partial";
      result.reason = "gap-expanded-during-scan";
    }
    pipeline.journal.updateGap({
      ...latest,
      status: result.status,
      reason: result.reason,
      attempts: Math.max(latest.attempts, gap.attempts),
    });
  }
  await pipeline.journal.flush();
  metrics.increment(`backfill.${result.status}`);
  return result;
}
/** Coalesces requests per verified program. At most one scan runs globally and four requests can wait. */
export class RecoveryCoordinator {
  private queued = new Map<string, Anchor | undefined>();
  private running: Promise<void> | undefined;
  private closed = false;
  constructor(
    private pipeline: EventIngestion,
    private rpc: RecoveryRpc,
    private options: BackfillOptions = {},
  ) {}
  request(program: string, anchor?: Anchor) {
    if (arguments.length < 2) {
      const existingGap = this.pipeline.journal.gaps.get(program);
      anchor = existingGap
        ? existingGap.anchor
        : this.pipeline.journal.anchors.get(program);
    }
    if (this.closed) return;
    if (!VERIFIED_PROGRAMS.some((p) => p.name === program))
      throw Error("Unverified recovery program");
    const existing = this.queued.get(program);
    if (
      !this.queued.has(program) ||
      (existing !== undefined && (!anchor || anchor.slot < existing.slot))
    )
      this.queued.set(program, anchor);
    if (!this.running)
      this.running = this.run().finally(() => {
        this.running = undefined;
        if (this.queued.size && !this.closed)
          this.request(this.queued.keys().next().value!);
      });
  }
  private async run() {
    while (this.queued.size && !this.closed) {
      const [program, anchor] = this.queued.entries().next().value!;
      this.queued.delete(program);
      const gap = this.pipeline.journal.gaps.get(program);
      if ((gap?.attempts ?? 0) >= 3) {
        this.pipeline.metrics.increment("backfill.cycle_budget_exhausted");
        continue;
      }
      try {
        const result = await recoverGap(
          this.pipeline,
          this.rpc,
          program,
          anchor,
          this.options,
        );
        const current = this.pipeline.journal.gaps.get(program);
        if (current && result.status !== "recovered")
          this.pipeline.journal.updateGap({
            ...current,
            status: current.attempts >= 3 ? "unrecoverable" : "partial",
            reason:
              current.attempts >= 3
                ? "cycle-budget-exhausted:" + result.reason
                : result.reason,
          });
      } catch {
        this.pipeline.metrics.increment("backfill.coordinator_errors");
      }
    }
  }
  async drain() {
    await this.running;
  }
  async close() {
    this.closed = true;
    this.queued.clear();
    await this.running;
  }
}
