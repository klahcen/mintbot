# Phase 7 performance investigation

Measured 2026-11-10T16:28:32.369Z on v20.19.5, 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz.

No production hot-path optimization was introduced. The Phase 6 durable and mixed regressions do not reproduce as stable negative deltas in this sample. Their previous measurements remain intact. The durable bottleneck is sensitivity to fsync group fragmentation; the original run’s exact external cause remains unproven. A residual paced-stream difference remains.

## Matched workloads

Five fixed-seed randomized interleaved repetitions for each implementation and scenario: 30 jobs. “Before” uses the preserved Phase 5 source at `/tmp/mintbot-phase6-before`; “current” uses the existing Phase 6 ingestion/Store implementation. This comparison diagnoses the original Phase 6 regression, rather than claiming a new Phase 7 optimization. No account parsing, network RPC, PostgreSQL, or swap simulation runs in these ingestion jobs. Workers acknowledge ownership and completion after their existing file and directory fsync. All jobs completed their identical populations with zero refused events and zero logical duplicates; all integrity checks passed.

| Scenario | Before events/s | Current events/s | Difference | Before p50/p95/p99 ms | Current p50/p95/p99 ms |
|---|---:|---:|---:|---|---|
| durable-burst-200 | 793.7 | 975.9 | +23.0% | 124.55/206.36/213.60 | 115.80/174.04/178.84 |
| sustained-stream | 2996.4 | 2963.1 | -1.1% | 9.18/12.84/14.83 | 9.05/12.98/14.91 |
| concurrent-history-live | 3864.5 | 5700.9 | +47.5% | 138.52/251.56/259.07 | 98.99/168.92/173.59 |

Values are medians of per-run values; tail columns are medians of per-run percentiles, not pooled sample quantiles. This is offline receipt-to-commit latency, not chain-to-trade latency.

| Scenario / implementation | Wall ms | Process CPU ms | GC observed ms | Event-loop p99 ms | Sampled peak RSS MiB |
|---|---:|---:|---:|---:|---:|
| durable-burst-200 / before | 251.97 | 355.35 | 4.13 | 13.29 | 287.6 |
| durable-burst-200 / after | 204.93 | 352.82 | 3.54 | 12.03 | 291.2 |
| sustained-stream / before | 333.74 | 226.00 | 9.47 | 15.00 | 180.4 |
| sustained-stream / after | 337.49 | 260.26 | 7.55 | 13.06 | 208.2 |
| concurrent-history-live / before | 284.64 | 340.68 | 11.35 | 25.79 | 199.5 |
| concurrent-history-live / after | 192.95 | 229.66 | 9.18 | 21.33 | 206.5 |

Process CPU includes runtime/worker threads and the harness’s post-drain observation and integrity work; it is not a per-core utilization percentage or isolated business-function cost. RSS includes previously allocated process/worker/runtime memory; the 5 ms sampler misses shorter peaks. GC counts include only delivered PerformanceObserver entries. These are diagnostic comparisons, not memory-allocation proofs. Raw telemetry retains queue depths, queue waits, backlog/end-to-end age, retries, worker append/fsync histograms, CPU, context switches, `/proc/stat` CPU ticks and host load snapshots. Backlog age here refers to offline offered work, not freshness of chain observations.

## Durable WAL: measured bottleneck and limits

The original Phase 6 after runs took 230.4, 705.6 and 376.3 ms with 27, 76 and 48 fsync groups. The 705.6 ms run used median 3 records/group; the 230.4 ms run used 9. Their individual fsync medians were 4.28 and 4.87 ms respectively: the slow run did not have slower median individual fsync. Acknowledgements are serialized through one bounded worker. More small groups require more durable round trips. Across the six original durable rows, wall time and group count correlate at r=0.992; across the ten new durable rows, r=0.999. Correlation alone does not explain why scheduling fragmented those groups.

The worker, async journal, ingestion, event journal, chain and engine files are byte-identical across these baseline/current implementations. The changed Store/model validator can alter service timing, but there is no changed WAL implementation to blame. Worker startup is excluded by the harness; per-message cloning, serialization, checksumming, scheduling and append remain included. Worker overhead is not separately isolated from those activities, and worker-thread GC is not attributed by the main-thread observer.

The batch-delay experiment uses the already supported 4 ms setting instead of the default 2 ms; it preserves fsync acknowledgements. Five repetitions/implementation did not show a beneficial median: current default durable wall 204.93 ms versus 260.32 ms in the separate 4 ms experiment. This is an ordered sensitivity experiment, not a causal matched optimization proof. Default batching remains unchanged. Do not disable fsync or acknowledge before durable commit. A future remedy must test arrival cadence and batch size under a dedicated host before selecting a latency/throughput tradeoff.

## Serialization, GC, pacing and contention

The separate profiling run wraps main-thread JSON.stringify/parse. This instrumentation changes scheduling and its rates are not substituted for uninstrumented results. Median durable main-thread stringify cost is 59.39 ms baseline and 63.36 ms current over 1,600 calls and 12,392,832 serialized characters per run. Mixed workload has 4,400 calls and 3,398,040 characters per run. Worker-thread JSON is not intercepted, and character counts are not retained allocation bytes. In these workloads the wrapper sees no JSON.parse calls. Profiled rates and raw per-job counts are retained separately. The profiled durable comparison changes sign, demonstrating observer/run sensitivity.

Current GC observation totals are lower than baseline in the quiet matched median for all three scenarios; the original regression cannot be explained by an observed increase in main-thread GC alone. Allocation rate, retained-object lifetimes and worker GC remain unmeasured. No heap-size or GC flag changes were made.

The sustained harness intentionally waits 20 ms after every 64 offers, including the final batch: 16 waits impose a 320 ms pacing floor for 1,000 events. Its new medians are 333.74 ms baseline and 337.49 ms current, only 3.75 ms apart. That scheduling-sensitive finite run is not evidence of production saturation throughput. The residual -1.1% rate difference remains reported; it is not declared fixed.

A requested quiet window paused team tests/builds. One database test had already started immediately before the pause and completed within approximately 4 seconds; the first early jobs may overlap it. Host OS/IDE and other external workloads were not stopped, CPU affinity/frequency were not pinned, and no continuous per-process host activity trace was captured. Phase 6 has no such external trace either: background interference is plausible but cannot be asserted as its established cause. Recorded host snapshots describe load, not process attribution.

## Other components: scope rather than invented attribution

- PostgreSQL reserve/claim/cancel is not called by the regression harness. Phase 6 separately measured complete local intent-transaction p50/p95/p99 2.345/4.085/5.140 ms and median 133.2 intents/s (three SQL transactions per intent). Phase 7 persistent PostgreSQL 16 separately measured 50 COMMIT acknowledgements in the concurrent full-suite run (one SQL client) after an UPDATE: p50/p95/p99 1.011/2.801/3.859 ms, max 4.504 ms, in `persistent-database-validation.json`. This times COMMIT only, excluding UPDATE, pool acquisition and application locking; it is not comparable to the full Phase 6 transaction timer and is not remote/HA latency.
- Account-state parsing, integer quoting and transaction serialization are also absent from the ingestion regression. Phase 6 after-only fixture builds measured protocol-dependent p50 4.383–9.908 ms, including policy validation in throughput. Those historical fixture results are not re-labeled as new Phase 7 or current mainnet performance.
- RPC scheduling in the Phase 6 injected-provider subsystem was bounded at 16 admitted / 48 refused from a burst of 64, with worker peak 2 and a configured 15 ms delay; 2 calls raised injected provider failures and 14 returned protocol failure. This proves bounded accounting of test load, not internet latency or swap success. Actual Phase 7 read-only diagnostic errors and simulation timings belong to the mainnet evidence report.

## Reproduce and remaining work

```sh
npx tsx scripts/phase7-performance-benchmark.ts --before-root /tmp/mintbot-phase6-before --runs 5 --output /tmp/phase7-matched.json
npx tsx scripts/phase7-performance-benchmark.ts --before-root /tmp/mintbot-phase6-before --runs 3 --profile --output /tmp/phase7-profiled.json
npx tsx scripts/phase7-performance-benchmark.ts --before-root /tmp/mintbot-phase6-before --runs 5 --scenarios durable-burst-200 --batch-delay 4 --output /tmp/phase7-batch4.json
python3 scripts/phase7-performance-report.py
```

The original default/profile run harness is retained as `performance-harness-original.ts.txt` with the exact SHA recorded in those artifacts. The current script adds only the batch-delay experiment option (default 2 ms); each artifact records its executed harness SHA, fixed seed, source hashes, environment, job order and all rows. `performance-source-audit.json` records the additional unchanged WAL/worker files omitted by the inherited six-file source manifest. Reproduction requires the retained baseline snapshot (or extraction of the Phase 6 before-source archive with its node_modules resolution configured).

Remaining work: dedicated-host fresh-process replications with warmup/order controls, continuous external CPU/I/O tracing, worker CPU/GC attribution, explicit allocation sampling, and longer paced/unpaced workloads. The initial -36.0/-7.0/-2.9% observations remain valid historical samples; they do not establish a reproducible implementation-level regression or a completed optimization. Supported knobs and source timing evidence narrow the cause to scheduling/grouping sensitivity without claiming that the external trigger has been proven.
