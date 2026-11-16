# Phase 11 performance validation

| Scenario | Side | Runs | Median completed/s | Median per-run p95 ms | Median per-run p99 ms |
|---|---|---|---|---|---|
| concurrent-history-live | before | 3 | 1625.488 | 621.288 | 636.177 |
| concurrent-history-live | after | 3 | 1852.418 | 540.655 | 555.941 |
| concurrent-history-live | after/before change |  | 13.961% |  |  |
| durable-burst-200 | before | 3 | 439.114 | 390.333 | 401.497 |
| durable-burst-200 | after | 3 | 430.249 | 399.971 | 405.294 |
| durable-burst-200 | after/before change |  | -2.019% |  |  |
| slow-unavailable-rpc | before | 3 | 1270.26 | 659.359 | 756.097 |
| slow-unavailable-rpc | after | 3 | 1199.57 | 703.7 | 800.64 |
| slow-unavailable-rpc | after/before change |  | -5.565% |  |  |

The exact Phase10 delivered source was reconstructed from the Phase11 source-at-start archive, using the same dependencies. The tested ingestion/engine module graph is unchanged: these are **A/A controls**, not evidence that new selection, stop or coverage code speeds up ingestion. Three alternating pairs on Node22 use a real host-filesystem `/tmp` bind with file and directory fsync unchanged. An API smoke briefly overlapped benchmark setup; other host processes remain uncontrolled. The live mainnet observer began after both benchmark populations finished. [Exact command, filesystem/device and load scope](phase11/performance-command.json), [raw jobs, queues/latencies/fsync/CPU/GC](phase11/performance-node22.json).

A separate [instrumented pair](phase11/performance-instrumented.json) captures JSON call/time, GC, scheduling observations and journal grouping; [command](phase11/performance-instrumented-command.json). Instrumentation changes absolute performance and must not be mixed with unprofiled controls. Positive or negative A/A differences are variability signals; no speedup or stable root cause is claimed. The original Phase9 13.4% and Phase10 Node20 15.5% / disk-backed Node22 4.9% decreases remain disclosed; Phase10 RAM-backed controls remain excluded from storage-durability claims.

Phase10's 110 incidents split into 107 transport faults plus three backpressure pauses. Of the transport faults, 92 report `WS_ERR_INVALID_CLOSE_CODE`, five HTTP429 handshakes, six handshake timeouts, three stale-receipt incidents and one heartbeat timeout. [Exact retained analysis](phase11/phase10-forensics.json). Invalid close frames are an observed protocol/transport error, not proof of a specific provider root cause. No ws parser validation or reconnect safety budget was relaxed.

| Actual run timer | Count | p50 ms | p95 ms | p99 ms |
|---|---|---|---|---|
| store.queue_wait_ms | 11 | 0.02 | 0.197 | 0.197 |
| research.admission.queue_wait_ms | 61636 | 56.777 | 348.26 | 467.232 |
| journal.worker_fsync_ms | 27450 | 2.661 | 4.783 | 7.914 |
| ingest.decode.queue_wait_ms | 61386 | 0.129 | 0.57 | 1.071 |
| ingest.enrichment.queue_wait_ms | 61385 | 0.01 | 0.032 | 0.296 |
| ingest.strategy.queue_wait_ms | 61385 | 0.071 | 0.265 | 0.558 |
| ingest.persistence.queue_wait_ms | 61385 | 0.01 | 0.027 | 0.153 |
| raw.persistence.queue_wait_ms | 61645 | 1.811 | 5.494 | 9.379 |
| market.pipeline.queue_wait_ms | 2 | 0.004 | 0.004 | 0.004 |
| market.accounts.queue_wait_ms | 3 | 4.97 | 4.97 | 4.97 |
| market.state_retrieval_ms | 2 | 495.128 | 495.128 | 495.128 |
| research.receipt_to_paper_decision_ms | 2 | 1238.847 | 1238.847 | 1238.847 |

Current p50/p95/p99 receipt-to-decision, market retrieval, queue/fsync grouping, CPU/memory, GC, rate limits and event-loop samples are retained in [the actual run](phase11/runtime/mainnet-validated/). Backfill and live share existing bounded scheduling and fsync acknowledgement. A decoded count, open socket or throughput benchmark is not continuous chain coverage. No risk, liquidity or durability threshold changed.
