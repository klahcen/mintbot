import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  SolanaMonitor,
  VERIFIED_PROGRAMS,
  type PumpLaunch,
  type ProgramObservation,
  type ProgramDefinition,
} from "./chain.js";
import { AsyncEventJournal } from "./async-journal.js";
import { RotatingJsonl, type RotationOptions } from "./rotating-jsonl.js";
import { VerifiedReadRpc, UnknownProtocolLayoutError } from "./verified-rpc.js";
import type { VerifiedLaunch } from "./verified-decoders.js";
import { EventJournal, type JournalOptions } from "./event-journal.js";
import { EventIngestion } from "./ingestion.js";
import {
  HttpRecoveryRpc,
  RecoveryCoordinator,
  type BackfillOptions,
} from "./backfill.js";
import { BoundedStage } from "./stages.js";
import { telemetry, type Telemetry } from "./telemetry.js";
export interface MonitoringOptions {
  programs: readonly ProgramDefinition[];
  websocketUrls: string[];
  rpcUrl?: string;
  journal: JournalOptions;
  rawPath: string;
  rotation?: RotationOptions;
  verifyProtocols?: boolean;
  finalityWaitMs?: number;
  prepareCreationObservation?: (event: ProgramObservation) => Promise<unknown>;
  onVerifiedLaunch?: (launch: VerifiedLaunch) => void;
  evaluateVerifiedLaunch?: (launch: VerifiedLaunch) => Promise<unknown>;
  metrics?: Telemetry;
  recovery?: BackfillOptions;
  onObservation?: (event: ProgramObservation) => void;
  discoveryPath?: string;
  onDiscovery?: (launch: PumpLaunch) => void;
  audit?: (event: ProgramObservation) => Promise<void>;
}
/** Runtime integration shared by HTTP server and standalone monitor. Never supplies prices or signs trades. */
export async function createMonitoringService(options: MonitoringOptions) {
  const finalityWaitMs = options.finalityWaitMs ?? 12000;
  if (!Number.isSafeInteger(finalityWaitMs) || finalityWaitMs < 2000 || finalityWaitMs > 60000)
    throw Error("Finality wait bound");
  if (options.websocketUrls.length < 1 || options.websocketUrls.length > 2)
    throw Error("Configure one or two WebSocket providers");
  for (const p of options.programs)
    if (
      !VERIFIED_PROGRAMS.some(
        (v) => v.name === p.name && v.address === p.address,
      )
    )
      throw Error("Unverified runtime program");
  const rawPaths = [options.rawPath, options.discoveryPath]
    .filter((p): p is string => !!p)
    .map((p) => resolve(p));
  if (new Set(rawPaths).size !== rawPaths.length)
    throw Error("Raw and discovery paths must be separate");
  if (options.journal.path) {
    const wal = resolve(options.journal.path);
    for (const path of rawPaths)
      if (
        [wal, wal + ".lock", wal + ".tmp"].includes(path) ||
        [
          path,
          path + ".writer.lock",
          path + ".retention.json",
          path + ".retention.json.tmp",
        ].includes(wal) ||
        wal.startsWith(path + ".archive-")
      )
        throw Error("Journal and raw storage paths must not overlap");
  }
  await mkdir(dirname(options.rawPath), { recursive: true });
  const metrics = options.metrics ?? telemetry;
  const journal = options.journal.path
    ? await AsyncEventJournal.open(options.journal, metrics)
    : new EventJournal(options.journal);
  let raw!: RotatingJsonl;
  let discoveryRaw: RotatingJsonl | undefined;
  try {
    raw = await RotatingJsonl.open(options.rawPath, options.rotation, metrics);
    discoveryRaw = options.discoveryPath
      ? await RotatingJsonl.open(
          options.discoveryPath,
          options.rotation,
          metrics,
        )
      : undefined;
  } catch (error) {
    await raw?.close();
    await journal.shutdown();
    throw error;
  }
  const verifier =
    options.rpcUrl && options.verifyProtocols !== false
      ? new VerifiedReadRpc(options.rpcUrl)
      : undefined;
  const verifiedDiscoveries: VerifiedLaunch[] = [];
  const verificationIssues: { program: string; reason: string }[] = [];
  const startupAnchors = new Map(journal.anchors);
  let startupScheduled = false;
  const audit = new BoundedStage("ingest.audit", 64, 2, metrics);
  let receipts = 0,
    latestSlot = 0;
  const ready = options.websocketUrls.map(() => false);
  let closing = false;
  let pausedForBackpressure = false;
  const pipeline = new EventIngestion({
    journal,
    metrics,
    enrich: async (event, _launches, freshness, timing) => {
      // Only candidate instruction labels trigger retrieval; they are never accepted as launch proof.
      if (
        !verifier ||
        !event.logs.some((l) =>
          /^Program log: Instruction: (?:Create(?:V2|Pool)?|Initialize(?:LbPair2?|CustomizablePermissionlessLbPair2?)?)$/.test(
            l,
          ),
        )
      )
        return [];
      if (freshness.origin === "live") await options.prepareCreationObservation?.(event);
      const verificationDeadline = metrics.now() + finalityWaitMs;
      for (let attempt = 0; attempt < Math.ceil(finalityWaitMs / 2000); attempt++) {
        if (metrics.now() > verificationDeadline) break;
        const launches = await metrics
          .rpc("verifyLaunch", () =>
            metrics.measureAsync("market.transaction_verification_ms", () =>
              verifier.verify(event.program, event.signature, event.slot),
            ),
          )
          .catch((error) => {
            if (!(error instanceof UnknownProtocolLayoutError)) throw error;
            metrics.increment("protocol.unknown_or_invalid_layout");
            verificationIssues.unshift({
              program: event.program,
              reason: error.message,
            });
            verificationIssues.splice(64);
            return [];
          });
        if (launches !== null)
          return launches.map((launch) =>
            Object.defineProperty(
              {
                ...launch,
                freshness: {
                  ...freshness,
                  ...(launch.blockTimeMs !== undefined
                    ? { eventTimeMs: launch.blockTimeMs }
                    : {}),
                },
              },
              "receiptMonoMs",
              { value: timing.receiptMonoMs, enumerable: false },
            ),
          );
        metrics.increment("protocol.awaiting_finality");
        const remaining = verificationDeadline - metrics.now();
        if (remaining <= 0) break;
        await new Promise((r) => setTimeout(r, Math.min(2000, remaining)));
      }
      throw Error("Finalized creation transaction unavailable");
    },
    strategy: async (_event, _launches, _identity, enrichment) => {
      if (options.evaluateVerifiedLaunch)
        for (const launch of (Array.isArray(enrichment)
          ? enrichment
          : []) as VerifiedLaunch[])
          await options.evaluateVerifiedLaunch(launch);
    },
    persist: async (event, launches) => {
      await raw.append({ ...event });
      if (discoveryRaw)
        for (const launch of launches) await discoveryRaw.append({ ...launch });
    },
    onCommitted: (event, launches, enrichment) => {
      for (const launch of (Array.isArray(enrichment)
        ? enrichment
        : []) as VerifiedLaunch[]) {
        verifiedDiscoveries.unshift(launch);
        verifiedDiscoveries.splice(200);
        options.onVerifiedLaunch?.(launch);
      }
      for (const launch of launches) options.onDiscovery?.(launch);
      if (options.audit) {
        const result = audit.trySubmit(() => options.audit!(event));
        if (!result) metrics.increment("ingest.audit_deferred_unpersisted");
        else void result.catch(() => metrics.increment("ingest.audit_failed"));
      }
    },
  });
  const recovery = options.rpcUrl
    ? new RecoveryCoordinator(
        pipeline,
        new HttpRecoveryRpc(options.rpcUrl),
        options.recovery,
      )
    : undefined;
  const monitors = options.websocketUrls.map(
    (url, index) =>
      new SolanaMonitor(
        url,
        options.programs,
        (event) => {
          void pipeline
            .acceptDurable(event)
            .then((result) => {
              if (result.reason === "journal-capacity") {
                pausedForBackpressure = true;
                for (const monitor of monitors) monitor.stop();
                metrics.increment("ingest.provider_pauses");
              }
              if (
                result.status === "accepted" ||
                result.status === "deferred"
              ) {
                receipts++;
                latestSlot = Math.max(latestSlot, event.slot);
                try {
                  options.onObservation?.(event);
                } catch {
                  metrics.increment("ingest.observation_callback_errors");
                }
              }
            })
            .catch(() => metrics.increment("ingest.admission_errors"));
        },
        {
          telemetry: metrics,
          deduplicate: false,
          onDisconnect: (context) => {
            ready[index] = false;
            if (closing) return;
            for (const program of options.programs) {
              const anchor = journal.anchors.get(program.name);
              pipeline.recordGap(
                program.name,
                Math.max(0, (anchor?.slot ?? context.latestSlot) - 32),
                Math.max(context.latestSlot, anchor?.slot ?? 0),
                "websocket-disconnect",
                anchor,
              );
            }
          },
          onReady: (context) => {
            ready[index] = true;
            if (closing) return;
            const initialRecovery = !startupScheduled;
            startupScheduled = true;
            for (const program of options.programs) {
              const gap = journal.gaps.get(program.name);
              const anchor =
                gap && gap.status !== "recovered"
                  ? gap.anchor
                  : context.reconnected
                    ? journal.anchors.get(program.name)
                    : initialRecovery
                      ? startupAnchors.get(program.name)
                      : undefined;
              if (anchor || gap) {
                if (recovery) recovery.request(program.name, anchor);
                else
                  pipeline.recordGap(
                    program.name,
                    gap?.fromSlot ?? Math.max(0, anchor!.slot - 32),
                    gap?.toSlot ?? anchor!.slot,
                    "rpc-not-configured",
                    anchor,
                  );
              }
            }
          },
          onError: () => metrics.increment("monitor.service_errors"),
        },
      ),
  );
  let checkpointing: Promise<void> | undefined;
  const checkpointTimer = setInterval(() => {
    if (closing || checkpointing || !(journal instanceof AsyncEventJournal))
      return;
    const status = journal.status();
    if (
      status.unacknowledged ||
      pipeline.status().inFlight ||
      status.walBytes < status.maxBytes * 0.5
    )
      return;
    checkpointing = journal
      .checkpoint()
      .catch(() => metrics.increment("journal.checkpoint_failures"))
      .finally(() => {
        checkpointing = undefined;
      });
  }, 30000);
  checkpointTimer.unref();
  let headBusy = false;
  const headTimer = setInterval(() => {
    if (closing || !verifier || headBusy) return;
    headBusy = true;
    void metrics
      .rpc("chainHead", () => verifier.getSlot())
      .then((slot) => pipeline.setChainHead(slot))
      .catch(() => metrics.increment("monitor.head_errors"))
      .finally(() => {
        headBusy = false;
      });
  }, 5000);
  headTimer.unref();
  const timer = setInterval(() => {
    if (closing) return;
    if (
      pausedForBackpressure &&
      !pipeline.status().fatal &&
      journal.pending.size < journal.maxPending / 2
    ) {
      pausedForBackpressure = false;
      for (const monitor of monitors) monitor.start();
      metrics.increment("ingest.provider_resumes");
    }
    if (!recovery) return;
    for (const gap of journal.gaps.values())
      if (
        (gap.status === "pending" || gap.status === "partial") &&
        gap.attempts < 3
      )
        recovery.request(gap.program, gap.anchor);
  }, 1000);
  timer.unref();
  return {
    pipeline,
    start() {
      for (const monitor of monitors) monitor.start();
    },
    snapshot() {
      const state = pipeline.status();
      return {
        ...state,
        verifiedDiscoveries,
        verificationIssues,
        rawStorage: raw.status(),
        alerts: [
          ...(state.pending >= state.maxPending * 0.8
            ? ["Journal occupancy above 80%"]
            : []),
          ...(state.walBytes >= state.maxBytes * 0.8
            ? ["WAL usage above 80%"]
            : []),
          ...("diskAvailableBytes" in state &&
          typeof state.diskAvailableBytes === "number" &&
          state.diskAvailableBytes < 128 * 1024 * 1024
            ? ["Disk free space below 128 MiB"]
            : []),
        ],
        providers: ready.map((connected, i) => ({
          provider: i === 0 ? "primary" : "secondary",
          subscribed: connected,
        })),
        recoveryConfigured: !!recovery,
        pausedForBackpressure,
        receipts,
        latestSlot,
      };
    },
    health() {
      if (pipeline.status().fatal) return "degraded";
      if (pausedForBackpressure) return "backpressured";
      if (!ready.some(Boolean)) return "connecting";
      if ([...journal.gaps.values()].some((g) => g.status !== "recovered"))
        return "backfill-incomplete";
      return receipts ? "receiving" : "subscribed";
    },
    recover(program?: string) {
      if (!recovery) throw Error("Read-only recovery RPC not configured");
      for (const p of options.programs.filter(
        (p) => !program || p.name === program,
      )) {
        const gap = journal.gaps.get(p.name);
        if (gap) journal.updateGap({ ...gap, attempts: 0, status: "pending" });
        recovery.request(
          p.name,
          gap ? gap.anchor : journal.anchors.get(p.name),
        );
      }
    },
    async close() {
      closing = true;
      clearInterval(timer);
      clearInterval(headTimer);
      clearInterval(checkpointTimer);
      await checkpointing;
      for (const monitor of monitors) monitor.stop();
      await recovery?.close();
      try {
        await pipeline.close();
      } finally {
        audit.close();
        await audit.drain();
        await raw.close();
        await discoveryRaw?.close();
      }
    },
  };
}
