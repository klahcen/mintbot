import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const read = async (name: string) =>
  JSON.parse(await readFile(`docs/phase2/${name}.json`, "utf8"));
const [before, after, store, decoder, wb, wl, wa, dd] = await Promise.all(
  [
    "before",
    "after",
    "store-only",
    "store-decoder",
    "workloads-before",
    "workloads-optimized-legacy",
    "workloads-after",
    "decoder-detail",
  ].map(read),
);
assert.equal(before.workload.harnessSha256, after.workload.harnessSha256);
assert.deepEqual(before.environment, after.environment);
assert.equal(before.workload.events, after.workload.events);
assert.equal(before.workload.repetitions, after.workload.repetitions);
for (const data of [store, decoder]) {
  assert.equal(data.workload.harnessSha256, before.workload.harnessSha256);
  assert.deepEqual(data.environment, before.environment);
}
for (const data of [wl, wa]) {
  assert.equal(data.harnessSha256, wb.harnessSha256);
  assert.deepEqual(data.environment, wb.environment);
}
for (const data of [before, store, decoder, after])
  for (const row of data.results)
    assert.equal(
      row.conservation.offeredEqualsCompletedDuplicatesDropped,
      true,
    );
for (const row of wa.results) {
  assert.equal(row.uncompletedFixtureEvents, 0);
  assert.equal(row.duplicateLogicalProcessing, 0);
  for (const [key, value] of Object.entries(row.stateIntegrity))
    if (typeof value === "boolean") assert.equal(value, true, key);
}
const median = (xs: number[]) =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
const f = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? n.toFixed(3) : "unmeasured";
const med = (data: any, scenario: string, metric: (r: any) => number) =>
  median(data.results.filter((r: any) => r.scenario === scenario).map(metric));
const e2e = (r: any) => r.latencies["replay.end_to_end_ms"];
const lines: string[] = [];
const out = (text = "") => lines.push(text);
out("# Phase 2 engineering report");
out();
out(
  `Generated from recorded JSON on ${new Date().toISOString()}. All results are offline fixtures on ${after.environment.node}, ${after.environment.cpu}, ${after.environment.platform}/${after.environment.arch}. No live RPC benchmark, funded transaction, deployment or application/dashboard build was performed. Live mode remains rejected at startup.`,
);
out();
out("## Outcome and limits");
out();
const bp = med(before, "dedupe-burst", (r) => e2e(r).p95),
  ap = med(after, "dedupe-burst", (r) => e2e(r).p95);
out(
  `The retained Phase 1 replay's median duplicate-burst p95 fell from **${f(bp)} ms to ${f(ap)} ms** (${f((1 - ap / bp) * 100)}% lower). This measures Store/decoder changes through the same legacy replay queue; it does not measure the new runtime queue. The staged 10,000-event fixture completed every input, compared with 1,024 completions and 8,976 refused admissions in the legacy adapter. Saturation recovered 936 refused receipts and the disconnect fixture recovered 100 withheld events using mocked available history. These controlled fixtures do not prove complete mainnet recovery.`,
);
out();
const durableB = wb.results.find((r: any) => r.scenario === "durable-burst"),
  durableA = wa.results.find((r: any) => r.scenario === "durable-burst");
out(
  `**Measured regression:** durable-burst throughput fell from ${f(durableB.completedEventsPerSecond)} to ${f(durableA.completedEventsPerSecond)} completed events/s; p95 rose from ${f(durableB.latencies.end_to_end_ms.p95)} to ${f(durableA.latencies.end_to_end_ms.p95)} ms. The new path includes synchronous WAL append/fsync and completion records. This comparison changes durability guarantees and cannot isolate filesystem overhead alone. Against the optimized Store/decoder legacy adapter, staging is also slower on several in-memory workloads; the ablation below exposes that cost.`,
);
out();
out("## Repository audit and implementation");
out();
out(
  "The audit inspected executable source rather than accepting README claims. At the Phase 2 baseline, WebSocket JSON handling and callbacks were synchronous, monitor dedupe was a process-local bounded signature/program Set, and each observation's decode, raw persistence, optional database audit and dashboard transaction shared a serial FIFO with 100 admitted tasks. Overload was explicitly counted but had no durable work ownership or historical repair. Reconnect resubscribed with backoff and tracked a latest slot without closing coverage gaps. The Store serialized transactions but admitted an unbounded promise backlog; every paper event cloned and validated full histories. Risk and strategy evaluation run inside that transaction and assess evidence twice under the existing rules. Profiling showed history cloning/validation dominating the sequential local fixture; the baseline Store clone/validation numbers below substantiate that finding.",
);
out();
out(
  "Implemented changes preserve the React dashboard, risk/accounting rules, API fields and paper-only guard:",
);
out();
out(
  "- `Store.paperTransaction` isolates active state while sharing only deeply frozen, schema-validated plain history rows. Newly added rows and all active fields/root limits remain validated. Generic `transaction` retains full clone/full validation. Store admission is now bounded to 1,024 total pending transactions with explicit rejection metrics; writes still publish only after the existing atomic rename succeeds.",
);
out(
  "- The Pump decoder caches deterministic expected PDA derivations in a 512-entry LRU and caches constant address encodings. Every event still checks stack attribution, discriminator/schema, failed execution and equality with the expected PDA. `DecoderRegistry` exposes future decoder interfaces; PumpSwap, Raydium CPMM and Meteora DLMM are observation-only.",
);
out(
  "- `EventIngestion` admits receipts to a bounded durable journal before processing, dedupes by verified program address plus signature, limits global flow to 128, and separates decode (1), enrichment (4), strategy (1) and persistence (1) workers. Overload beyond RAM remains journaled; beyond journal capacity records a gap and pauses runtime providers. Stable paper IDs remain necessary for idempotent callback replay.",
);
out(
  "- `EventJournal` retains pending work, completed IDs, anchors, conservative dedupe slot floors, retries/quarantine and coalesced gaps across restart. It bounds records and bytes, checks single-writer ownership, truncates only an incomplete final WAL record, and fails on complete-record corruption. Work acknowledgements follow persistence. Stage failures retry up to three times and then remain quarantined and visible.",
);
out(
  "- `recoverGap` paginates supported read-only RPC with overlap, bounded concurrent transaction retrieval, retry/429 handling and coverage checks. `RecoveryCoordinator` coalesces requests per program and bounds automatic cycles. HTTP response size/timeout and WebSocket payload/handshake/heartbeat are bounded. Primary/secondary providers share one journal.",
);
out(
  "- Server and CLI share the monitoring service; server health/counter updates are batched at 250 ms with at most one Store flush active. Existing API fields remain; authenticated ingestion status and manual recovery endpoints are additive. Read-only chain observations never acquire synthetic prices or automatically open paper positions. Optional SQL observation audit has 64 admitted tasks/two workers and explicit failure/refusal counters after raw persistence.",
);
out();
out("## Retained Phase 1 workload: comparable three-run medians");
out();
out(
  "The Phase 1 figures quoted in the request remain historical; this report uses a newly measured Phase 2 baseline on the same host as its after run. Identical unchanged `scripts/benchmark.ts`, 1,000 primary offers per scenario (plus one duplicate reconnect re-offer in overload), three independent repetitions, 32 warmup offers per scenario. Values below are the median of the three run percentiles/rates, not pooled quantiles. No disk persistence is configured. Full per-run values, nested timings and counts are in [before.json](phase2/before.json) and [after.json](phase2/after.json).",
);
out();
out(
  "| Scenario | Version | p50 ms | p95 ms | p99 ms | Completed/s | Completed / duplicate / refused | RPC errors |",
);
out("| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |");
for (const scenario of ["sequential", "dedupe-burst", "overload-reconnect"])
  for (const [label, data] of [
    ["Before", before],
    ["After", after],
  ] as const) {
    const row = data.results.find((r: any) => r.scenario === scenario);
    out(
      `| ${scenario} | ${label} | ${f(med(data, scenario, (r) => e2e(r).p50))} | ${f(med(data, scenario, (r) => e2e(r).p95))} | ${f(med(data, scenario, (r) => e2e(r).p99))} | ${f(med(data, scenario, (r) => r.completedEventsPerSecond))} | ${row.completed} / ${row.duplicates} / ${row.dropped} | ${row.rpcErrors} |`,
    );
  }
out();
out(
  "The retained overload harness still refuses 622 offers. Its FIFO/capacity deliberately remain unchanged, so this is not a claim that the runtime lost 622 events after Phase 2. Default paper limits allow only five buy mutations per normal run; all other completions include valid strategy rejections. RPC errors here are injected independent historical reads, not evidence supporting synthetic risk assertions.",
);
out();
out("## Independent optimization checkpoints");
out();
out(
  "Each checkpoint was measured after focused tests, before the next optimization. These are chronological snapshots, not randomized isolated causal experiments. Final Store hardening/formatting is represented by the final after run; checkpoint hashes identify earlier measured sources.",
);
out();
out(
  "| Checkpoint | Sequential p95 ms | Duplicate-burst p95 ms | Overload p95 ms | Sequential completed/s |",
);
out("| --- | ---: | ---: | ---: | ---: |");
for (const [label, data] of [
  ["Baseline", before],
  ["Store only", store],
  ["Store + decoder checkpoint", decoder],
  ["Final Store + decoder", after],
] as const)
  out(
    `| ${label} | ${f(med(data, "sequential", (r) => e2e(r).p95))} | ${f(med(data, "dedupe-burst", (r) => e2e(r).p95))} | ${f(med(data, "overload-reconnect", (r) => e2e(r).p95))} | ${f(med(data, "sequential", (r) => r.completedEventsPerSecond))} |`,
  );
out();
out(
  "| Sequential Store stage | Before p50 ms | Store checkpoint p50 ms | Final p50 ms |",
);
out("| --- | ---: | ---: | ---: |");
for (const key of [
  "store.clone_ms",
  "store.validation_ms",
  "store.queue_wait_ms",
])
  out(
    `| ${key} | ${f(med(before, "sequential", (r) => r.internal.histograms[key]?.p50))} | ${f(med(store, "sequential", (r) => r.internal.histograms[key]?.p50))} | ${f(med(after, "sequential", (r) => r.internal.histograms[key]?.p50))} |`,
  );
out();
out(
  "Checkpoint data: [Store only](phase2/store-only.json), [Store + decoder](phase2/store-decoder.json). Full baseline sources are archived; these intermediate checkpoint hashes are retained in JSON, but intermediate sources were not separately archived.",
);
out();
out(
  "Decoder-only paired test excludes fixture generation and compares cache disabled/enabled on the same final decoder. Each row is one ordered 1,000-event run; these are not confidence intervals.",
);
out();
out(
  "| Decode fixture | Cache | Total ms | Decode p95 ms | Cache hits / misses |",
);
out("| --- | --- | ---: | ---: | --- |");
for (const row of dd.rows)
  out(
    `| ${row.workload} | ${row.pdaCache ? "on" : "off"} | ${f(row.elapsedMs)} | ${f(row.histograms.decoding_ms.p95)} | ${row.counters["decoding.pda_cache_hits"] ?? 0} / ${row.counters["decoding.pda_cache_misses"] ?? 0} |`,
  );
out();
out(
  "The main replay deliberately repeats one mint and benefits from warm PDA cache locality. Unique-mint cold decoding has no cache hits; do not extrapolate repeated-mint gains to fresh mainnet launches. See [decoder-detail.json](phase2/decoder-detail.json).",
);
out();
out("## Extended runtime workloads and stage ablation");
out();
out(
  "Same source harness and identical offers, one run per workload/version in fixed order: baseline source + legacy adapter; final Store/decoder + legacy adapter; final staged adapter. The legacy adapter admits 1,024 events (64 for saturation). The staged adapter admits 128 active flows plus a 10,000-entry journal (64 for saturation). Only durable-burst writes Store snapshots/raw JSONL and the new fsynced WAL; other workloads use an in-memory journal/Store. Enrichment is an independent mocked historical read, not live safety evidence. Sustained delivery offers ten events then waits 5 ms; it is not a fixed-rate open-loop load generator.",
);
out();
out(
  "| Workload | Version | Completed / unique offered | p50 ms | p95 ms | p99 ms | Completed/s |",
);
out("| --- | --- | --- | ---: | ---: | ---: | ---: |");
for (let i = 0; i < wa.results.length; i++)
  for (const [label, data] of [
    ["Before", wb],
    ["Optimized legacy", wl],
    ["Staged", wa],
  ] as const) {
    const r = data.results[i],
      h = r.latencies.end_to_end_ms;
    out(
      `| ${r.scenario} | ${label} | ${r.completed} / ${r.uniqueOffered} | ${f(h.p50)} | ${f(h.p95)} | ${f(h.p99)} | ${f(r.completedEventsPerSecond)} |`,
    );
  }
out();
out(
  "Stress and saturation latency populations differ: the staged run finishes far more events, including old work the legacy adapter refused. Their higher p95 measures backlog age and must not be sold as a comparable latency improvement. Disconnect before has 900 successful samples versus 1,000 after; the 100 withheld fixture timestamps are known only to the harness. Durable-burst has matching successful populations and regresses. Staging also adds observable cost relative to the optimized legacy adapter on burst, sustained, duplicate-heavy and durable runs; most local speedup comes from Store/decoder work, while staged admission primarily improves ownership and recovery.",
);
out();
out("## Accounting, loss and recovery");
out();
out(
  "Refused admissions count receipt attempts, not permanent loss. Deferred means admitted to the journal beyond the RAM flow budget. `Uncompleted` below counts fixture identities absent at final drain; actual unseen chain activity has no known count. Duplicates are offers, never successful second callbacks. No staged fixture leaves pending or quarantined work; all reported integrity flags pass (schema, account reconciliation, unique open mints and paper mode). No workload has duplicate logical callbacks.",
);
out();
out(
  "| Workload | Version | Duplicate offers | Refused attempts | Deferred → finished | Historical recovered | Uncompleted fixture IDs | Injected RPC errors | Recovery result |",
);
out("| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- |");
for (let i = 0; i < wa.results.length; i++)
  for (const [label, data] of [
    ["Before", wb],
    ["Staged", wa],
  ] as const) {
    const r = data.results[i];
    out(
      `| ${r.scenario} | ${label} | ${r.duplicateOffers} | ${r.knownRefusedAdmissions} | ${r.deferred} → ${r.deferredCompleted} | ${r.recovered} | ${r.uncompletedFixtureEvents} | ${r.rpcErrors} | ${r.recovery ? `${r.recovery.status}; ${r.recovery.pages} pages; ${r.recovery.unavailable} unavailable` : "not attempted"} |`,
    );
  }
out();
out(
  "The 900 duplicate-heavy offers represent 100 distinct event identities; each is processed once. The saturation fixture recovers its 936 refused observations only because the mock RPC retains them and budgets suffice. In real operation receipt refusal increments a known-refusal count but unknown subscription downtime remains an interval. Missing transaction data, truncated windows, unavailable anchors, pagination limits, non-advancing cursors, RPC failures, quarantined work and exhausted cycles cannot be reported as complete coverage. Focused tests assert these incomplete/unrecoverable outcomes.",
);
out();
out("## Queue waiting, memory and event-loop delay");
out();
out(
  "Peak RSS/heap are sampled every 5 ms and at receipt/completion checkpoints; they can miss brief peaks. Each adapter runs its workloads in one process, so GC and earlier workloads affect values. Event-loop delay uses 10 ms sampling; `unmeasured` means too few timer observations. These are host observations, not a memory ceiling or long-duration soak proof. The finite queue/byte limits are established by implementation and tests.",
);
out();
out(
  "| Workload | Version | Peak RSS MiB | Peak heap MiB | Loop p95 ms | Loop max ms | Observation/decode queue wait p95 ms | Peak admitted RAM queue |",
);
out("| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |");
for (let i = 0; i < wa.results.length; i++)
  for (const [label, data] of [
    ["Before", wb],
    ["Staged", wa],
  ] as const) {
    const r = data.results[i],
      prefix = label === "Before" ? "legacy.observations" : "ingest.decode";
    out(
      `| ${r.scenario} | ${label} | ${f(r.memory.sampledPeakRssBytes / 1048576)} | ${f(r.memory.sampledPeakHeapUsedBytes / 1048576)} | ${f(r.eventLoopDelayMs.p95)} | ${f(r.eventLoopDelayMs.max)} | ${f(r.telemetry.histograms[prefix + ".queue_wait_ms"]?.p95)} | ${r.telemetry.gauges[prefix + ".pending"]?.peak ?? "unmeasured"} |`,
    );
  }
out();
out(
  "Queue waits cover only residence after each stage admission; journal backlog residence is included in receipt-to-completion latency, not in decode queue wait. Restart latency starts at local resumption because process-local monotonic origins cannot span restart. Stage end-to-end spans are nested and must not be summed.",
);
out();
out(
  "| Staged workload | Decode queue p95 ms | Enrichment queue p95 ms | Strategy queue p95 ms | Persistence queue p95 ms | Peak journal pending | End pending / quarantine |",
);
out("| --- | ---: | ---: | ---: | ---: | ---: | --- |");
for (const r of wa.results) {
  const h = r.telemetry.histograms,
    g = r.telemetry.gauges;
  out(
    `| ${r.scenario} | ${f(h["ingest.decode.queue_wait_ms"]?.p95)} | ${f(h["ingest.enrichment.queue_wait_ms"]?.p95)} | ${f(h["ingest.strategy.queue_wait_ms"]?.p95)} | ${f(h["ingest.persistence.queue_wait_ms"]?.p95)} | ${g["ingest.journal_pending"]?.peak ?? "not sampled"} | ${r.journal.pending} / ${r.journal.quarantined} |`,
  );
}
out();
out(
  "The JSON includes all stage histograms, queue/in-flight gauge peaks, lifetime maxRSS, retry and recovery counts. Journal pending peak is not instrumented as a gauge in this version; final pending and configured bounds are exposed in status. This omission is explicit rather than substituting capacity for a measured peak.",
);
out();
out("## Validation and remaining work");
out();
out(
  "Final `npm test`: **72 passed, 0 failed**, including all original 50 regression tests. `npm run typecheck` passed for backend/tests/scripts and frontend (`noEmit`). The test command limits parallel files to four to avoid cold tsx compilation causing the original fixed API-startup deadline to fail under load; no original assertion or timeout was weakened. Tests cover 1,000 duplicate/provider/history offers, bounded workers/backpressure, WAL restart/truncated-tail handling, dedupe floors, malformed work quarantine, paginated overlap and missing history, 429 waits, first-RPC-failure cycle exhaustion, real local WebSocket/HTTP reconnect, silent heartbeat loss and two-provider overlap. The crash test sends SIGKILL after a paper snapshot commit but before journal acknowledgement, restores the WAL and Store, and verifies no second buy or fee using the retained stable paper ID. This proves that tested crash boundary, not arbitrary power-loss exactly-once execution.",
);
out();
out("Remaining limitations:");
out();
out(
  "1. Synchronous fsync/compaction blocks the event loop and regresses durable throughput. Group commit or a worker-owned durable queue needs separate acknowledgement/failure testing before replacing it.",
);
out(
  "2. Journal completion and Store/raw/SQL side effects are not one atomic database transaction. Callback replay is at least once until acknowledgement; consumers must be idempotent. The existing paper `seen` list retains 10,000 IDs, so replay outside that horizon cannot promise indefinite duplicate suppression. Raw JSONL can contain duplicate audit lines after a crash. No funded execution is connected.",
);
out(
  "3. Dedupe and history are finite. Completed-ID eviction raises a conservative per-program slot floor; older unknown events are explicitly rejected as gaps, including legitimate delayed events. Raising bounds is not a proof of complete historical ownership.",
);
out(
  "4. A recovered window is provider-reported coverage within configured bounds, not a cryptographic chain completeness proof. Confirmed observations can reorganize; there is no finalized fork rollback or independent provider-history reconciliation. A first-ever subscription has no trusted prior anchor, and unseen pre-start activity is not inferred. Startup after a retained anchor triggers bounded recovery.",
);
out(
  "5. Only one verified Pump metadata decoder exists. Remaining launch/pool/swap adapters, independent prices/liquidity/risk enrichment, actual sell simulation and funded signer/fee reconciliation remain absent. Runtime stages expose extension callbacks but read-only monitoring never manufactures trading evidence.",
);
out(
  "6. Raw JSONL files grow on disk and need rotation. Journal and Store assume one writer; WAL PID locking does not replace distributed ownership. Rename does not fsync the parent directory, and the existing Store snapshot does not fsync file data. Arbitrary OS/power-loss durability is not proven.",
);
out(
  "7. No mainnet soak, real provider retention test, high-cardinality live decode profile, randomized repeated extended benchmark or funded performance measurement was performed. SQL audit and notification delivery remain best effort; existing dependency/security limitations remain unchanged.",
);
out();
out("## Evidence and reproduction");
out();
out(
  "[Architecture, recovery contract and commands](phase2/README.md) · [final test log](phase2/after-tests.txt) · [baseline 50-test log](phase2/before-tests.txt) · [type checks](phase2/typecheck.txt) · [baseline workload](phase2/workloads-before.json) · [optimized legacy ablation](phase2/workloads-optimized-legacy.json) · [staged workload](phase2/workloads-after.json) · [baseline source archive](phase2/before-source.tar.gz). JSON records source/harness hashes. The report generator rejects mismatched comparable harness/environment metadata and failed conservation/integrity flags. Exact timing is host-dependent and is never a test threshold.",
);
await writeFile("docs/phase2-engineering-report.md", lines.join("\n") + "\n");
