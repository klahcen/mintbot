import { Worker } from "node:worker_threads";
import { existsSync } from "node:fs";
import {
  EventJournal,
  eventIdentity,
  type JournalOptions,
  type WorkItem,
} from "./event-journal.js";
import type { ProgramObservation } from "./chain.js";
import { telemetry, type Telemetry } from "./telemetry.js";
export interface AsyncJournalOptions extends JournalOptions {
  maxUnacked?: number;
  maxUnackedBytes?: number;
  batchSize?: number;
  batchDelayMs?: number;
  /** Deterministic fault injection for tests only; never configured from environment or API. */
  testDuplicateAcks?: boolean;
  testFault?: {
    point: "write" | "sync";
    afterBatches: number;
    code: "ENOSPC" | "EIO";
  };
}
interface Pending {
  record: unknown;
  bytes: number;
  resolve: () => void;
  reject: (e: Error) => void;
  promise: Promise<void>;
}
/** Single bounded worker. All ownership/completion promises resolve only after worker fsync. */
export class AsyncEventJournal extends EventJournal {
  private worker!: Worker;
  private waiting: Pending[] = [];
  private active: Pending[] = [];
  private outstanding = 0;
  private outstandingBytes = 0;
  private sequence = 0;
  private lastWrite: Promise<void> = Promise.resolve();
  private unowned = new Set<string>();
  private ownership = new Map<string, Promise<void>>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private watchdog: ReturnType<typeof setTimeout> | undefined;
  private control:
    | {
        id: number;
        resolve: () => void;
        reject: (e: Error) => void;
        timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  private failure: Error | undefined;
  private stopped = false;
  private disk = {
    walBytes: 0,
    truncatedTailBytes: 0,
    diskAvailableBytes: 0,
    batches: 0,
    records: 0,
  };
  private constructor(
    readonly asyncOptions: AsyncJournalOptions,
    private metrics: Telemetry,
  ) {
    super({ ...asyncOptions, path: undefined });
    for (const [value, min, max] of [
      [asyncOptions.maxUnacked ?? 1024, 1, 10000],
      [
        asyncOptions.maxUnackedBytes ?? 4 * 1024 * 1024,
        16384,
        64 * 1024 * 1024,
      ],
      [asyncOptions.batchSize ?? 64, 1, 1024],
      [asyncOptions.batchDelayMs ?? 2, 0, 100],
    ])
      if (!Number.isSafeInteger(value) || value! < min! || value! > max!)
        throw Error("Invalid async journal bounds");
    if (!asyncOptions.path || asyncOptions.durable === false)
      throw Error("Async journal requires file path and fsync durability");
  }
  static async open(
    options: AsyncJournalOptions,
    metrics: Telemetry = telemetry,
  ) {
    const j = new AsyncEventJournal(options, metrics);
    const compiled = new URL("./journal-worker.js", import.meta.url);
    j.worker = new Worker(
      existsSync(compiled)
        ? compiled
        : new URL("./journal-worker-bootstrap.mjs", import.meta.url),
      { workerData: { journal: options, testFault: options.testFault } },
    );
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(Error("Journal worker startup timeout"));
        void j.worker.terminate();
      }, 20000);
      const ready = (msg: any) => {
        if (!msg.ready) return;
        clearTimeout(timeout);
        j.worker.off("message", ready);
        try {
          j.restoreMemory(msg.snapshot);
          j.disk = msg.stats;
          resolve();
        } catch (e) {
          reject(e);
          void j.worker.terminate();
        }
      };
      j.worker.on("message", ready);
      j.worker.once("error", (e) => {
        clearTimeout(timeout);
        reject(e);
        j.fail(e);
      });
      j.worker.on("exit", (code) => {
        if (!j.stopped) j.fail(Error(`Journal worker exited (${code})`));
      });
    });
    j.worker.on("message", (msg: any) => j.ack(msg));
    return j;
  }
  override get asynchronous() {
    return true;
  }
  override get failureReason() {
    return this.failure?.message ?? null;
  }
  override isOwned(id: string) {
    return !this.unowned.has(id) && !this.failure;
  }
  override offer(
    _input: ProgramObservation,
    _origin: WorkItem["origin"] = "live",
  ): never {
    throw Error("Use await offerDurable for asynchronous journal ownership");
  }
  protected override append(record: unknown) {
    if (this.failure || this.stopped)
      throw this.failure ?? Error("Journal closed");
    const bytes = Buffer.byteLength(JSON.stringify(record));
    if (
      this.outstanding >= (this.asyncOptions.maxUnacked ?? 1024) ||
      this.outstandingBytes + bytes >
        (this.asyncOptions.maxUnackedBytes ?? 4 * 1024 * 1024)
    )
      throw Error("Journal acknowledgement capacity exhausted");
    let resolve!: () => void, reject!: (e: Error) => void;
    const promise = new Promise<void>((a, b) => {
      resolve = a;
      reject = b;
    });
    // A synchronous metadata caller may not await; errors are still surfaced through fatal state/flush.
    void promise.catch(() => {});
    this.waiting.push({ record, bytes, resolve, reject, promise });
    this.outstanding++;
    this.outstandingBytes += bytes;
    this.lastWrite = promise;
    this.metrics.adjustGauge("journal.unacked", 1);
    this.metrics.adjustGauge("journal.unacked_bytes", bytes);
    this.schedule();
  }
  private schedule() {
    if (
      this.control ||
      this.active.length ||
      this.failure ||
      !this.waiting.length
    )
      return;
    if (this.waiting.length >= (this.asyncOptions.batchSize ?? 64)) {
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      this.send();
    } else if (!this.timer)
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.send();
      }, this.asyncOptions.batchDelayMs ?? 2);
  }
  private send() {
    if (
      this.control ||
      this.active.length ||
      this.failure ||
      !this.waiting.length
    )
      return;
    this.active = this.waiting.splice(0, this.asyncOptions.batchSize ?? 64);
    const batch = ++this.sequence;
    this.worker.postMessage({
      batch,
      records: this.active.map((x) => x.record),
    });
    this.watchdog = setTimeout(() => {
      this.fail(Error("Journal acknowledgement timeout"));
      void this.worker.terminate();
    }, 30000);
  }
  private ack(msg: any) {
    if (msg.fatal) {
      this.fail(Error(`Journal persistence failed (${msg.code})`));
      return;
    }
    if (this.control && this.control.id === msg.batch) {
      const c = this.control;
      this.control = undefined;
      clearTimeout(c.timer);
      this.disk = msg.stats;
      c.resolve();
      this.schedule();
      return;
    }
    if (msg.batch !== this.sequence || !this.active.length) return;
    if (this.watchdog) clearTimeout(this.watchdog);
    this.watchdog = undefined;
    this.disk = msg.stats;
    this.metrics.increment("journal.fsync_batches");
    this.metrics.observe("journal.worker_append_ms", msg.appendMs);
    this.metrics.observe("journal.worker_fsync_ms", msg.syncMs);
    this.metrics.observe("journal.batch_records", this.active.length);
    const batch = this.active;
    this.active = [];
    for (const p of batch) {
      this.outstanding--;
      this.outstandingBytes -= p.bytes;
      this.metrics.adjustGauge("journal.unacked", -1);
      this.metrics.adjustGauge("journal.unacked_bytes", -p.bytes);
      p.resolve();
    }
    this.schedule();
  }
  private fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    if (this.control) {
      clearTimeout(this.control.timer);
      this.control.reject(error);
      this.control = undefined;
    }
    this.metrics.increment("journal.failures");
    if (this.timer) clearTimeout(this.timer);
    if (this.watchdog) clearTimeout(this.watchdog);
    for (const p of [...this.active, ...this.waiting]) p.reject(error);
    this.active = [];
    this.waiting = [];
  }
  override async offerDurable(
    input: ProgramObservation,
    origin: WorkItem["origin"] = "live",
  ) {
    if (this.failure) throw this.failure;
    let identity: string;
    try {
      identity = eventIdentity(input);
    } catch {
      return super.offer(input, origin);
    }
    if (
      !this.pending.has(identity) &&
      !this.completed.has(identity) &&
      (this.outstanding >=
        Math.max(
          1,
          Math.floor((this.asyncOptions.maxUnacked ?? 1024) * 0.75),
        ) ||
        this.outstandingBytes >
          (this.asyncOptions.maxUnackedBytes ?? 4 * 1024 * 1024) * 0.75)
    )
      return { status: "full" as const, id: identity };
    const result = super.offer(input, origin);
    if (result.status === "duplicate") {
      await this.ownership.get(result.id);
      return result;
    }
    if (result.status !== "accepted") return result;
    this.unowned.add(result.id);
    const pending = this.lastWrite;
    this.ownership.set(result.id, pending);
    try {
      await this.metrics.measureAsync(
        "journal.ownership_ack_ms",
        () => pending,
      );
      this.unowned.delete(result.id);
      this.metrics.increment("journal.ownership_acks");
      return result;
    } finally {
      this.ownership.delete(result.id);
    }
  }
  override complete(_id: string): never {
    throw Error("Use await completeDurable");
  }
  override retry(_id: string, _attempts: number, _delay: number): never {
    throw Error("Use await retryDurable");
  }
  override compact(): never {
    throw Error("Use await checkpoint");
  }
  override async completeDurable(id: string) {
    super.complete(id);
    await this.lastWrite;
    this.metrics.increment("journal.completion_acks");
  }
  override async retryDurable(
    id: string,
    maxAttempts: number,
    delayMs: number,
    failure?: import("./event-journal.js").WorkItem["lastFailure"],
  ) {
    super.retry(id, maxAttempts, delayMs, failure);
    await this.lastWrite;
  }
  override async flush() {
    if (this.failure) throw this.failure;
    while (this.active.length || this.waiting.length) {
      const last = this.lastWrite;
      this.send();
      await last;
    }
    if (this.failure) throw this.failure;
  }
  private async command(command: { compact?: boolean; close?: boolean }) {
    await this.flush();
    if (this.failure) throw this.failure;
    if (this.control) throw Error("Journal control operation already active");
    await new Promise<void>((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        this.fail(Error("Journal control timeout"));
        void this.worker.terminate();
      }, 30000);
      this.control = { id, resolve, reject, timer };
      this.worker.postMessage({ batch: id, ...command });
    });
  }
  async checkpoint() {
    await this.command({ compact: true });
  }
  override status() {
    return {
      ...super.status(),
      walBytes: this.disk.walBytes,
      truncatedTailBytes: this.disk.truncatedTailBytes,
      durable: true,
      durability:
        "worker fsync(file) + fsync(directory) before acknowledgement",
      unacknowledged: this.outstanding,
      unacknowledgedBytes: this.outstandingBytes,
      diskAvailableBytes: this.disk.diskAvailableBytes,
      fsyncBatches: this.disk.batches,
      writerFailure: this.failure?.message ?? null,
    };
  }
  override close() {
    throw Error("Use await shutdown() for async journal");
  }
  override async shutdown() {
    if (this.stopped) return;
    try {
      await this.command({ close: true });
    } finally {
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
      if (this.watchdog) clearTimeout(this.watchdog);
      await this.worker.terminate();
      super.close();
    }
  }
}
