# Phase 9 performance measurements

The matched harness uses an archived pre-change source checkout and the delivered source, three seeded repetitions per side/scenario, equivalent completion populations and current shared dependencies. The initial A/A control had identical source hashes. The final matched comparison includes the one-field exhausted-gap merge status correction in EventJournal; other measured ingestion/WAL/engine modules remain unchanged. This state correction is not a latency optimization or a native-codec before/after experiment. The supervisor and live providers were not backported into the baseline. The final comparison runs with the required mainnet observer and no concurrent Mintbot tests/builds/database probes; other host load remains uncontrolled. Two earlier runs overlapped tests/builds and remain retained: the initial A/A [performance-matched.json](phase9/performance-matched.json), and the loaded matched [performance-delivery.json](phase9/performance-delivery.json). Their copied metadata errors are explicit in the performance metadata correction files. No raw timing is silently discarded or relabeled as a quiet-host result.

Medians of the per-run measurements (not pooled percentiles):

| Scenario | Side | Runs | Completed/s | p50 ms | p95 ms | p99 ms | Duplicate work | Refused |
|---|---|---|---|---|---|---|---|---|
| durable-burst-200 | before | 3 | 528.935 | 206.957 | 331.064 | 339.081 | 0 | 0 |
| durable-burst-200 | after | 3 | 457.964 | 187.835 | 381.057 | 390.880 | 0 | 0 |
| sustained-stream | before | 3 | 2,789.003 | 14.544 | 27.095 | 33.034 | 0 | 0 |
| sustained-stream | after | 3 | 2,790.847 | 14.585 | 38.136 | 39.202 | 0 | 0 |
| concurrent-history-live | before | 3 | 2,737.642 | 196.939 | 357.971 | 365.178 | 0 | 0 |
| concurrent-history-live | after | 3 | 3,643.685 | 166.885 | 261.589 | 266.481 | 0 | 0 |

[performance-observer-only.json](phase9/performance-observer-only.json) includes offered/completed populations, raw latencies, fsync group/ownership timers, queue gauges, CPU, sampled memory, event-loop delay, injected RPC errors and integrity checks for each run. Live/history interference is measured with the same bounded scheduling and injected delay on both sides. All logical completion, paper-only, balance and unique-position checks must pass; table differences cannot establish an improvement or regression cause without isolation and repeated comparable conditions. In the final observer-only run, durable burst median throughput fell 13.4% (528.9 to 458.0/s), sustained stream changed about +0.1%, and mixed live/history changed about +33.1%. The burst reduction is an unresolved regression signal; the increases are not claimed improvements. Shared-host variability and the earlier loaded runs prevent source-level attribution.

[simulation-benchmark.json](phase9/simulation-benchmark.json) separately measures 12 recorded-market/UNIT-account build batches, three actual local PostgreSQL durable intent runs and three 64-job injected-provider failure bursts. These provider delays/failures are synthetic; they do not measure current mainnet simulation or successful fills. SQL transaction latency is in its telemetry. Actual current market retrieval and receipt-to-decision observations, with sample counts and missing populations, are in [the mainnet report](long-duration-mainnet-report.md). There is no real simulation-latency population when no candidate passes mandatory evidence.

The new transport/admission wrapper is not exercised by the direct-ingestion matched harness; its actual latency and queue populations are recorded by the final mainnet run without a speedup claim.

The clean authenticated PostgreSQL heartbeat (private cluster isolated from the current fault-test suite) ran 300.002 seconds: 61 successes, 0 failures; round-trip p50/p95/p99 2.668/8.540/16.352 ms. It is SELECT-only availability, not commit latency or a pool attached to the mainnet monitor. An earlier overlapping probe was invalidated by the intentional credential rotation/crash tests and failed shutdown; its raw log is preserved, not counted as a clean soak. The full suite's retained authenticated PostgreSQL crash/restart, SCRAM rotation, privilege, restore and fencing evidence is under `phase9/prior-helper-rerun`; prior artifacts were restored byte-for-byte.

## Current validation comparison

| Scenario | Side | Runs | Completed/s median | p95 ms median |
|---|---|---|---|---|
| durable-burst-200 | before | 3 | 306.168 | 555.108 |
| durable-burst-200 | after | 3 | 272.848 | 620.079 |
| sustained-stream | before | 3 | 1,687.204 | 113.319 |
| sustained-stream | after | 3 | 1,571.168 | 132.003 |
| concurrent-history-live | before | 3 | 1,479.974 | 650.907 |
| concurrent-history-live | after | 3 | 1,559.667 | 647.217 |

The baseline is the source snapshot captured at the start of the current experiment. At the time of that comparison, only chain subscription acknowledgement validation differed among the measured modules; this direct-ingestion harness does not exercise that path or the supervisor changes. Shared current dependencies and uncontrolled host load limit attribution. This comparison predates the final JSON-RPC and clock-discontinuity refinements and does not measure their overhead. No speed improvement is claimed. Raw metrics, integrity assertions, and the correction to inherited harness load/change labels are retained in [current performance evidence](phase9/revalidation-2026-11-13/performance-comparison.json) and [metadata attribution](phase9/revalidation-2026-11-13/performance-metadata-attribution.json).

## Current route diagnostic timing

| Timer | Count | p50 ms | p95 ms | max ms |
|---|---|---|---|---|
| intent.commit_ms | 11 | 10.261 | 14.599 | 74.200 |
| rpc.simulation.simulateTransaction_ms | 1 | 100.235 | 100.235 | 100.235 |
| simulation.rpc_ms | 1 | 100.488 | 100.488 | 100.488 |
| simulation.evidence_to_result_ms | 1 | 293.082 | 293.082 | 293.082 |

These are actual provider timings from the separate current public-account buy diagnostics, including one successful unsigned PumpSwap simulation. A one-sample simulation population cannot establish an SLO or an improvement. It does not measure a qualifying live launch, a paper entry, a sell simulation or a funded fill. See [current buy evidence](phase9/revalidation-2026-11-13/current-buy-simulations.json).
