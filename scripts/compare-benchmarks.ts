import { readFile, writeFile } from "node:fs/promises";
const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1]!;
};
const beforePath = option("--before", "docs/latency/before.json"),
  afterPath = option("--after", "docs/latency/after.json");
interface Histogram {
  count: number;
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}
interface Run {
  scenario: string;
  offered: number;
  completed: number;
  duplicates: number;
  dropped: number;
  rpcErrors: number;
  reconnects: number;
  completedEventsPerSecond: number;
  queue: Record<string, { current: number; peak: number }>;
  latencies: Record<string, Histogram>;
  internal: { histograms: Record<string, Histogram> };
  conservation: { offeredEqualsCompletedDuplicatesDropped: boolean };
}
interface Report {
  generatedAt?: string;
  environment: { node: string; cpu: string; platform: string; arch: string };
  workload: { events: number; repetitions: number; harnessSha256: string };
  results: Run[];
}
const read = async (path: string) =>
  JSON.parse(await readFile(path, "utf8")) as Report;
const before = await read(beforePath),
  after = await read(afterPath);
let testSummary = "Final test results: see the captured test logs.";
try {
  const log = await readFile("docs/latency/after-tests.txt", "utf8");
  const count = /# tests (\d+)/.exec(log)?.[1];
  const failures = /# fail (\d+)/.exec(log)?.[1];
  if (count && failures)
    testSummary = `Final suite: ${count} tests, ${failures} failures; [captured output](latency/after-tests.txt).`;
} catch {}
const recordedDate = new Date(
  after.generatedAt ?? Date.now(),
).toLocaleDateString("en-CA", { timeZone: "Africa/Casablanca" });
if (
  before.workload.events !== after.workload.events ||
  before.workload.repetitions !== after.workload.repetitions ||
  before.workload.harnessSha256 !== after.workload.harnessSha256
)
  throw Error("Workload/harness mismatch: do not compare incompatible runs");
if (
  before.environment.node !== after.environment.node ||
  before.environment.cpu !== after.environment.cpu
)
  throw Error("Benchmark environment mismatch");
const median = (values: number[]) => {
  const a = [...values].sort((a, b) => a - b);
  return a.length % 2
    ? a[Math.floor(a.length / 2)]!
    : (a[a.length / 2 - 1]! + a[a.length / 2]!) / 2;
};
const format = (n: number) => n.toFixed(3);
const range = (values: number[]) =>
  Math.min(...values) === Math.max(...values)
    ? String(values[0])
    : `${Math.min(...values)}–${Math.max(...values)}`;
let text = `# Phase 1: repository audit and measured latency report\n\nRecorded ${recordedDate}. Live trading remains disabled. No application/frontend/Docker build or deployment was run for this phase. The original 34 tests passed before changes.\n\n## Audit against README\n\n| README contract | Audit result and instrumentation change |\n| --- | --- |\n| Paper-only runtime and disconnected live executor | Preserved. Added a live-mode rejection regression; no new signing or trade route. |\n| Verified program observations, pinned Pump decoder, bounded dedupe/reconnect | Preserved. Added receipt/JSON-decode/dedupe/decoder timings, distinct errors and reconnect counters; injected scheduler enables deterministic tests. No new venue decoder or gap backfill claimed. |\n| Risk filters, paper buys/sells, delayed entries and exits | Preserved. Added risk/strategy/exit-decision and paper execution spans. Existing duplicate risk assessments remain observable; no strategy optimization attempted. |\n| Serialized atomic snapshots | Preserved. Queue wait, clone, validation, persistence and transaction timings added. Store admission remains unbounded. |\n| Bounded monitor persistence backlog | Same limit of 100 total pending tasks; extracted a measured FIFO used by server and CLI. Queue overload is explicit; duplicate suppression and dedupe eviction are distinct from drops. |\n| Existing benchmark and replay | Old benchmark had only serial ingestion latency. New pipeline replay covers bursts, duplicate replay, overload, local reconnect and injected RPC errors; the original paper replay output is retained with additive telemetry. |\n| Dashboard and deployment | No frontend, dependency, config policy, schema, or Docker change required. Existing dashboard/state shape retained with additive telemetry and authenticated /api/metrics. |\n\n## Method\n\nSame harness SHA-256: \`${before.workload.harnessSha256}\`. Runtime: ${before.environment.node}, ${before.environment.platform}/${before.environment.arch}, ${before.environment.cpu}. Each version ran ${before.workload.repetitions} independent repetitions of ${before.workload.events} offered events per scenario, after a separate 32-event warm-up of each scenario. Raw results contain source hashes and every run. The archived before source is in [before-source.tar.gz](latency/before-source.tar.gz); [original serial baseline](latency/before-legacy.json) is retained separately and is **not** compared to the new pipeline workload.\n\nThe pipeline replays synthetic, exact-schema Pump logs through the actual monitor, decoder, mocked historical transaction inspection and paper engine. Paper prices and risk assertions are independent synthetic fixtures, not evidence derived from live logs. The queue runs FIFO; overload capacity is 64, other scenarios have sufficient capacity. Duplicate pattern repeats one signature per four offers. Overload injects one transport failure/reconnect and replays a prior signature; each accepted ID divisible by 17 fails a mocked read. These error counts are controlled injected faults, not a measured public RPC reliability rate.\n\nDurations use monotonic performance.now. Each table cell is the **median of per-run statistics**, not a pooled percentile. Quantiles use the existing floor((n-1)*p) convention; ring samples are bounded to 10,000 and lifetime counts are separate. End-to-end is local offer through accepted task completion, including queue wait; duplicates/drops do not receive completion-latency samples. Completion throughput excludes duplicates and drops. The local 1 ms reconnect timer includes event-loop backlog and is not a provider reconnect benchmark. There is no disk/network/signing/chain-landing measurement.\n\n## Comparable before/after results\n\n| Scenario | Version | Completed/s | End-to-end p50 ms | p95 ms | p99 ms | Completed | Duplicates | Drops | RPC errors | Queue depth peak |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |\n`;
for (const scenario of [...new Set(before.results.map((r) => r.scenario))])
  for (const [name, report] of [
    ["Before", before],
    ["After", after],
  ] as const) {
    const runs = report.results.filter((r) => r.scenario === scenario);
    const h = (p: "p50" | "p95" | "p99") =>
      format(median(runs.map((r) => r.latencies["replay.end_to_end_ms"]![p])));
    text += `| ${scenario} | ${name} | ${format(median(runs.map((r) => r.completedEventsPerSecond)))} | ${h("p50")} | ${h("p95")} | ${h("p99")} | ${range(runs.map((r) => r.completed))} | ${range(runs.map((r) => r.duplicates))} | ${range(runs.map((r) => r.dropped))} | ${range(runs.map((r) => r.rpcErrors))} | ${range(runs.map((r) => r.queue["replay.queue_depth"]!.peak))} |\n`;
  }
text +=
  "\n## Queue wait and service time\n\nExternal harness measurements on both versions. Queue wait excludes active service; processing includes decode, mocked inspection, paper ingestion and local commit.\n\n| Scenario | Version | Boundary | p50 ms | p95 ms | p99 ms |\n| --- | --- | --- | ---: | ---: | ---: |\n";
for (const scenario of [...new Set(before.results.map((r) => r.scenario))])
  for (const [label, report] of [
    ["Before", before],
    ["After", after],
  ] as const)
    for (const [metric, labelled] of [
      ["replay.queue_wait_ms", "Waiting"],
      ["replay.processing_ms", "Processing"],
    ] as const) {
      const runs = report.results.filter((r) => r.scenario === scenario);
      const percentile = (p: "p50" | "p95" | "p99") =>
        format(median(runs.map((r) => r.latencies[metric]![p])));
      text += `| ${scenario} | ${label} | ${labelled} | ${percentile("p50")} | ${percentile("p95")} | ${percentile("p99")} |\n`;
    }
text +=
  "\n## New internal stage observations\n\nSequential scenario; median per-run values. Before had no internal stage telemetry, so these stages have no invented before values. Nested spans overlap: strategy includes its risk check; ingestion includes queued Store work; monitor ingestion includes callback enqueue. Do not sum them. Paper execution is mutation-attempt time, not chain execution or durable commit time.\n\n| Stage | Before | After p50 ms | After p95 ms | After p99 ms | Samples per run |\n| --- | --- | ---: | ---: | ---: | ---: |\n";
const sequential = after.results.filter((r) => r.scenario === "sequential");
for (const name of [
  "monitor.ingestion_ms",
  "monitor.json_decoding_ms",
  "monitor.deduplication_ms",
  "decoding_ms",
  "engine.deduplication_ms",
  "risk_evaluation_ms",
  "strategy_decision_ms",
  "paper_execution_ms",
  "rpc.getParsedTransaction_ms",
  "ingestion_ms",
  "store.queue_wait_ms",
  "store.clone_ms",
  "store.validation_ms",
  "store.transaction_ms",
]) {
  const rows = sequential.map((r) => r.internal.histograms[name]);
  if (rows.some((r) => !r)) {
    text += `| ${name} | Unmeasured | Unmeasured | Unmeasured | Unmeasured | 0 |\n`;
    continue;
  }
  text += `| ${name} | Unmeasured | ${format(median(rows.map((r) => r!.p50)))} | ${format(median(rows.map((r) => r!.p95)))} | ${format(median(rows.map((r) => r!.p99)))} | ${range(rows.map((r) => r!.samples))} |\n`;
}
text += `\n## Validation\n\n${testSummary} Source and frontend TypeScript passed with --noEmit. The regression suite includes deterministic burst admission/FIFO/drain, reconnect timing/cancellation, duplicate retention across sockets, eviction, decoder rejection, RPC fault accounting, queue failures, paper accounting, and live-mode rejection. No application, frontend or Docker build was run.\n`;
text +=
  "\n## Interpretation and limits\n\nThese observations measure this offline fixture workload and include instrumentation overhead, JIT, host scheduling and run-to-run noise. No optimization or improvement is established or claimed. Before and after runs are separate batches; they are not randomized trials. All offered events must reconcile as completed + duplicates + drops in every finished run; raw outputs expose this check. Strategy/risk rejection is a completed evaluation, not a dropped event. Queue peak is a discrete high-water mark including transient tasks awaiting their first microtask; pending additionally includes active work. Reconnect gaps are not counted as known lost events: their true loss is unknown without backfill.\n\nSource time does not measure when a launch occurred on-chain. RPC faults here are injected; actual RPC method durations/errors are instrumented for future configured read-only operation. Existing live-executor metrics remain disconnected from the server. Histogram snapshots and counters reset with each process/collector; samples are in memory, contain no wallet keys or high-cardinality event IDs, and are not a permanent metrics database.\n\nSee [raw before](latency/before.json), [raw after](latency/after.json), and [instrumentation contract](latency/README.md). The original README limitations—unimplemented swap/enrichment/signer work, no gap backfill, legacy dependency findings—remain in force.\n";
if (
  [...before.results, ...after.results].some(
    (r) => !r.conservation.offeredEqualsCompletedDuplicatesDropped,
  )
)
  throw Error("Replay event conservation failed");
await writeFile(option("--output", "docs/phase1-latency-report.md"), text);
