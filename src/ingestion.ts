import {
  EventJournal,
  InvalidObservationError,
  type WorkItem,
  type Anchor,
} from "./event-journal.js";
import { DecoderRegistry } from "./decoders.js";
import { BoundedStage } from "./stages.js";
import { telemetry, type Telemetry } from "./telemetry.js";
import type { EventFreshness } from "./freshness.js";
import type { ProgramObservation, PumpLaunch } from "./chain.js";
export interface IngestionOptions {
  journal: EventJournal;
  metrics?: Telemetry;
  capacity?: number;
  decodeConcurrency?: number;
  enrichmentConcurrency?: number;
  maxAttempts?: number;
  registry?: DecoderRegistry;
  observationIssue?: (event: ProgramObservation) => string | undefined;
  enrich?: (
    observation: ProgramObservation,
    launches: PumpLaunch[],
    freshness: EventFreshness,
    timing: { receiptMonoMs: number },
  ) => Promise<unknown>;
  strategy?: (
    observation: ProgramObservation,
    launches: PumpLaunch[],
    identity: string,
    enrichment: unknown,
    freshness: EventFreshness,
    timing: { receiptMonoMs: number },
  ) => Promise<void> | void;
  persist?: (
    observation: ProgramObservation,
    launches: PumpLaunch[],
    identity: string,
  ) => Promise<void> | void;
  onCommitted?: (
    observation: ProgramObservation,
    launches: PumpLaunch[],
    enrichment?: unknown,
  ) => void;
}
/** Global in-flight bound; each stage has its own worker budget. Deferred work resides in a bounded WAL. */
export class EventIngestion {
  readonly metrics: Telemetry;
  readonly journal: EventJournal;
  readonly registry: DecoderRegistry;
  private readonly decode: BoundedStage;
  private readonly enrich: BoundedStage;
  private readonly strategy: BoundedStage;
  private readonly persist: BoundedStage;
  private readonly inFlight = new Set<string>();
  private readonly flows = new Map<string, Promise<void>>();
  private readonly received = new Map<string, number>();
  private readonly deferred = new Set<string>();
  private readonly resumed = new Set<string>();
  private scheduled = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private accepting = true;
  private fatal: string | undefined;
  private readonly capacity: number;
  private readonly lanes = [
    new Map<string, WorkItem>(),
    new Map<string, WorkItem>(),
    new Map<string, WorkItem>(),
  ];
  private laneCursor = 0;
  private chainHeadSlot: number | null = null;
  setChainHead(slot: number) {
    if (!Number.isSafeInteger(slot) || slot < 0)
      throw Error("Invalid chain head");
    this.chainHeadSlot = slot;
  }
  private enqueue(item: WorkItem) {
    if (!item.quarantined)
      this.lanes[
        this.resumed.has(item.id) ? 1 : item.origin === "history" ? 2 : 0
      ]!.set(item.id, item);
  }

  constructor(private options: IngestionOptions) {
    this.journal = options.journal;
    this.metrics = options.metrics ?? telemetry;
    this.registry = options.registry ?? new DecoderRegistry();
    this.capacity = options.capacity ?? 128;
    this.decode = new BoundedStage(
      "ingest.decode",
      this.capacity,
      options.decodeConcurrency ?? 1,
      this.metrics,
    );
    this.enrich = new BoundedStage(
      "ingest.enrichment",
      this.capacity,
      options.enrichmentConcurrency ?? Math.min(4, this.capacity),
      this.metrics,
    );
    this.strategy = new BoundedStage(
      "ingest.strategy",
      this.capacity,
      1,
      this.metrics,
    );
    this.persist = new BoundedStage(
      "ingest.persistence",
      this.capacity,
      this.journal.asynchronous ? Math.min(16, this.capacity) : 1,
      this.metrics,
    );
    if (
      !Number.isInteger(options.maxAttempts ?? 3) ||
      (options.maxAttempts ?? 3) < 1 ||
      (options.maxAttempts ?? 3) > 10
    )
      throw Error("Invalid ingestion retry bound");
    for (const [id, item] of this.journal.pending) {
      this.resumed.add(id);
      this.enqueue(item);
    }
    this.metrics.increment("ingest.resumed_from_wal", this.resumed.size);
    this.schedule();
  }
  private observationRejection(observation: ProgramObservation) {
    const reason=this.options.observationIssue?.(observation);
    if(reason===undefined)return null;
    if(!/^[a-z0-9-]{1,80}$/.test(reason))throw Error('Invalid observation policy reason');
    this.metrics.increment('ingest.observation_policy_refusals');
    this.recordGap(observation.program,Math.max(0,observation.slot-32),observation.slot,reason,this.journal.anchors.get(observation.program),1);
    return {status:'unrecoverable' as const,reason};
  }
  accept(
    observation: ProgramObservation,
    origin: WorkItem["origin"] = "live",
  ): {
    status: "accepted" | "deferred" | "duplicate" | "unrecoverable";
    id?: string;
    reason?: string;
  } {
    this.metrics.increment("ingest.offered");
    if (this.journal.asynchronous)
      throw Error("Use await acceptDurable with worker journal");
    if (!this.accepting || this.fatal) {
      this.metrics.increment("ingest.unrecoverable_offers");
      return { status: "unrecoverable" };
    }
    try {
      const policyRejection=this.observationRejection(observation);if(policyRejection)return policyRejection;
      const result = this.metrics.measure("ingest.receipt_ms", () =>
        this.journal.offer(observation, origin),
      );
      if (result.status === "duplicate") {
        this.metrics.increment("ingest.duplicates");
        return { status: "duplicate", id: result.id };
      }
      if (result.status === "conflict") {
        this.metrics.increment("ingest.fork_or_provider_conflicts");
        this.recordGap(
          observation.program,
          Math.max(0, observation.slot - 32),
          observation.slot,
          "fork-or-provider-conflict",
          this.journal.anchors.get(observation.program),
          1,
        );
        return {
          status: "unrecoverable",
          id: result.id,
          reason: "fork-or-provider-conflict",
        };
      }
      if (result.status === "stale" || result.status === "full") {
        this.metrics.increment("ingest.unpersisted");
        this.recordGap(
          observation.program,
          Math.max(0, observation.slot - 32),
          observation.slot,
          result.status === "stale"
            ? "outside-dedupe-window"
            : "journal-capacity",
          this.journal.anchors.get(observation.program),
          1,
        );
        return {
          status: "unrecoverable",
          id: result.id,
          reason:
            result.status === "full"
              ? "journal-capacity"
              : "outside-dedupe-window",
        };
      }
      // The WAL owns payloads. This extra timing map is independently bounded to the WAL's pending bound.
      this.received.set(
        result.id,
        observation.receivedAtMonoMs ?? this.metrics.now(),
      );
      const deferred =
        this.inFlight.size >= this.capacity ||
        this.journal.pending.size > this.capacity;
      if (deferred) {
        this.deferred.add(result.id);
        this.metrics.increment("ingest.deferred");
      }
      this.enqueue(this.journal.pending.get(result.id)!);
      this.schedule();
      return { status: deferred ? "deferred" : "accepted", id: result.id };
    } catch (error) {
      if (error instanceof InvalidObservationError) {
        this.metrics.increment("ingest.invalid_observations");
        this.metrics.increment("ingest.unrecoverable_offers");
        return { status: "unrecoverable" };
      }
      this.fatal = "journal-or-observation-failure";
      this.metrics.increment("ingest.unrecoverable_offers");
      return { status: "unrecoverable" };
    }
  }
  private admissions = new Set<Promise<unknown>>();
  acceptDurable(
    observation: ProgramObservation,
    origin: WorkItem["origin"] = "live",
  ) {
    if (this.admissions.size >= 512) {
      this.metrics.increment("ingest.admission_refused");
      this.recordGap(
        observation.program,
        Math.max(0, observation.slot - 32),
        observation.slot,
        "durable-admission-capacity",
        this.journal.anchors.get(observation.program),
        1,
      );
      return Promise.resolve({
        status: "unrecoverable" as const,
        reason: "journal-capacity",
        id: undefined,
      });
    }
    const task = this.acceptDurableImpl(observation, origin);
    this.admissions.add(task);
    void task.finally(() => this.admissions.delete(task));
    return task;
  }
  private async acceptDurableImpl(
    observation: ProgramObservation,
    origin: WorkItem["origin"] = "live",
  ): Promise<{
    status: "accepted" | "deferred" | "duplicate" | "unrecoverable";
    id?: string;
    reason?: string;
  }> {
    this.metrics.increment("ingest.offered");
    if (!this.accepting || this.fatal) {
      this.metrics.increment("ingest.unrecoverable_offers");
      return { status: "unrecoverable" };
    }
    try {
      const policyRejection=this.observationRejection(observation);
      if(policyRejection){await this.journal.flush();return policyRejection;}
      const result = await this.metrics.measureAsync("ingest.receipt_ms", () =>
        this.journal.offerDurable(observation, origin),
      );
      if (result.status === "duplicate") {
        this.metrics.increment("ingest.duplicates");
        return { status: "duplicate", id: result.id };
      }
      if (result.status === "conflict") {
        this.metrics.increment("ingest.fork_or_provider_conflicts");
        this.recordGap(
          observation.program,
          Math.max(0, observation.slot - 32),
          observation.slot,
          "fork-or-provider-conflict",
          this.journal.anchors.get(observation.program),
          1,
        );
        return {
          status: "unrecoverable",
          id: result.id,
          reason: "fork-or-provider-conflict",
        };
      }
      if (result.status === "stale" || result.status === "full") {
        this.metrics.increment("ingest.unpersisted");
        this.recordGap(
          observation.program,
          Math.max(0, observation.slot - 32),
          observation.slot,
          result.status === "stale"
            ? "outside-dedupe-window"
            : "journal-capacity",
          this.journal.anchors.get(observation.program),
          1,
        );
        return {
          status: "unrecoverable",
          id: result.id,
          reason:
            result.status === "full"
              ? "journal-capacity"
              : "outside-dedupe-window",
        };
      }
      // The WAL owns payloads. This extra timing map is independently bounded to the WAL's pending bound.
      this.received.set(
        result.id,
        observation.receivedAtMonoMs ?? this.metrics.now(),
      );
      const deferred =
        this.inFlight.size >= this.capacity ||
        this.journal.pending.size > this.capacity;
      if (deferred) {
        this.deferred.add(result.id);
        this.metrics.increment("ingest.deferred");
      }
      this.enqueue(this.journal.pending.get(result.id)!);
      this.schedule();
      return { status: deferred ? "deferred" : "accepted", id: result.id };
    } catch (error) {
      if (error instanceof InvalidObservationError) {
        this.metrics.increment("ingest.invalid_observations");
        this.metrics.increment("ingest.unrecoverable_offers");
        return { status: "unrecoverable" };
      }
      this.fatal = "journal-or-observation-failure";
      this.metrics.increment("ingest.unrecoverable_offers");
      return { status: "unrecoverable" };
    }
  }
  recordGap(
    program: string,
    fromSlot: number,
    toSlot: number,
    reason: string,
    anchor?: Anchor,
    refused = 0,
  ) {
    try {
      return this.journal.recordGap(
        program,
        fromSlot,
        toSlot,
        reason,
        arguments.length >= 5 ? anchor : this.journal.anchors.get(program),
        refused,
      );
    } catch {
      this.fatal = "gap-persistence-failed";
      this.metrics.increment("ingest.journal_errors");
      return undefined;
    }
  }
  private schedule() {
    if (this.scheduled || this.fatal) return;
    this.scheduled = true;
    setImmediate(() => {
      this.scheduled = false;
      this.pump();
    });
  }
  private pump() {
    this.fatal ??= this.journal.failureReason ?? undefined;
    if (this.fatal) return;
    let wake = Infinity;
    while (this.inFlight.size < this.capacity) {
      let selected: WorkItem | undefined;
      const weights = [0, 0, 0, 1, 2];
      for (let choice = 0; choice < weights.length && !selected; choice++) {
        const lane = this.lanes[weights[this.laneCursor++ % weights.length]!]!;
        for (const [id, candidate] of lane) {
          if (!this.journal.pending.has(id) || candidate.quarantined) {
            lane.delete(id);
            continue;
          }
          if (!this.journal.isOwned(id)) continue;
          if (candidate.notBefore > Date.now()) {
            wake = Math.min(wake, candidate.notBefore);
            continue;
          }
          lane.delete(id);
          selected = candidate;
          break;
        }
      }
      if (!selected) break;
      const item = selected;
      this.inFlight.add(item.id);
      this.metrics.adjustGauge("ingest.in_flight", 1);
      const received = this.received.get(item.id) ?? this.metrics.now();
      let failureStage: "decode" | "enrichment" | "strategy" | "persistence" = "decode";
      const started = this.decode.trySubmit(
        () => this.registry.decode(item.observation, this.metrics),
        received,
      );
      if (!started) {
        this.inFlight.delete(item.id);
        this.metrics.adjustGauge("ingest.in_flight", -1);
        break;
      }
      const flow = started
        .then(async (decoded) => {
          if (!decoded.supported)
            this.metrics.increment("ingest.observation_only");
          failureStage = "enrichment";
          const enrichment = this.enrich.trySubmit(
            () =>
              this.options.enrich?.(
                item.observation,
                decoded.launches,
                {
                  origin: this.resumed.has(item.id) ? "restart" : item.origin,
                  receiptAt: item.observation.observedAt,
                  eventSlot: item.observation.slot,
                  chainHeadSlot: this.chainHeadSlot,
                },
                { receiptMonoMs: received },
              ),
            received,
          );
          if (!enrichment) throw Error("Stage capacity invariant");
          const details = await enrichment;
          failureStage = "strategy";
          const decision = this.strategy.trySubmit(
            () =>
              this.options.strategy?.(
                item.observation,
                decoded.launches,
                item.id,
                details,
                {
                  origin: this.resumed.has(item.id) ? "restart" : item.origin,
                  receiptAt: item.observation.observedAt,
                  eventSlot: item.observation.slot,
                  chainHeadSlot: this.chainHeadSlot,
                },
                { receiptMonoMs: received },
              ),
            received,
          );
          if (!decision) throw Error("Stage capacity invariant");
          await decision;
          failureStage = "persistence";
          const persisted = this.persist.trySubmit(async () => {
            await this.options.persist?.(
              item.observation,
              decoded.launches,
              item.id,
            );
            await this.journal.completeDurable(item.id);
          }, received);
          if (!persisted) throw Error("Stage capacity invariant");
          await persisted;
          this.metrics.increment("ingest.completed");
          if (this.resumed.delete(item.id))
            this.metrics.increment("ingest.restart_completed");
          if (item.origin === "history")
            this.metrics.increment("ingest.recovered");
          if (this.deferred.delete(item.id))
            this.metrics.increment("ingest.deferred_completed");
          this.metrics.observe(
            "ingest.end_to_end_ms",
            this.metrics.now() - received,
          );
          try {
            this.options.onCommitted?.(
              item.observation,
              decoded.launches,
              details,
            );
          } catch {
            this.metrics.increment("ingest.dashboard_errors");
          }
        })
        .catch(async (error: unknown) => {
          this.metrics.increment("ingest.processing_errors");
          try {
            await this.journal.retryDurable(
              item.id,
              this.options.maxAttempts ?? 3,
              Math.min(1000, 25 * 2 ** item.attempts),
              { at: Date.now(), stage: failureStage, name: error instanceof Error ? error.name.slice(0,80) : "UnknownFailure", message: String(error instanceof Error ? error.message : "Unknown callback failure").replace(/(?:https?|wss?):\/\/\S+/g,"[endpoint]").slice(0,400) },
            );
            if (item.quarantined) this.metrics.increment("ingest.quarantined");
          } catch {
            this.fatal = "retry-persistence-failed";
            this.metrics.increment("ingest.journal_errors");
          }
        })
        .finally(() => {
          this.inFlight.delete(item.id);
          this.flows.delete(item.id);
          this.metrics.adjustGauge("ingest.in_flight", -1);
          if (this.journal.pending.has(item.id) && !item.quarantined)
            this.enqueue(item);
          if (!this.journal.pending.has(item.id) || item.quarantined) {
            this.received.delete(item.id);
            this.deferred.delete(item.id);
          }
          this.schedule();
        });
      this.flows.set(item.id, flow);
    }
    if (wake < Infinity && !this.timer) {
      this.timer = setTimeout(
        () => {
          this.timer = undefined;
          this.schedule();
        },
        Math.max(1, wake - Date.now()),
      );
    }
  }
  async drain(timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (
      !this.fatal &&
      !this.journal.failureReason &&
      (this.admissions.size ||
        this.inFlight.size ||
        this.scheduled ||
        [...this.journal.pending.values()].some((w) => !w.quarantined))
    ) {
      if (Date.now() > deadline)
        throw Error(
          "Ingestion drain deadline exceeded; work remains journaled",
        );
      await new Promise((r) => setTimeout(r, 2));
    }
    if (this.fatal || this.journal.failureReason)
      throw Error(this.fatal ?? this.journal.failureReason!);
  }
  status() {
    return {
      accepting: this.accepting,
      fatal: this.fatal ?? this.journal.failureReason,
      inFlight: this.inFlight.size,
      capacity: this.capacity,
      resumedPending: this.resumed.size,
      decodedCoverage: this.registry.coverage(),
      ...this.journal.status(),
    };
  }
  async close() {
    this.accepting = false;
    let failed: unknown;
    try {
      await this.drain();
    } catch (error) {
      failed = error;
    } finally {
      if (this.timer) clearTimeout(this.timer);
      await Promise.allSettled([...this.flows.values()]);
      for (const stage of [
        this.decode,
        this.enrich,
        this.strategy,
        this.persist,
      ]) {
        stage.close();
        await stage.drain();
      }
      await this.journal.shutdown();
    }
    if (failed) throw failed;
  }
}
