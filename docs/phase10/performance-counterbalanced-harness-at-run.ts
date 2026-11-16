import fs from "node:fs";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir, cpus } from "node:os";
import {
  monitorEventLoopDelay,
  performance,
  PerformanceObserver,
} from "node:perf_hooks";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import { Telemetry } from "../src/telemetry.js";
import { AsyncEventJournal } from "../src/async-journal.js";
import { pumpLogs } from "./benchmark-fixtures.js";
import { decodeVerifiedTransaction } from "../src/verified-decoders.js";
const args = process.argv.slice(2),
  opt = (n: string, d: string) =>
    args.includes(n) ? args[args.indexOf(n) + 1]! : d;
const baseline = resolve(opt("--before-root", "/tmp/mintbot-phase9-before")),
  runs = Number(opt("--runs", "3"));
if (!Number.isInteger(runs) || runs < 1 || runs > 10)
  throw Error("Use 1..10 runs");
const load = async (root: string) =>
  Object.fromEntries(
    await Promise.all(
      [
        "chain",
        "ingestion",
        "event-journal",
        "async-journal",
        "engine",
        "store",
        "model",
      ].map(async (name) => [
        name,
        await import(pathToFileURL(join(root, "src", name + ".ts")).href),
      ]),
    ),
  );
const before = await load(baseline),
  after = await load(resolve("."));
const config = JSON.parse(await readFile("config/strategy.json", "utf8"));
const baseLogs = pumpLogs(after.chain.VERIFIED_PROGRAMS[0].address);
const uniqueLogs = Array.from({ length: 10000 }, (_, i) => {
  const logs = [...baseLogs],
    b = Buffer.from(logs[1]!.slice(14), "base64");
  let offset = 8;
  for (let k = 0; k < 3; k++) offset += 4 + b.readUInt32LE(offset);
  const mint = Buffer.alloc(32);
  mint.writeUInt32LE(i + 1);
  const curve = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint],
    new PublicKey(after.chain.VERIFIED_PROGRAMS[0].address),
  )[0];
  b.set(mint, offset);
  b.set(curve.toBuffer(), offset + 32);
  logs[1] = `Program data: ${b.toString("base64")}`;
  return logs;
});
const recorded = await Promise.all(
  ["pump", "pumpswap", "raydium-cpmm", "meteora-dlmm"].map(async (program) => ({
    program,
    tx: JSON.parse(
      await readFile(`docs/phase3/fixtures/${program}-creation.json`, "utf8"),
    ).result,
    evidence: JSON.parse(
      await readFile(`docs/phase3/fixtures/${program}-accounts.json`, "utf8"),
    ),
  })),
);
const initialSeed=Number(opt("--seed","89271"));
if(!Number.isSafeInteger(initialSeed)||initialSeed<0||initialSeed>0xffffffff)throw Error("Benchmark seed bound");
let seed = initialSeed;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const selected = opt("--scenarios", "durable-burst-200,sustained-stream,concurrent-history-live").split(",");
const profile = args.includes("--profile");
const systemSnapshot = () => ({ stat: fs.readFileSync("/proc/stat", "utf8").split("\n")[0], loadavg: fs.readFileSync("/proc/loadavg", "utf8").trim() });
// Linux per-thread counters are sampled only within the measured job window.
// Disappearing/new threads retain their observed endpoints; no absent time is fabricated.
const schedulerEnabled = args.includes("--scheduling");
function schedulerSample() {
 const at = performance.now(), tasks: Record<string, { name: string; runtimeNs: string; runqueueWaitNs: string; slices: string }> = {};
 for (const tid of fs.readdirSync("/proc/self/task")) {
  try {
   const values = fs.readFileSync(`/proc/self/task/${tid}/schedstat`, "utf8").trim().split(/\s+/);
   tasks[tid] = { name: fs.readFileSync(`/proc/self/task/${tid}/comm`, "utf8").trim(), runtimeNs: values[0]!, runqueueWaitNs: values[1]!, slices: values[2]! };
  } catch { /* Thread may exit between list and reads. */ }
 }
 return { at, tasks };
}
function schedulingSummary(samples: ReturnType<typeof schedulerSample>[]) {
 const tids = [...new Set(samples.flatMap(s => Object.keys(s.tasks)))];
 return { intervalMs: 20, sampleCount: samples.length, observedSpanMs: samples.length ? samples.at(-1)!.at - samples[0]!.at : 0,
  mainTid: String(process.pid), threads: tids.map(tid => {
   const seen = samples.filter(s => s.tasks[tid]); const first = seen[0]!, last = seen.at(-1)!;
   const a = first.tasks[tid]!, b = last.tasks[tid]!;
   return { tid, name: b.name, main: tid === String(process.pid), observedSamples: seen.length,
    firstAtMs: first.at, lastAtMs: last.at,
    runtimeMs: Number(BigInt(b.runtimeNs)-BigInt(a.runtimeNs))/1e6,
    runqueueWaitMs: Number(BigInt(b.runqueueWaitNs)-BigInt(a.runqueueWaitNs))/1e6,
    schedulingSlices: Number(BigInt(b.slices)-BigInt(a.slices)) };
  }), samples };
}
let jsonStats = { stringifyCalls: 0, stringifyMs: 0, stringifyCharacters: 0, parseCalls: 0, parseMs: 0 };
const originalStringify = JSON.stringify, originalParse = JSON.parse;
if (profile) {
 JSON.stringify = ((...a: any[]) => { const t = performance.now(); const value = (originalStringify as any)(...a); jsonStats.stringifyCalls++; jsonStats.stringifyMs += performance.now()-t; jsonStats.stringifyCharacters += value?.length ?? 0; return value; }) as typeof JSON.stringify;
 JSON.parse = ((...a: any[]) => { const t = performance.now(); try { return (originalParse as any)(...a); } finally { jsonStats.parseCalls++; jsonStats.parseMs += performance.now()-t; } }) as typeof JSON.parse;
}
const jobs = [];
for (let repetition = 1; repetition <= runs; repetition++)
  for (const scenario of [
    "unique-mints-10000",
    "repeated-mint-10000",
    "durable-burst-200",
    "sustained-stream",
    "concurrent-history-live",
    "slow-unavailable-rpc",
  ].filter(x => selected.includes(x)))
    for (const adapter of (args.includes("--paired-order") && repetition%2===0 ? ["after","before"] : ["before", "after"]))
      jobs.push({ repetition, scenario, adapter });
for (let i = args.includes("--paired-order") ? 0 : jobs.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [jobs[i], jobs[j]] = [jobs[j]!, jobs[i]!];
}
const rows: any[] = [];
for (const job of jobs) {
  const modules = job.adapter === "before" ? before : after,
    metrics = new Telemetry(),
    external = new Telemetry(),
    dir = await mkdtemp(join(tmpdir(), "mintbot-phase3-bench-"));
  const durable = job.scenario === "durable-burst-200",
    count = job.scenario.includes("10000")
      ? 10000
      : durable
        ? 200
        : job.scenario === "concurrent-history-live"
          ? 1100
          : 1000;
  const journal = durable
    ? await modules["async-journal"].AsyncEventJournal.open(
        { path: join(dir, "wal"), batchDelayMs: Number(opt("--batch-delay", "2")) },
        metrics,
      )
    : new modules["event-journal"].EventJournal({
        path: durable ? join(dir, "wal") : undefined,
      });
  const state = modules.store.initial(
    modules.model.StrategySchema.parse(config),
  );
  state.running = true;
  const store = new modules.store.Store(
      state,
      durable ? join(dir, "state.json") : undefined,
      metrics,
    ),
    engine = new modules.engine.Engine(store, metrics);
  const emitted = new Map<string, number>(),
    origin = new Map<string, string>(),
    attempts = new Map<string, number>(),
    completed = new Set<string>();
  let duplicates = 0,
    refused = 0,
    rpcErrors = 0;
  let peakRss = process.memoryUsage().rss,
    peakHeap = process.memoryUsage().heapUsed;
  const sample = () => {
    const m = process.memoryUsage();
    peakRss = Math.max(peakRss, m.rss);
    peakHeap = Math.max(peakHeap, m.heapUsed);
  };
  const sampling = setInterval(sample, 5);
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();
  await new Promise((r) => setTimeout(r, 12));
  const gc: number[] = [];
  const gcObserver = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) gc.push(entry.duration);
  });
  gcObserver.observe({ entryTypes: ["gc"] });
  const pipeline = new modules.ingestion.EventIngestion({
    journal,
    metrics,
    enrich: async (e: any) => {
      if (job.scenario === "slow-unavailable-rpc") {
        await new Promise((r) => setTimeout(r, 2));
        const n = attempts.get(e.signature) ?? 0;
        attempts.set(e.signature, n + 1);
        if (Number(e.signature.slice(8)) % 37 === 0 && n < 2) {
          rpcErrors++;
          throw Error("Injected temporary provider failure");
        }
      }
    },
    strategy: async (e: any, _l: any, id: string) => {
      const q = modules.engine.syntheticLaunch(Number(e.signature.slice(8)));
      q.id = id;
      await engine.ingest(q);
    },
    persist: durable
      ? async (e: any) => {
          const { appendFile } = await import("node:fs/promises");
          await appendFile(join(dir, "raw.jsonl"), JSON.stringify(e) + "\n");
        }
      : undefined,
    onCommitted: (e: any) => {
      if (completed.has(e.signature)) duplicates++;
      completed.add(e.signature);
      const ms = performance.now() - emitted.get(e.signature)!;
      external.observe("end_to_end_ms", ms);
      if (origin.get(e.signature) === "live")
        external.observe("live_end_to_end_ms", ms);
    },
  });
  jsonStats = { stringifyCalls: 0, stringifyMs: 0, stringifyCharacters: 0, parseCalls: 0, parseMs: 0 };
  const systemBefore = systemSnapshot(), resourceBefore = process.resourceUsage();
  const schedulerSamples: ReturnType<typeof schedulerSample>[] = [];
  if (schedulerEnabled) schedulerSamples.push(schedulerSample());
  const schedulerTimer = schedulerEnabled ? setInterval(() => schedulerSamples.push(schedulerSample()), 20) : undefined;
  const cpu = process.cpuUsage(),
    memoryBefore = process.memoryUsage(),
    start = performance.now();
  try {
    for (let base = 0; base < count; base += 64) {
      const tasks = [];
      for (let n = base; n < Math.min(base + 64, count); n++) {
        const signature = `fixture-${n}`,
          kind =
            job.scenario === "concurrent-history-live" && n < 1000
              ? "history"
              : "live";
        emitted.set(signature, performance.now());
        origin.set(signature, kind);
        const event = {
          program: "pump",
          signature,
          slot: 1000 + n,
          logs:
            job.scenario === "unique-mints-10000" ? uniqueLogs[n]! : baseLogs,
          failed: false,
          observedAt: Date.now(),
        };
        if (journal.asynchronous)
          tasks.push(
            pipeline.acceptDurable(event, kind).then((r: any) => {
              if (r.status === "unrecoverable") refused++;
            }),
          );
        else {
          const r = pipeline.accept(event, kind);
          if (r.status === "unrecoverable") refused++;
        }
      }
      await Promise.all(tasks);
      sample();
      if (job.scenario === "sustained-stream")
        await new Promise((r) => setTimeout(r, 20));
    }
    await pipeline.drain(120000);
    const elapsedMs = performance.now() - start;
    if (schedulerTimer) clearInterval(schedulerTimer);
    if (schedulerEnabled) schedulerSamples.push(schedulerSample());
    sample();
    await new Promise((r) => setTimeout(r, 12));
    loop.disable();
    if (completed.size !== count || duplicates || refused)
      throw Error("Non-equivalent completion population");
    const integrity = {
      schemaValid: modules.model.StateSchema.safeParse(store.state).success,
      paperOnly: store.state.mode === "paper",
      uniqueOpenMints:
        new Set(store.state.positions.map((p: any) => p.mint)).size ===
        store.state.positions.length,
      balanceReconciles:
        Math.abs(
          store.state.balanceSol +
            store.state.positions.reduce(
              (s: number, p: any) => s + p.costSol,
              0,
            ) -
            10 -
            store.state.realizedPnlSol,
        ) < 1e-8,
    };
    if (Object.values(integrity).some((v) => !v))
      throw Error("Integrity failure");
    rows.push({
      ...job,
      offered: count,
      completed: completed.size,
      duplicateLogicalProcessing: duplicates,
      refused,
      distinctEventMints: job.scenario === "unique-mints-10000" ? 10000 : 1,
      elapsedMs,
      completedPerSecond: (count * 1000) / elapsedMs,
      latencies: external.snapshot(),
      cpuMicroseconds: process.cpuUsage(cpu),
      threadScheduling: schedulerEnabled ? schedulingSummary(schedulerSamples) : null,
      jsonInstrumentation: profile ? { ...jsonStats } : null,
      systemBefore, systemAfter: systemSnapshot(), resourceBefore, resourceAfter: process.resourceUsage(),
      memoryBefore,
      sampledPeakRssBytes: peakRss,
      sampledPeakHeapBytes: peakHeap,
      eventLoopDelayMs: {
        p95: loop.percentile(95) / 1e6,
        p99: loop.percentile(99) / 1e6,
        max: loop.max / 1e6,
      },
      gc: { observedCount: gc.length, totalMs: gc.reduce((a, b) => a + b, 0) },
      rpcErrors,
      journal: journal.status(),
      telemetry: metrics.report(),
      integrity,
    });
  } finally {
    clearInterval(sampling);
    if (schedulerTimer) clearInterval(schedulerTimer);
    loop.disable();
    gcObserver.disconnect();
    await pipeline.close();
    await rm(dir, { recursive: true, force: true });
  }
  process.stderr.write(
    `${job.scenario} ${job.adapter} run ${job.repetition}: ${rows.at(-1).completedPerSecond.toFixed(1)}/s\n`,
  );
}
const realReplay = [];
for (let repetition = 1; repetition <= runs; repetition++) {
  const m = new Telemetry(),
    cpu = process.cpuUsage(),
    start = performance.now();
  let total = 0;
  for (let i = 0; i < 100; i++)
    for (const record of recorded) {
      const t = performance.now();
      const decoded = decodeVerifiedTransaction(
        record.program,
        record.tx,
        record.evidence,
      );
      if (decoded.length !== 1) throw Error("Recorded fixture failed");
      m.observe("recorded_verified_decode_ms", performance.now() - t);
      total += decoded.length;
    }
  realReplay.push({
    repetition,
    decodeAttempts: 400,
    distinctFinalizedTransactions: 4,
    verifiedResults: total,
    elapsedMs: performance.now() - start,
    cpuMicroseconds: process.cpuUsage(cpu),
    latencies: m.snapshot(),
  });
}
const hash = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
const sourceSha256: Record<string, Record<string, string>> = {
  before: {},
  after: {},
};
for (const [name, root] of [
  ["before", baseline],
  ["after", resolve(".")],
])
  for (const file of [
    "event-journal",
    "async-journal",
    "ingestion",
    "store",
    "engine",
    "chain",
    "model",
    "journal-worker",
  ])
    sourceSha256[name!]![file] = await hash(join(root!, "src", file + ".ts"));
for (const [name, root] of [["before", baseline], ["after", resolve(".")]])
 sourceSha256[name!]!["journal-worker-bootstrap"] = await hash(join(root!, "src/journal-worker-bootstrap.mjs"));
JSON.stringify = originalStringify; JSON.parse = originalParse;
await writeFile(
  opt("--output", "docs/phase9/performance-matched.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment: { node: process.version, cpu: cpus()[0]?.model, kernel: fs.readFileSync("/proc/version", "utf8").trim(), schedulerStats: fs.existsSync("/proc/sys/kernel/sched_schedstats") ? fs.readFileSync("/proc/sys/kernel/sched_schedstats", "utf8").trim() : "unavailable", concurrentLoad: opt("--load-scope", "Unspecified shared-host load; pass --load-scope to attribute concurrent work") },
      seed: initialSeed,
      jobOrder: args.includes("--paired-order") ? "Paired, alternating first adapter by repetition" : "Seeded shuffle",
      repetitions: runs,
      sourceSha256,
      harnessSha256: await hash("scripts/phase9-performance-benchmark.ts"),
      comparisonKind: JSON.stringify(sourceSha256.before) === JSON.stringify(sourceSha256.after) ? "A/A unchanged source control; shared current dependencies; no optimization applied" : "Matched specified baseline/current source; shared current dependencies; inspect source hashes for change scope; no latency optimization claim", schedulerInstrumentation: schedulerEnabled, profileInstrumentation: profile, selectedScenarios: selected, batchDelayMs: Number(opt("--batch-delay", "2")),
      scope:
        "Offline synthetic Pump logs and independent paper quotes, identical offers/completion populations and file-fsync ownership guarantees. Disk workload includes real Store snapshots, raw append and WAL. Unique/repeated workloads use in-memory WAL. Jobs randomized with fixed seed. Fixture preparation and worker startup excluded. Distinct mint count describes encoded Pump events, not synthetic paper quotes. Slow provider faults recover after two failures; no safety evidence inferred. Sustained stream is a finite fixture soak with 64 events/20ms pacing, not a production endurance proof. Real replay has four distinct finalized captures repeated 100 times, with later finalized account evidence; no invented chain latency.",
      rows,
      realReplay,
    },
    null,
    2,
  ) + "\n",
);
