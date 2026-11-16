# Phase 6 measured performance

Measured 2026-11-10, Node v20.19.5, Intel i5-1145G7. These are local research measurements, not production SLOs. Raw counters, per-run tails, memory, CPU, event-loop and queue statistics are retained in [regression-benchmark.json](regression-benchmark.json) and [simulation-benchmark.json](simulation-benchmark.json).

## Existing pipeline before/after

Three randomized interleaved repetitions per implementation/scenario (36 jobs), fixed seed 89271, identical harness and ownership guarantees. “Before” is the preserved Phase 5 source snapshot. Values below are medians of per-run measurements; tail columns are medians of per-run percentiles, not pooled population percentiles. All latencies are milliseconds. Fixture startup/preparation excluded. Offline fixtures do not measure chain latency.

| Scenario | Before events/s | After events/s | Change | Before p50/p95/p99 | After p50/p95/p99 |
|---|---:|---:|---:|---|---|
| repeated-mint-10000 | 2017.4 | 2713.5 | +34.5% | 1783.70/4450.34/4754.22 | 1650.08/3289.51/3444.86 |
| concurrent-history-live | 3883.1 | 3611.3 | -7.0% | 134.13/256.02/264.98 | 165.69/276.53/286.16 |
| sustained-stream | 2896.6 | 2812.0 | -2.9% | 14.53/20.03/25.05 | 16.34/41.59/42.96 |
| unique-mints-10000 | 1049.1 | 1423.1 | +35.6% | 3871.12/8766.72/9246.81 | 3381.73/6303.08/6800.38 |
| slow-unavailable-rpc | 1467.0 | 1484.0 | +1.2% | 306.62/572.02/656.90 | 295.82/558.55/644.32 |
| durable-burst-200 | 830.8 | 531.5 | -36.0% | 114.70/199.49/206.38 | 174.41/313.80/324.33 |

All 36 jobs completed every offered event, with zero refused events and zero duplicate logical processing. Injected slow-RPC errors remain explicit in raw counters. This does not prove zero loss on an unbounded live feed. **The mixed concurrent-history/live workload regresses 7.0%; this remains unresolved.** **Durable burst regresses 36.0% and sustained stream 2.9%; both remain unresolved and require further isolated profiling.** The slow/unavailable-RPC workload improves 1.2% in this sample, with no causal or production improvement claim. A specialized trusted Store seen-ID validator retains the 10,000 dense-string bound; the full untrusted schema remains strict. The mixed regression is not declared repaired.

## New subsystem (after-only)

This subsystem had no Phase 5 counterpart. Three runs × 50 builds per venue (600 builds) use recorded market bytes, explicitly UNIT execution accounts and UNIT clocks. No RPC preparation is timed in this build table. Throughput includes policy validation; serialization is a subset of construction. Values are medians of per-run values.

| Venue | Builds/s | Build p50/p95/p99 ms | Serialization p50 ms | Wire policy p50 ms |
|---|---:|---|---:|---:|
| pump | 206.5 | 4.383/5.054/5.118 | 0.425 | 0.348 |
| pumpswap | 149.5 | 5.813/7.174/8.358 | 0.544 | 0.426 |
| raydium-cpmm | 207.1 | 4.357/5.087/5.100 | 0.484 | 0.378 |
| meteora-dlmm | 94.8 | 9.908/10.840/11.090 | 0.574 | 0.436 |

Actual PostgreSQL 16: three runs of 100 reserve/claim/cancel intents, 300 SQL transactions each. Median **133.2 intents/s**, commit p50/p95/p99 **2.345/4.085/5.140 ms**. This is local durable-storage behavior, not remote/HA database performance.

Each injected-RPC burst offers 64, admits 16, explicitly refuses 48, reaches queue/pending peak 16 and worker peak 2. Two admitted calls raise injected provider failures; fourteen return protocol-failure results. These are not fourteen successful swaps. The bounded queue drains in every run; refused work is counted rather than silently dropped. Fifteen-ms injected RPC delays are test parameters, not internet observations.

| Burst run | Queue wait p50/p95/p99 ms | Admitted pipeline end-to-end p50/p95/p99 ms |
|---|---|---|
| 1 | 273.16/627.22/627.22 | 363.00/723.02/723.02 |
| 2 | 268.13/608.42/608.42 | 356.65/700.08/700.08 |
| 3 | 267.06/612.29/612.29 | 352.10/703.12/703.12 |

Actual mainnet RPC outcomes and CU are in [simulation-validation.md](simulation-validation.md). The small diagnostic sample is unsuitable for production p95/p99 claims. End-to-end fresh chain receipt → successful eligible paper entry is **unmeasured**. Earlier experimental `event_to_result_ms` names denoted service-start timing; they must not be interpreted as on-chain event latency. Current telemetry separates evidence-to-result from receipt timing and only emits receipt timing when a valid process-local monotonic receipt is supplied. No signing, submission, landing or confirmation timing is measured.
