import { readFile, writeFile, mkdtemp, rm, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir, cpus } from "node:os";
import { EventEmitter } from "node:events";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { PublicKey, type Connection } from "@solana/web3.js";
import { Telemetry } from "../src/telemetry.js";
import { pumpLogs } from "./benchmark-fixtures.js";
import type { ProgramObservation } from "../src/chain.js";
import type { RecoveryRpc } from "../src/backfill.js";
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1]!;
};
const root = resolve(option("--source-root", "."));
const output = option("--output", "docs/phase2/workloads.json");
const source = async (name: string) =>
  import(pathToFileURL(join(root, "src", name + ".ts")).href);
const [chain, engineModule, storeModule, models, queues] = (await Promise.all(
  ["chain", "engine", "store", "model", "queue"].map(source),
)) as [
  typeof import("../src/chain.js"),
  typeof import("../src/engine.js"),
  typeof import("../src/store.js"),
  typeof import("../src/model.js"),
  typeof import("../src/queue.js"),
];
const staged =
  existsSync(join(root, "src/ingestion.ts")) &&
  option("--adapter", "auto") !== "legacy";
const ingestion = staged
  ? ((await source("ingestion")) as typeof import("../src/ingestion.js"))
  : undefined;
const journals = staged
  ? ((await source(
      "event-journal",
    )) as typeof import("../src/event-journal.js"))
  : undefined;
const recovery = staged
  ? ((await source("backfill")) as typeof import("../src/backfill.js"))
  : undefined;
const config = models.StrategySchema.parse(
  JSON.parse(await readFile(join(root, "config/strategy.json"), "utf8")),
);
const fixture = JSON.parse(
  await readFile("docs/fixtures/mainnet-pumpswap-transaction.json", "utf8"),
).result;
for (const ix of fixture.transaction.message.instructions)
  ix.programId = new PublicKey(ix.programId);
for (const group of fixture.meta.innerInstructions ?? [])
  for (const ix of group.instructions)
    ix.programId = new PublicKey(ix.programId);
class Socket extends EventEmitter {
  send(_data: string) {}
  close() {
    this.emit("close");
  }
}
const scenarios = [
  { name: "burst-1000", count: 1000 },
  { name: "stress-10000", count: 10000 },
  { name: "sustained", count: 1000 },
  { name: "duplicate-heavy", count: 1000 },
  { name: "saturation", count: 1000 },
  { name: "disconnect-backfill", count: 1000 },
  { name: "out-of-order", count: 1000 },
  { name: "durable-burst", count: 200 },
];
const results = [];
for (const scenario of scenarios) {
  const m = new Telemetry();
  const endToEnd = new Telemetry();
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  const memoryStart = process.memoryUsage();
  let peakRss = memoryStart.rss,
    peakHeap = memoryStart.heapUsed;
  const sample = () => {
    const current = process.memoryUsage();
    peakRss = Math.max(peakRss, current.rss);
    peakHeap = Math.max(peakHeap, current.heapUsed);
  };
  const memoryTimer = setInterval(sample, 5);
  const directory = await mkdtemp(join(tmpdir(), "mintbot-ingest-bench-"));
  const durable = scenario.name === "durable-burst";
  const state = storeModule.initial(config);
  state.running = true;
  const store = new storeModule.Store(
    state,
    durable ? join(directory, "state.json") : undefined,
    m,
  );
  const engine = new engineModule.Engine(store, m);
  const logs = pumpLogs(chain.VERIFIED_PROGRAMS[0]!.address);
  const planned = new Map<string, number>();
  const quotes = new Map<
    string,
    ReturnType<typeof engineModule.syntheticLaunch>
  >();
  const completed = new Set<string>();
  let duplicateProcessing = 0,
    directRejected = 0,
    withheld = 0;
  const oldestAnchor = { signature: "fixture-0", slot: 1000 };
  let gapAnchor = oldestAnchor;
  let pipeline: import("../src/ingestion.js").EventIngestion | undefined;
  const tasks: Promise<unknown>[] = [];
  const enrich = async (event: ProgramObservation) => {
    const id = Number(event.signature.slice(8));
    const connection = {
      getParsedTransaction: async () => {
        if (id % 17 === 0) throw Error("Injected RPC read fault");
        return fixture;
      },
    } as unknown as Pick<Connection, "getParsedTransaction">;
    try {
      await chain.inspectTransaction(connection, event.signature, m);
    } catch {}
  };
  const strategy = async (event: ProgramObservation) => {
    const quote = quotes.get(event.signature)!;
    if (!quote) throw Error("Missing independent synthetic quote");
    await engine.ingest(quote);
  };
  const done = (event: ProgramObservation) => {
    if (completed.has(event.signature)) duplicateProcessing++;
    completed.add(event.signature);
    endToEnd.observe(
      "end_to_end_ms",
      endToEnd.now() - planned.get(event.signature)!,
    );
    if (completed.size % 64 === 0) sample();
  };
  const oldQueue = staged
    ? undefined
    : new queues.MeasuredQueue(
        scenario.name === "saturation" ? 64 : 1024,
        m,
        "legacy.observations",
      );
  if (staged) {
    const journal = new journals!.EventJournal({
      path: durable ? join(directory, "work.wal") : undefined,
      maxPending: scenario.name === "saturation" ? 64 : 10000,
    });
    pipeline = new ingestion!.EventIngestion({
      journal,
      metrics: m,
      capacity: 128,
      enrich,
      strategy,
      persist: durable
        ? (event) =>
            appendFile(
              join(directory, "observations.jsonl"),
              JSON.stringify(event) + "\n",
            )
        : undefined,
      onCommitted: done,
    });
  }
  let socket: Socket;
  let ready: () => void = () => {};
  const monitor = new chain.SolanaMonitor(
    "ws://fixture.invalid",
    [chain.VERIFIED_PROGRAMS[0]!],
    (event) => {
      if (pipeline) {
        const result = pipeline.accept(event);
        if (result.status === "unrecoverable") directRejected++;
      } else {
        tasks.push(
          oldQueue!
            .submit(async () => {
              chain.decodeLaunch(event, m);
              await enrich(event);
              await strategy(event);
              if (durable)
                await appendFile(
                  join(directory, "observations.jsonl"),
                  JSON.stringify(event) + "\n",
                );
              done(event);
            })
            .then((result) => {
              if (!result.accepted) directRejected++;
            }),
        );
      }
    },
    {
      telemetry: m,
      deduplicate: !staged,
      maxReconnects: 1,
      reconnectBaseMs: 1,
      onError: () => {},
    },
    () => {
      socket = new Socket();
      queueMicrotask(() => {
        socket.emit("open");
        socket.emit("message", JSON.stringify({ id: 1, result: 44 }));
        ready();
      });
      return socket;
    },
  );
  const connected = new Promise<void>((resolve) => (ready = resolve));
  monitor.start();
  await connected;
  const start = endToEnd.now();
  let recoveryResult: unknown = null;
  try {
    for (let n = 0; n < scenario.count; n++) {
      const id =
        scenario.name === "duplicate-heavy"
          ? Math.floor(n / 10)
          : scenario.name === "out-of-order"
            ? scenario.count - 1 - n
            : n;
      const signature = `fixture-${id}`;
      if (!planned.has(signature)) {
        planned.set(signature, endToEnd.now());
        quotes.set(signature, engineModule.syntheticLaunch(id));
      }
      if (scenario.name === "disconnect-backfill" && n === 400) {
        gapAnchor = { signature: "fixture-399", slot: 1399 };
        pipeline?.recordGap(
          "pump",
          1367,
          1999,
          "fixture-disconnect",
          gapAnchor,
        );
        const reconnected = new Promise<void>((resolve) => (ready = resolve));
        socket!.close();
        await reconnected;
      }
      if (scenario.name === "disconnect-backfill" && n >= 400 && n < 500) {
        withheld++;
        continue;
      }
      socket!.emit(
        "message",
        JSON.stringify({
          method: "logsNotification",
          params: {
            subscription: 44,
            result: {
              context: { slot: 1000 + id },
              value: { signature, err: null, logs },
            },
          },
        }),
      );
      if (n % 64 === 0) sample();
      if (scenario.name === "sustained" && n % 10 === 9)
        await new Promise((r) => setTimeout(r, 5));
    }
    if (pipeline) {
      await pipeline.drain(120000);
      if (
        scenario.name === "saturation" ||
        scenario.name === "disconnect-backfill"
      ) {
        const rows = Array.from({ length: scenario.count }, (_, i) => ({
          signature: `fixture-${scenario.count - 1 - i}`,
          slot: 1000 + scenario.count - 1 - i,
          err: null,
        }));
        rows.push({ signature: "boundary", slot: 967, err: null });
        const rpc: RecoveryRpc = {
          getSlot: async () => 1000 + scenario.count,
          getSignaturesForAddress: async (_address, options) => {
            const start = options.before
              ? rows.findIndex((row) => row.signature === options.before) + 1
              : 0;
            return rows.slice(start, start + options.limit);
          },
          getTransaction: async (signature) => {
            const row = rows.find((r) => r.signature === signature)!;
            return {
              slot: row.slot,
              meta: { err: null, logMessages: logs },
              transaction: {
                signatures: [signature],
                message: { accountKeys: [chain.VERIFIED_PROGRAMS[0]!.address] },
              },
            };
          },
        };
        const anchor = pipeline.journal.gaps.get("pump")?.anchor ?? gapAnchor;
        recoveryResult = await recovery!.recoverGap(
          pipeline,
          rpc,
          "pump",
          anchor,
          {
            pageSize: 100,
            maxPages: 20,
            maxTransactions: 2000,
            deadlineMs: 120000,
          },
        );
      }
    } else {
      await Promise.all(tasks);
      await oldQueue!.drain();
    }
    sample();
    const elapsedMs = endToEnd.now() - start;
    const snapshot = pipeline?.status();
    const balanceCheck =
      Math.abs(
        store.state.balanceSol +
          store.state.positions.reduce((sum, p) => sum + p.costSol, 0) -
          10 -
          store.state.realizedPnlSol,
      ) < 1e-8;
    const unique = planned.size;
    loop.disable();
    const finite = (value: number) =>
      Number.isFinite(loop.mean) && Number.isFinite(value) ? value / 1e6 : null;
    results.push({
      scenario: scenario.name,
      offered: scenario.count,
      uniqueOffered: unique,
      networkWithheld: withheld,
      completed: completed.size,
      completedEventsPerSecond: completed.size / (elapsedMs / 1000),
      elapsedMs,
      duplicateOffers:
        m.report().counters[
          staged ? "ingest.duplicates" : "observations.duplicates"
        ] ?? 0,
      knownRefusedAdmissions: directRejected,
      droppedOffers: directRejected,
      uncompletedFixtureEvents: unique - completed.size,
      deferred: m.report().counters["ingest.deferred"] ?? 0,
      deferredCompleted: m.report().counters["ingest.deferred_completed"] ?? 0,
      recovered: m.report().counters["ingest.recovered"] ?? 0,
      rpcErrors: m.report().counters["rpc.errors"] ?? 0,
      duplicateLogicalProcessing: duplicateProcessing,
      latencies: endToEnd.snapshot(),
      telemetry: m.report(),
      recovery: recoveryResult,
      journal: snapshot ?? null,
      memory: {
        before: memoryStart,
        after: process.memoryUsage(),
        sampledPeakRssBytes: peakRss,
        sampledPeakHeapUsedBytes: peakHeap,
        processLifetimeMaxRssBytes: process.resourceUsage().maxRSS * 1024,
      },
      eventLoopDelayMs: {
        mean: finite(loop.mean),
        p95: finite(loop.percentile(95)),
        p99: finite(loop.percentile(99)),
        max: finite(loop.max),
      },
      stateIntegrity: {
        valid: models.StateSchema.safeParse(store.state).success,
        balanceReconciles: balanceCheck,
        uniqueOpenMints:
          new Set(store.state.positions.map((p) => p.mint)).size ===
          store.state.positions.length,
        paperOnly: store.state.mode === "paper",
        paperPositions: store.state.positions.length,
        paperTrades: store.state.trades.length,
      },
    });
  } finally {
    monitor.stop();
    clearInterval(memoryTimer);
    loop.disable();
    if (pipeline) await pipeline.close();
    else {
      oldQueue!.close();
      await oldQueue!.drain();
    }
    await rm(directory, { recursive: true, force: true });
  }
}
if (
  results.some(
    (result) =>
      !result.stateIntegrity.valid ||
      !result.stateIntegrity.balanceReconciles ||
      !result.stateIntegrity.uniqueOpenMints ||
      !result.stateIntegrity.paperOnly ||
      result.duplicateLogicalProcessing !== 0,
  )
)
  throw Error("Benchmark state integrity failed");
if (staged && results.some((result) => result.uncompletedFixtureEvents !== 0))
  throw Error("Staged benchmark left fixture events incomplete");
const hashes: Record<string, string> = {};
for (const name of [
  "engine",
  "store",
  "chain",
  "model",
  "queue",
  "ingestion",
  "event-journal",
  "backfill",
  "stages",
])
  if (existsSync(join(root, "src", name + ".ts")))
    hashes[name] = createHash("sha256")
      .update(await readFile(join(root, "src", name + ".ts")))
      .digest("hex");
await writeFile(
  output,
  JSON.stringify(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      environment: {
        node: process.version,
        cpu: cpus()[0]?.model,
        platform: process.platform,
      },
      sourceRoot: root,
      staged,
      sourceSha256: hashes,
      harnessSha256: createHash("sha256")
        .update(
          await readFile(new URL("./ingestion-benchmark.ts", import.meta.url)),
        )
        .digest("hex"),
      scope:
        "Offline synthetic Pump logs and independent paper quotes; mocked historical swap reads and bounded RPC backfill. Each scenario is one run. Before/after use the same harness with legacy/staged adapters and identical offers. Legacy queue capacity 1024 (64 in saturation); new RAM flow 128 and journal pending 10000 (64 in saturation). Durable-burst includes actual filesystem writes, new WAL fsync and Store snapshots. Other scenarios are in-memory. Withheld fixture emission times are known only to this harness; they are not blockchain detection times. Memory peaks are sampled, process maxRSS includes earlier scenarios, event-loop delay uses 10ms sampling. One repeated mint in main fixtures has deliberate PDA cache locality; unique-mint cold decode is measured separately.",
      results,
    },
    null,
    2,
  ) + "\n",
);
