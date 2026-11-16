# Phase 1: repository audit and measured latency report

Recorded 2026-11-03. Live trading remains disabled. No application/frontend/Docker build or deployment was run for this phase. The original 34 tests passed before changes.

## Audit against README

| README contract | Audit result and instrumentation change |
| --- | --- |
| Paper-only runtime and disconnected live executor | Preserved. Added a live-mode rejection regression; no new signing or trade route. |
| Verified program observations, pinned Pump decoder, bounded dedupe/reconnect | Preserved. Added receipt/JSON-decode/dedupe/decoder timings, distinct errors and reconnect counters; injected scheduler enables deterministic tests. No new venue decoder or gap backfill claimed. |
| Risk filters, paper buys/sells, delayed entries and exits | Preserved. Added risk/strategy/exit-decision and paper execution spans. Existing duplicate risk assessments remain observable; no strategy optimization attempted. |
| Serialized atomic snapshots | Preserved. Queue wait, clone, validation, persistence and transaction timings added. Store admission remains unbounded. |
| Bounded monitor persistence backlog | Same limit of 100 total pending tasks; extracted a measured FIFO used by server and CLI. Queue overload is explicit; duplicate suppression and dedupe eviction are distinct from drops. |
| Existing benchmark and replay | Old benchmark had only serial ingestion latency. New pipeline replay covers bursts, duplicate replay, overload, local reconnect and injected RPC errors; the original paper replay output is retained with additive telemetry. |
| Dashboard and deployment | No frontend, dependency, config policy, schema, or Docker change required. Existing dashboard/state shape retained with additive telemetry and authenticated /api/metrics. |

## Method

Same harness SHA-256: `ef06961b06a11d318e1c13be33cd56b32c498f006169401c456729218a42f2f3`. Runtime: v20.19.5, linux/x64, 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz. Each version ran 3 independent repetitions of 1000 offered events per scenario, after a separate 32-event warm-up of each scenario. Raw results contain source hashes and every run. The archived before source is in [before-source.tar.gz](latency/before-source.tar.gz); [original serial baseline](latency/before-legacy.json) is retained separately and is **not** compared to the new pipeline workload.

The pipeline replays synthetic, exact-schema Pump logs through the actual monitor, decoder, mocked historical transaction inspection and paper engine. Paper prices and risk assertions are independent synthetic fixtures, not evidence derived from live logs. The queue runs FIFO; overload capacity is 64, other scenarios have sufficient capacity. Duplicate pattern repeats one signature per four offers. Overload injects one transport failure/reconnect and replays a prior signature; each accepted ID divisible by 17 fails a mocked read. These error counts are controlled injected faults, not a measured public RPC reliability rate.

Durations use monotonic performance.now. Each table cell is the **median of per-run statistics**, not a pooled percentile. Quantiles use the existing floor((n-1)*p) convention; ring samples are bounded to 10,000 and lifetime counts are separate. End-to-end is local offer through accepted task completion, including queue wait; duplicates/drops do not receive completion-latency samples. Completion throughput excludes duplicates and drops. The local 1 ms reconnect timer includes event-loop backlog and is not a provider reconnect benchmark. There is no disk/network/signing/chain-landing measurement.

## Comparable before/after results

| Scenario | Version | Completed/s | End-to-end p50 ms | p95 ms | p99 ms | Completed | Duplicates | Drops | RPC errors | Queue depth peak |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| sequential | Before | 277.994 | 3.599 | 5.221 | 6.602 | 1000 | 0 | 0 | 59 | 1 |
| sequential | After | 319.452 | 3.142 | 4.379 | 5.559 | 1000 | 0 | 0 | 59 | 1 |
| dedupe-burst | Before | 315.780 | 1154.696 | 2240.827 | 2333.419 | 750 | 250 | 0 | 45 | 750 |
| dedupe-burst | After | 312.042 | 1014.602 | 2218.669 | 2350.154 | 750 | 250 | 0 | 45 | 750 |
| overload-reconnect | Before | 580.812 | 48.683 | 113.689 | 124.506 | 128 | 251 | 622 | 8 | 64 |
| overload-reconnect | After | 573.605 | 48.916 | 122.890 | 134.933 | 128 | 251 | 622 | 8 | 64 |

## Queue wait and service time

External harness measurements on both versions. Queue wait excludes active service; processing includes decode, mocked inspection, paper ingestion and local commit.

| Scenario | Version | Boundary | p50 ms | p95 ms | p99 ms |
| --- | --- | --- | ---: | ---: | ---: |
| sequential | Before | Waiting | 0.005 | 0.010 | 0.015 |
| sequential | Before | Processing | 3.528 | 5.152 | 6.501 |
| sequential | After | Waiting | 0.006 | 0.011 | 0.017 |
| sequential | After | Processing | 3.097 | 4.277 | 5.375 |
| dedupe-burst | Before | Waiting | 1150.508 | 2237.671 | 2330.272 |
| dedupe-burst | Before | Processing | 3.134 | 4.748 | 5.930 |
| dedupe-burst | After | Waiting | 1011.824 | 2215.327 | 2346.256 |
| dedupe-burst | After | Processing | 3.148 | 4.612 | 6.262 |
| overload-reconnect | Before | Waiting | 46.896 | 111.561 | 121.980 |
| overload-reconnect | Before | Processing | 1.550 | 2.374 | 2.857 |
| overload-reconnect | After | Waiting | 47.541 | 119.951 | 132.668 |
| overload-reconnect | After | Processing | 1.552 | 2.694 | 2.992 |

## New internal stage observations

Sequential scenario; median per-run values. Before had no internal stage telemetry, so these stages have no invented before values. Nested spans overlap: strategy includes its risk check; ingestion includes queued Store work; monitor ingestion includes callback enqueue. Do not sum them. Paper execution is mutation-attempt time, not chain execution or durable commit time.

| Stage | Before | After p50 ms | After p95 ms | After p99 ms | Samples per run |
| --- | --- | ---: | ---: | ---: | ---: |
| monitor.ingestion_ms | Unmeasured | 0.027 | 0.054 | 0.080 | 1001 |
| monitor.json_decoding_ms | Unmeasured | 0.012 | 0.025 | 0.037 | 1001 |
| monitor.deduplication_ms | Unmeasured | 0.002 | 0.004 | 0.008 | 1000 |
| decoding_ms | Unmeasured | 0.460 | 0.707 | 1.131 | 1000 |
| engine.deduplication_ms | Unmeasured | 0.040 | 0.083 | 0.108 | 1000 |
| risk_evaluation_ms | Unmeasured | 0.003 | 0.008 | 0.014 | 2000 |
| strategy_decision_ms | Unmeasured | 0.003 | 0.006 | 0.010 | 1000 |
| paper_execution_ms | Unmeasured | 0.018 | 0.023 | 0.023 | 5 |
| rpc.getParsedTransaction_ms | Unmeasured | 0.003 | 0.058 | 0.070 | 1000 |
| ingestion_ms | Unmeasured | 2.529 | 3.575 | 4.463 | 1000 |
| store.queue_wait_ms | Unmeasured | 0.002 | 0.004 | 0.006 | 1000 |
| store.clone_ms | Unmeasured | 1.605 | 2.099 | 2.778 | 1000 |
| store.validation_ms | Unmeasured | 0.811 | 1.609 | 1.967 | 1000 |
| store.transaction_ms | Unmeasured | 2.512 | 3.558 | 4.418 | 1000 |

## Validation

Final suite: 50 tests, 0 failures; [captured output](latency/after-tests.txt). Source and frontend TypeScript passed with --noEmit. The regression suite includes deterministic burst admission/FIFO/drain, reconnect timing/cancellation, duplicate retention across sockets, eviction, decoder rejection, RPC fault accounting, queue failures, paper accounting, and live-mode rejection. No application, frontend or Docker build was run.

## Interpretation and limits

These observations measure this offline fixture workload and include instrumentation overhead, JIT, host scheduling and run-to-run noise. No optimization or improvement is established or claimed. Before and after runs are separate batches; they are not randomized trials. All offered events must reconcile as completed + duplicates + drops in every finished run; raw outputs expose this check. Strategy/risk rejection is a completed evaluation, not a dropped event. Queue peak is a discrete high-water mark including transient tasks awaiting their first microtask; pending additionally includes active work. Reconnect gaps are not counted as known lost events: their true loss is unknown without backfill.

Source time does not measure when a launch occurred on-chain. RPC faults here are injected; actual RPC method durations/errors are instrumented for future configured read-only operation. Existing live-executor metrics remain disconnected from the server. Histogram snapshots and counters reset with each process/collector; samples are in memory, contain no wallet keys or high-cardinality event IDs, and are not a permanent metrics database.

See [raw before](latency/before.json), [raw after](latency/after.json), and [instrumentation contract](latency/README.md). The original README limitations—unimplemented swap/enrichment/signer work, no gap backfill, legacy dependency findings—remain in force.
