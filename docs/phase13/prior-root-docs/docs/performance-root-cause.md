# Burst performance root-cause investigation

The Phase9 13.4% burst-throughput decrease remains an unresolved historical signal, not an attributed code regression or a claimed improvement. Exact pre-Phase9 and final Phase9 source archives were reconstructed, linked to the same current dependencies, and measured with identical seeded offers and file/directory-fsync acknowledgements. Full source hashes and commands are retained. The current Phase10 comparison separately measures its new ingestion/WAL metadata paths.

| Population | Side | Runs | Median completed/s | Median per-run p95 ms | Median fsync batches | Median records/group p50 |
|---|---|---|---|---|---|---|
| Unprofiled archived Phase9 reproduction | before | 5 | 238.460 | 701.902 | 87 | 2 |
| Unprofiled archived Phase9 reproduction | after | 5 | 289.874 | 591.237 | 82 | 3 |
| Scheduler/JSON-instrumented reproduction | before | 5 | 82.822 | 2,173.419 | 169 | 1 |
| Scheduler/JSON-instrumented reproduction | after | 5 | 85.757 | 2,052.793 | 160 | 1 |
| Traced/instrumented pair | before | 1 | 72.855 | 2,481.168 | 180 | 1 |
| Traced/instrumented pair | after | 1 | 79.811 | 2,302.764 | 173 | 1 |
| Current Phase10 versus final Phase9, Node20 | before | 3 | 306.800 | 560.638 | 76 | 3 |
| Current Phase10 versus final Phase9, Node20 | after | 3 | 259.214 | 680.522 | 87 | 2 |
| Node22 disk-backed alternating-pair control | before | 6 | 355.135 | 479.802 | 66.0 | 3.0 |
| Node22 disk-backed alternating-pair control | after | 6 | 337.852 | 504.056 | 67.0 | 3.0 |

Current delivery burst signal: before median 306.800/s, after 259.214/s, change -15.510%. This three-run Node20 decrease remains unresolved and is disclosed as a regression signal, not a cured Phase9 regression. The six-pair disk-backed Node22 control changes -4.867% (before 355.135/s; after 337.852/s). Its mixed pair outcomes and different runtime/order prevent attributing a stable source-level cause.

These are medians of per-run measurements, not pooled percentiles. The archived/current host runs use Node20 for comparison with Phase9; the production observer and separately labeled disk-backed control use Node22. The first Node22 tmpfs controls are retained as RAM-backed diagnostics only and are excluded from persistent-storage claims: [setup correction](phase10/node22-tmpfs-correction.json). Fsync calls alone do not make tmpfs power-loss durable. The corrected control binds the same host /tmp filesystem, with device identity recorded. The fixed three-run shuffle places two after jobs early and two before jobs late; the alternating-pair control measures order sensitivity without discarding the original negative result. It does not prove order is the sole root cause.

Profiling/scheduler/strace populations have substantial instrumentation overhead and must not be compared directly to unprofiled throughput. The before/after signs and magnitudes vary across repetitions. No durability delay, acknowledgement-before-fsync, risk relaxation or arbitrary batch tuning was used to manufacture a gain. Shared dependencies prevent a codec before/after claim; other host load is uncontrolled despite excluding concurrent Mintbot builds/tests/DB probes from the isolated measurement commands.

| Exact WAL syscall | Parsed count | p50 ms | p95 ms | max ms |
|---|---|---|---|---|
| write | 800 | 0.041 | 0.113 | 1.762 |
| fsync | 357 | 1.927 | 3.475 | 6.169 |

| Traced pair side | Thread | Observed CPU ms | Observed runqueue wait ms |
|---|---|---|---|
| before | main | 1,460.638 | 226.267 |
| before | WAL writer 195725 | 253.977 | 78.028 |
| after | main | 1,265.561 | 225.922 |
| after | WAL writer 195812 | 230.592 | 77.188 |

[Trace reconstruction](phase10/performance-trace-analysis.json) joins unfinished/resumed calls; WAL file-descriptor paths identify the actual writing thread IDs. Per-task observations use 20ms endpoints and exclude unobserved thread lifetime. Kernel `sched_schedstats=0` is retained context; nonzero per-task counters are reported as observed, while zero rows do not prove absence of contention. Syscall wall times include scheduling and tracing effects, not isolated physical-device latency. Main-thread JSON calls/time, GC, queue occupation/wait, worker append/fsync/group distributions, CPU, memory, `/proc/stat`/load snapshots and invariants are in raw per-job evidence.

[Unprofiled control](phase10/performance-unprofiled-control.json), [instrumented reproduction](phase10/performance-phase9-reproduction.json), [trace pair](phase10/performance-traced-pair.json), [current Node20 delivery](phase10/performance-current-delivery.json), [disk-backed Node22 control](phase10/performance-node22-disk-counterbalanced.json), [injected provider/live-history interference](phase10/performance-provider-interference.json). The latter injects bounded temporary failures and delays; it is not real provider latency or a paper fill. Actual RPC faults and backpressure belong to the mainnet report.

Observed batching and scheduling sensitivity is measurable; a stable causal explanation of the historical 13.4% remains unproven. No speedup, production SLO or regression cure is claimed.
