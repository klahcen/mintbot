import {
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  writeSync,
  fsyncSync,
  renameSync,
  existsSync,
  statSync,
  mkdirSync,
  unlinkSync,
  ftruncateSync,
  constants,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { z } from "zod";
import { VERIFIED_PROGRAMS, type ProgramObservation } from "./chain.js";
export class InvalidObservationError extends Error {}
export const ObservationSchema = z
  .object({
    program: z.string().min(1).max(64),
    signature: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
    slot: z.number().int().nonnegative().safe(),
    logs: z.array(z.string().max(65536)).max(2048),
    failed: z.boolean(),
    observedAt: z.number().finite().nonnegative(),
  })
  .strict();
export interface Anchor {
  signature: string;
  slot: number;
}
export interface Gap {
  program: string;
  fromSlot: number;
  toSlot: number;
  anchor?: Anchor;
  reason: string;
  attempts: number;
  status: "pending" | "recovering" | "partial" | "recovered" | "unrecoverable";
  knownRefused: number;
}
export interface WorkItem {
  id: string;
  observation: ProgramObservation;
  origin: "live" | "history";
  attempts: number;
  notBefore: number;
  quarantined: boolean;
}
export interface JournalOptions {
  path?: string;
  maxPending?: number;
  maxCompleted?: number;
  maxBytes?: number;
  durable?: boolean;
  checksummed?: boolean;
  checkpointDurable?: boolean;
}
const programs = new Map(VERIFIED_PROGRAMS.map((p) => [p.name, p.address]));
export function eventIdentity(
  event: Pick<ProgramObservation, "program" | "signature">,
) {
  const address = programs.get(event.program);
  if (!address) throw Error("Unverified observation program");
  return `${address}:${event.signature}`;
}
export class EventJournal {
  readonly pending = new Map<string, WorkItem>();
  readonly completed = new Map<
    string,
    { program: string; slot: number; fingerprint?: string }
  >();
  readonly anchors = new Map<string, Anchor>();
  readonly gaps = new Map<string, Gap>();
  readonly floors = new Map<string, number>();
  private fd: number | undefined;
  private bytes = 0;
  private pendingBytes = 0;
  private pendingPeak = 0;
  private truncatedTailBytes = 0;
  private closed = false;
  private poisoned = false;
  readonly maxPending: number;
  readonly maxCompleted: number;
  readonly maxBytes: number;
  constructor(readonly options: JournalOptions = {}) {
    this.maxPending = options.maxPending ?? 10000;
    this.maxCompleted = Math.min(
      options.maxCompleted ?? 20000,
      Math.floor((options.maxBytes ?? 64 * 1024 * 1024) / 2048),
    );
    this.maxBytes = options.maxBytes ?? 64 * 1024 * 1024;
    for (const n of [this.maxPending, this.maxCompleted, this.maxBytes])
      if (!Number.isSafeInteger(n) || n < 1)
        throw Error("Invalid journal bound");
    if (this.maxBytes < 16384) throw Error("Journal byte bound too small");
    if (options.path) this.open(options.path);
  }
  private open(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    const lock = path + ".lock";
    try {
      const fd = openSync(lock, "wx", 0o600);
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const pid = Number(readFileSync(lock, "utf8"));
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw Error("Invalid journal lock; manual inspection required");
      try {
        process.kill(pid, 0);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ESRCH") {
          unlinkSync(lock);
          this.open(path);
          return;
        }
        throw e;
      }
      throw Error("Journal already has an active writer");
    }
    try {
      if (existsSync(path)) {
        if (statSync(path).size > this.maxBytes)
          throw Error("Journal exceeds configured bound");
        const raw = readFileSync(path);
        const end = raw.lastIndexOf(10) + 1;
        for (const line of raw.subarray(0, end).toString("utf8").split("\n"))
          if (line) {
            const parsed = JSON.parse(line);
            if (parsed.walVersion !== undefined) {
              if (
                parsed.walVersion !== 2 ||
                parsed.sha256 !==
                  createHash("sha256")
                    .update(JSON.stringify(parsed.record))
                    .digest("hex")
              )
                throw Error("WAL checksum mismatch or unsupported version");
              this.apply(parsed.record);
            } else this.apply(parsed);
          }
        this.fd = openSync(
          path,
          constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW,
        );
        if (end !== raw.length) {
          this.truncatedTailBytes = raw.length - end;
          ftruncateSync(this.fd, end);
        }
        this.bytes = end;
      } else
        this.fd = openSync(
          path,
          constants.O_WRONLY |
            constants.O_APPEND |
            constants.O_CREAT |
            constants.O_NOFOLLOW,
          0o600,
        );
      if (
        this.pending.size > this.maxPending ||
        this.completed.size > this.maxCompleted ||
        this.pendingBytes > this.maxBytes / 2
      )
        throw Error("Journal state exceeds configured bounds");
    } catch (e) {
      if (this.fd !== undefined) closeSync(this.fd);
      this.fd = undefined;
      unlinkSync(lock);
      throw e;
    }
  }
  protected append(record: unknown) {
    if (this.closed || this.poisoned) throw Error("Journal closed or poisoned");
    if (this.fd === undefined) return;
    const payload = this.options.checksummed
      ? {
          walVersion: 2,
          record,
          sha256: createHash("sha256")
            .update(JSON.stringify(record))
            .digest("hex"),
        }
      : record;
    const line = Buffer.from(JSON.stringify(payload) + "\n");
    if (line.length > this.maxBytes)
      throw Error("Journal record exceeds byte bound");
    if (this.bytes + line.length > this.maxBytes * 0.9) this.compact();
    if (this.bytes + line.length > this.maxBytes)
      throw Error("Journal capacity exhausted");
    try {
      let written = 0;
      while (written < line.length)
        written += writeSync(this.fd, line, written, line.length - written);
      this.bytes += line.length;
      if (this.options.durable !== false) fsyncSync(this.fd);
    } catch (e) {
      this.poisoned = true;
      throw e;
    }
  }
  /** Internal writer boundary: records come from the validated journal mirror. */
  persistRecord(record: unknown) {
    this.append(record);
    this.apply(record);
  }
  snapshotRecord() {
    return {
      kind: "snapshot",
      pending: [...this.pending.values()],
      completed: [...this.completed],
      anchors: [...this.anchors],
      floors: [...this.floors],
      gaps: [...this.gaps.values()],
    };
  }
  restoreMemory(record: unknown) {
    if (this.options.path) throw Error("Cannot replace file journal state");
    this.apply(record);
  }
  syncDurable() {
    if (this.fd !== undefined) fsyncSync(this.fd);
    if (this.options.path) {
      const directory = openSync(dirname(this.options.path), "r");
      try {
        fsyncSync(directory);
      } finally {
        closeSync(directory);
      }
    }
  }
  get asynchronous() {
    return false;
  }
  get failureReason(): string | null {
    return null;
  }
  isOwned(_id: string) {
    return true;
  }
  async offerDurable(
    input: ProgramObservation,
    origin: WorkItem["origin"] = "live",
  ) {
    return this.offer(input, origin);
  }
  async completeDurable(id: string) {
    this.complete(id);
  }
  async retryDurable(id: string, maxAttempts: number, delayMs: number) {
    this.retry(id, maxAttempts, delayMs);
  }
  async flush() {}
  async shutdown() {
    this.close();
  }
  private apply(record: any) {
    if (!record || typeof record !== "object")
      throw Error("Invalid journal record");
    switch (record.kind) {
      case "snapshot": {
        this.pending.clear();
        this.completed.clear();
        this.anchors.clear();
        this.gaps.clear();
        this.floors.clear();
        this.pendingBytes = 0;
        for (const item of record.pending ?? [])
          this.apply({ kind: "put", item });
        for (const [id, value] of record.completed ?? []) {
          if (
            eventIdentity({
              program: value.program,
              signature: id.split(":").at(-1)!,
            }) !== id
          )
            throw Error("Invalid completed identity");
          if (!Number.isSafeInteger(value.slot) || value.slot < 0)
            throw Error("Invalid completed slot");
          if (
            value.fingerprint !== undefined &&
            (typeof value.fingerprint !== "string" ||
              !/^[a-f0-9]{64}$/.test(value.fingerprint))
          )
            throw Error("Invalid completed fingerprint");
          this.completed.set(id, value);
          if (this.completed.size > this.maxCompleted)
            throw Error("Completed journal bound exceeded");
        }
        for (const [p, a] of record.anchors ?? []) this.setAnchor(p, a);
        for (const [p, f] of record.floors ?? []) {
          if (!programs.has(p) || !Number.isSafeInteger(f) || f < 0)
            throw Error("Invalid dedupe floor");
          this.floors.set(p, f);
        }
        for (const gap of record.gaps ?? []) this.apply({ kind: "gap", gap });
        break;
      }
      case "put": {
        const item = record.item as WorkItem;
        item.observation = ObservationSchema.parse(item.observation);
        if (
          item.id !== eventIdentity(item.observation) ||
          !["live", "history"].includes(item.origin) ||
          !Number.isInteger(item.attempts) ||
          item.attempts < 0 ||
          !Number.isFinite(item.notBefore) ||
          typeof item.quarantined !== "boolean"
        )
          throw Error("Invalid work record");
        if (!this.pending.has(item.id)) {
          Object.freeze(item.observation.logs);
          Object.freeze(item.observation);
          this.pending.set(item.id, item);
          this.pendingPeak = Math.max(this.pendingPeak, this.pending.size);
          if (this.pending.size > this.maxPending)
            throw Error("Journal pending bound exceeded");
          this.pendingBytes += Buffer.byteLength(JSON.stringify(item));
          this.setAnchor(item.observation.program, {
            signature: item.observation.signature,
            slot: item.observation.slot,
          });
        }
        break;
      }
      case "done": {
        const item = this.pending.get(record.id);
        if (item) {
          this.pendingBytes -= Buffer.byteLength(JSON.stringify(item));
          this.pending.delete(record.id);
          this.completed.set(record.id, {
            program: item.observation.program,
            slot: item.observation.slot,
            fingerprint: this.fingerprint(item.observation),
          });
          while (this.completed.size > this.maxCompleted) {
            const [id, old] = this.completed.entries().next().value!;
            this.completed.delete(id);
            this.floors.set(
              old.program,
              Math.max(this.floors.get(old.program) ?? -1, old.slot),
            );
          }
        }
        break;
      }
      case "retry": {
        const item = this.pending.get(record.id);
        if (item) {
          if (
            !Number.isInteger(record.attempts) ||
            record.attempts < 1 ||
            record.attempts > 10 ||
            !Number.isFinite(record.notBefore) ||
            record.notBefore < 0 ||
            typeof record.quarantined !== "boolean"
          )
            throw Error("Invalid retry record");
          this.pendingBytes -= Buffer.byteLength(JSON.stringify(item));
          item.attempts = record.attempts;
          item.notBefore = record.notBefore;
          item.quarantined = record.quarantined;
          this.pendingBytes += Buffer.byteLength(JSON.stringify(item));
        }
        break;
      }
      case "gap": {
        const g = record.gap as Gap;
        this.validateGap(g);
        this.gaps.set(g.program, g);
        break;
      }
      default:
        throw Error("Unknown journal record");
    }
  }
  private validateGap(g: Gap) {
    if (
      !programs.has(g.program) ||
      !Number.isSafeInteger(g.fromSlot) ||
      g.fromSlot < 0 ||
      !Number.isSafeInteger(g.toSlot) ||
      g.toSlot < g.fromSlot ||
      !Number.isInteger(g.attempts) ||
      g.attempts < 0 ||
      ![
        "pending",
        "recovering",
        "partial",
        "recovered",
        "unrecoverable",
      ].includes(g.status) ||
      typeof g.reason !== "string" ||
      g.reason.length > 512 ||
      !Number.isInteger(g.knownRefused) ||
      g.knownRefused < 0
    )
      throw Error("Invalid gap record");
    if (
      g.anchor &&
      (typeof g.anchor.signature !== "string" ||
        g.anchor.signature.length > 128 ||
        !Number.isSafeInteger(g.anchor.slot) ||
        g.anchor.slot < 0)
    )
      throw Error("Invalid gap anchor");
  }
  private setAnchor(program: string, anchor: Anchor) {
    if (
      !programs.has(program) ||
      typeof anchor.signature !== "string" ||
      anchor.signature.length > 128 ||
      !Number.isSafeInteger(anchor.slot) ||
      anchor.slot < 0
    )
      throw Error("Invalid observation anchor");
    const prior = this.anchors.get(program);
    if (!prior || anchor.slot >= prior.slot) this.anchors.set(program, anchor);
  }
  private fingerprint(event: ProgramObservation) {
    return createHash("sha256")
      .update(JSON.stringify([event.slot, event.failed, event.logs]))
      .digest("hex");
  }
  offer(
    input: ProgramObservation,
    origin: WorkItem["origin"] = "live",
  ): {
    status: "accepted" | "duplicate" | "stale" | "full" | "conflict";
    id: string;
  } {
    let payloadBytes = 0;
    if (!Array.isArray(input.logs))
      throw new InvalidObservationError("Invalid observation");
    for (const log of input.logs) {
      if (
        typeof log !== "string" ||
        (payloadBytes += Buffer.byteLength(log)) > 262144
      )
        throw new InvalidObservationError("Observation payload bound exceeded");
    }
    let observation: ProgramObservation;
    try {
      observation = ObservationSchema.parse(input);
    } catch {
      throw new InvalidObservationError("Invalid observation");
    }
    if (!programs.has(observation.program))
      throw new InvalidObservationError("Unknown program");
    const id = eventIdentity(observation);
    const pending = this.pending.get(id),
      completed = this.completed.get(id);
    if (pending || completed) {
      const slot = pending?.observation.slot ?? completed!.slot;
      const hash = pending
        ? this.fingerprint(pending.observation)
        : completed?.fingerprint;
      if (
        observation.slot !== slot ||
        (hash !== undefined && hash !== this.fingerprint(observation))
      )
        return { status: "conflict", id };
      return { status: "duplicate", id };
    }
    if (observation.slot <= (this.floors.get(observation.program) ?? -1))
      return { status: "stale", id };
    const item: WorkItem = {
      id,
      observation,
      origin,
      attempts: 0,
      notBefore: 0,
      quarantined: false,
    };
    const size = Buffer.byteLength(JSON.stringify(item));
    if (
      this.pending.size >= this.maxPending ||
      this.pendingBytes + size + this.pending.size * 32 > this.maxBytes / 2
    )
      return { status: "full", id };
    const record = { kind: "put", item };
    this.append(record);
    this.apply(record);
    return { status: "accepted", id };
  }
  complete(id: string) {
    const record = { kind: "done", id };
    this.append(record);
    this.apply(record);
  }
  retry(id: string, maxAttempts: number, delayMs: number) {
    const item = this.pending.get(id);
    if (!item) return;
    const record = {
      kind: "retry",
      id,
      attempts: item.attempts + 1,
      notBefore: Date.now() + delayMs,
      quarantined: item.attempts + 1 >= maxAttempts,
    };
    this.append(record);
    this.apply(record);
  }
  recordGap(
    program: string,
    fromSlot: number,
    toSlot: number,
    reason: string,
    anchor?: Anchor,
    refused = 0,
  ) {
    const prior = this.gaps.get(program);
    const merge = prior && prior.status !== "recovered";
    const gap: Gap = {
      program,
      fromSlot: merge ? Math.min(prior.fromSlot, fromSlot) : fromSlot,
      toSlot: merge ? Math.max(prior.toSlot, toSlot) : toSlot,
      reason,
      anchor: merge ? prior.anchor : anchor,
      attempts: merge ? prior.attempts : 0,
      status: merge && prior.status === "unrecoverable" ? "unrecoverable" : "pending",
      knownRefused: (merge ? prior.knownRefused : 0) + refused,
    };
    this.updateGap(gap);
    return gap;
  }
  updateGap(gap: Gap) {
    this.validateGap(gap);
    const record = { kind: "gap", gap: structuredClone(gap) };
    this.append(record);
    this.apply(record);
  }
  compact() {
    if (!this.options.path || this.fd === undefined) return;
    const record = this.snapshotRecord();
    const payload = this.options.checksummed
      ? {
          walVersion: 2,
          record,
          sha256: createHash("sha256")
            .update(JSON.stringify(record))
            .digest("hex"),
        }
      : record;
    const data = Buffer.from(JSON.stringify(payload) + "\n");
    if (data.length > this.maxBytes * 0.9)
      throw Error("Journal checkpoint exceeds bound");
    const path = this.options.path;
    const fd = openSync(path + ".tmp", "w", 0o600);
    try {
      writeFileSync(fd, data);
      if (this.options.durable !== false || this.options.checkpointDurable)
        fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(path + ".tmp", path);
    closeSync(this.fd);
    this.fd = openSync(
      path,
      constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW,
    );
    this.bytes = data.length;
    if (this.options.checkpointDurable) this.syncDurable();
  }
  status() {
    return {
      pending: this.pending.size,
      pendingPeak: this.pendingPeak,
      truncatedTailBytes: this.truncatedTailBytes,
      oldestPendingAgeMs: Math.max(
        0,
        ...[...this.pending.values()].map(
          (w) => Date.now() - w.observation.observedAt,
        ),
      ),
      quarantined: [...this.pending.values()].filter((w) => w.quarantined)
        .length,
      completedRetained: this.completed.size,
      maxPending: this.maxPending,
      maxCompleted: this.maxCompleted,
      pendingBytes: this.pendingBytes,
      walBytes: this.bytes,
      maxBytes: this.maxBytes,
      durable: !!this.options.path && this.options.durable !== false,
      anchors: Object.fromEntries(this.anchors),
      dedupeFloors: Object.fromEntries(this.floors),
      gaps: [...this.gaps.values()].map((g) => structuredClone(g)),
    };
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.fd !== undefined) {
      try {
        if (this.options.durable !== false && !this.poisoned)
          fsyncSync(this.fd);
      } finally {
        closeSync(this.fd);
        this.fd = undefined;
      }
    }
    if (this.options.path) unlinkSync(this.options.path + ".lock");
  }
}
