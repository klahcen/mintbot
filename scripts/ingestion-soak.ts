import { AsyncEventJournal } from "../src/async-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import { Telemetry } from "../src/telemetry.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
const args = process.argv.slice(2),
  opt = (n: string, d: string) =>
    args.includes(n) ? args[args.indexOf(n) + 1]! : d;
const seconds = Number(opt("--seconds", "30")),
  rate = Number(opt("--rate", "200")),
  limit = 10000;
if (
  !Number.isInteger(seconds) ||
  seconds < 5 ||
  seconds > 3600 ||
  !Number.isInteger(rate) ||
  rate < 10 ||
  rate > 1000
)
  throw Error(
    "Use 5..3600 seconds and 10..1000 target events/s; fixed total event cap 10000",
  );
const dir = await mkdtemp(join(tmpdir(), "mintbot-soak3-")),
  metrics = new Telemetry(),
  journal = await AsyncEventJournal.open({ path: join(dir, "wal") }, metrics),
  external = new Telemetry(),
  seen = new Set<string>(),
  emitted = new Map<string, number>();
let duplicateCallbacks = 0,
  offered = 0,
  refused = 0,
  peakRss = process.memoryUsage().rss,
  peakHeap = process.memoryUsage().heapUsed;
const pipeline = new EventIngestion({
  journal,
  metrics,
  onCommitted: (event) => {
    if (seen.has(event.signature)) duplicateCallbacks++;
    seen.add(event.signature);
    external.observe(
      "receipt_to_completion_ms",
      performance.now() - emitted.get(event.signature)!,
    );
    emitted.delete(event.signature);
  },
});
const sample = setInterval(() => {
    const m = process.memoryUsage();
    peakRss = Math.max(peakRss, m.rss);
    peakHeap = Math.max(peakHeap, m.heapUsed);
  }, 250),
  loop = monitorEventLoopDelay({ resolution: 10 });
loop.enable();
const start = performance.now(),
  cpu = process.cpuUsage();
try {
  while (performance.now() - start < seconds * 1000 && offered < limit) {
    const tick = performance.now();
    const cohort = [];
    for (let i = 0; i < Math.min(20, limit - offered); i++) {
      const id = offered++;
      const signature = `soak-${id}`;
      emitted.set(signature, performance.now());
      cohort.push(
        pipeline
          .acceptDurable({
            program: "pumpswap",
            signature,
            slot: 100000 + id,
            observedAt: Date.now(),
            logs: [],
            failed: false,
          })
          .then((r) => {
            if (r.status === "unrecoverable") refused++;
          }),
      );
    }
    await Promise.all(cohort);
    const pause = 20000 / rate - (performance.now() - tick);
    if (pause > 0) await new Promise((r) => setTimeout(r, pause));
  }
  const offerWindowMs = performance.now() - start;
  await pipeline.drain(60000);
  const elapsedMs = performance.now() - start;
  loop.disable();
  if (seen.size !== offered || refused || duplicateCallbacks || emitted.size)
    throw Error("Soak population/integrity failed");
  await writeFile(
    opt("--output", "docs/phase3/soak.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        requestedSeconds: seconds,
        targetEventsPerSecond: rate,
        totalEventCap: limit,
        offered,
        completed: seen.size,
        refused,
        duplicateCallbacks,
        offerWindowMs,
        elapsedMs,
        completedPerSecond: (seen.size * 1000) / elapsedMs,
        peakRssBytes: peakRss,
        peakHeapBytes: peakHeap,
        cpuMicroseconds: process.cpuUsage(cpu),
        latencies: external.snapshot(),
        eventLoopDelayMs: {
          p95: loop.percentile(95) / 1e6,
          p99: loop.percentile(99) / 1e6,
          max: loop.max / 1e6,
        },
        journal: journal.status(),
        telemetry: metrics.report(),
        scope:
          "Single bounded-duration durable worker-journal ingestion soak; empty observation-only logs, no paper quotes/trades, RPC, raw writes or Store snapshots. Paced cohorts of 20, fixed total event cap, no catch-up timer queue. All offers must complete once. After-only health observation, not a comparative performance improvement or production endurance proof.",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  clearInterval(sample);
  loop.disable();
  await pipeline.close();
  await rm(dir, { recursive: true, force: true });
}
