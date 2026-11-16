# Phase 8 performance investigation

This is a measured **A/A implementation control**, not a performance fix. The pre-Phase-8 snapshot and current implementation have identical SHA-256 values for chain, ingestion, engine, store, model, event journal, async journal, WAL worker and worker bootstrap. Both sides use the same current node_modules and registry overrides. Consequently the labels `before` and `after` identify two module instances, not different optimized implementations or a dependency-upgrade benchmark.

The machine concurrently ran the bounded Phase 8 mainnet research monitor and periodic PostgreSQL heartbeat. This is a controlled concurrent research load, **not a quiet baseline or a production capacity estimate**. No fsync, WAL ownership, persistence or completion requirement was relaxed. No application hot path was changed.

## Final randomized control

[Raw final A/A JSON](performance-aa-final.json), [transcript](performance-aa-final.log), [derived summary](performance-attribution-summary.json). Three repetitions × three scenarios × two adapters = **18 jobs**, randomized with fixed seed 89271. Worker startup and fixture preparation are excluded from job throughput. All rows require identical offered/completed populations, zero duplicate logical processing/refusals, schema validity, paper mode, unique open mints and balance reconciliation.

| Scenario | Before median/s (range) | After median/s (range) | Observed difference |
|---|---:|---:|---:|
| durable-burst-200 | 736.9 (498.6–791.3) | 756.3 (578.2–777.7) | +2.6% |
| sustained-stream | 2914.0 (2913.4–2936.9) | 2970.5 (2519.6–2982.0) | +1.9% |
| concurrent-history-live | 3462.3 (2360.3–4081.1) | 4018.8 (3823.9–4300.3) | +16.1% |

The +16.1% mixed-stream difference occurs with identical implementation hashes. It cannot establish a code improvement. The control demonstrates substantial ordering/runtime/system variation at this small sample size; it does not explain away or reverse any Phase 6/7 historical regression. Those historical claims retain their original measurements and incomplete causal attribution. Three repetitions are insufficient for a confidence interval or production tail claim.

## Separately instrumented scheduling and CPU profile

[Final instrumented JSON](performance-scheduling-final.json), [transcript](performance-scheduling-final.log), [raw V8 profiles](cpu-profile-final/), and [derived profile summary](performance-attribution-summary.json). These six one-repetition jobs run after the final A/A jobs, with synchronous proc reads every 20 ms, the inherited JSON-call wrappers and Node `--cpu-prof`. This observer cost is intentionally excluded from the uninstrumented throughput comparison.

The sampler reads every available `/proc/self/task/<tid>/schedstat` and `comm` at job start, every 20 ms when the main loop can run, and after drain. It preserves raw samples, observed thread endpoints, thread names, main process TID, runtime, runqueue wait and scheduling slices. The Linux [scheduler documentation](https://www.kernel.org/doc/html/latest/scheduler/sched-stats.html) defines these counters as time on CPU, time waiting on a runqueue and timeslices. `/proc/sys/kernel/sched_schedstats` reads 0 on this host; the recorded per-task runtime/wait counters nevertheless advance. We retain their actual deltas without changing kernel settings or assuming the extended system statistics are enabled.

| Scenario / adapter | Wall ms | Main runtime ms | Main runqueue wait ms | Other thread runtime sum ms | Other thread runqueue wait sum ms |
|---|---:|---:|---:|---:|---:|
| sustained-stream / after | 355.7 | 305.0 | 0.0 | 261.0 | 1.2 |
| concurrent-history-live / after | 269.9 | 267.7 | 0.0 | 176.5 | 0.8 |
| durable-burst-200 / before | 194.6 | 159.7 | 0.0 | 114.1 | 2.2 |
| durable-burst-200 / after | 274.9 | 237.2 | 0.5 | 216.5 | 2.6 |
| sustained-stream / before | 394.6 | 386.5 | 4.8 | 339.8 | 0.7 |
| concurrent-history-live / before | 376.2 | 372.8 | 0.4 | 240.2 | 1.7 |

For these short profiled windows, observed main-thread runqueue waiting is small relative to wall/runtime (0.0–4.8 ms). That is evidence against **CPU scheduler runqueue starvation dominating these particular final windows**. It does not measure blocked disk time or timer waiting, prove no contention, or attribute the older baseline regression. Other-thread sums include V8 background/GC, loader, libuv and WAL threads and can exceed one wall duration because threads run concurrently; their identities cannot be inferred solely from `comm=node`.

The existing worker histograms keep filesystem operations distinct from main-thread measurements. For profiled durable before/after jobs, worker fsync p50 is **4.970/4.137 ms**, p95 **7.551/6.604 ms**; ownership acknowledgement p50 **9.317/10.315 ms**. Store persistence p50 is **0.422/0.768 ms**. These are operation wall durations; neither thread-runtime CPU nor exclusive additive components. Main JSON wrappers record **35.073/55.766 ms** across 1660/1600 stringify calls and roughly 12.39 million serialized characters per durable job; worker JSON is not wrapped. Observed GC totals are **3.539/4.497 ms**. The raw JSON retains event-loop p95/p99/max, process-wide CPU, resource usage, worker append/fsync, stage queues and all integrity counters.

V8 produced six profiles: main execution, module loader and the two durable-job workers plus their loaders. The main full-process profile is dominated by fixture generation (`@noble/curves` pow2: **2094.2 ms** self samples), demonstrating why a whole-process profile must not be mistaken for a measured-job profile. Other visible main-process costs include JSON.stringify **160.1 ms** and Zod parser **145.4 ms** self samples across startup, fixtures, jobs and report generation together. The two WAL-worker profiles contain **125.6 ms** and **181.8 ms** of `fsync` self samples. Sampling an active synchronous fsync can include blocking inside the syscall: these are sampled wall positions, **not proof of CPU consumption or kernel I/O latency**. The independent schedstat counters supply on-CPU time; there is no implemented V8-thread-ID to Linux-TID mapping. These profiles locate work and waiting without pretending to deliver an exclusive per-job stack decomposition.

## Observer and attribution limits

Timers cannot sample while the main thread is busy; 20 ms is a requested interval, not a guaranteed schedule. Short-lived tasks between samples are missed; newly created/exited threads use their observed endpoints only. Reading proc files adds synchronous filesystem work. Process resource/CPU counters are inherited from the original harness and include bookkeeping around the job; scheduler endpoints are tighter but have their own boundary-read overhead. GC delivery and memory peaks are sampled, not exhaustive. CPU profiler startup/loader work is included in its full-process files, while throughput excludes worker startup. Neither a profile sample count nor Linux aggregate CPU can assign every blocked nanosecond to a particular syscall.

A draft diagnostic launch briefly overlapped a draft A/A tail. Its artifacts (`performance-aa-control.*`, `performance-scheduling-profile.*`, `cpu-profile/`) are retained but **excluded from all final tables and conclusions**. Both final workloads above were rerun sequentially; their remaining intended concurrent load is the research monitor/DB heartbeat described above. Retaining the draft prevents an undisclosed observer overlap from becoming a benchmark claim.

Current evidence narrows likely costs to main-thread state validation/serialization/persistence plus durable fsync/acknowledgement waiting, while measuring small scheduler runqueue delay in the final short windows. It **does not fully attribute the Phase 6/7 regressions**. No unsafe optimization is justified by this experiment. A future attribution run should isolate load, profile only job windows, map worker OS TIDs, include on/off observer controls, and use more repetitions and a fresh retained historical implementation. The remaining historical performance investigation stays open.

## Reproduction

```sh
npx tsx scripts/phase8-performance-benchmark.ts --before-root /tmp/mintbot-phase8-before --runs 3 --output docs/phase8/performance-aa-reproduced.json
node --cpu-prof --cpu-prof-dir=/tmp/mintbot-phase8-profiles --import tsx scripts/phase8-performance-benchmark.ts --before-root /tmp/mintbot-phase8-before --runs 1 --scheduling --profile --output docs/phase8/performance-profile-reproduced.json
python3 scripts/phase8-performance-summary.py
```

Create the profile output directory before running. The summary helper intentionally reads the retained `*-final.json` and `cpu-profile-final/` files; change those paths to summarize a reproduction. The harness requires Linux procfs, the retained snapshot with module resolution and the existing fixture files. Its current source SHA is recorded inside each final JSON. Phase 7 harness and artifacts remain untouched. Backend TypeScript validation passes: [log](performance-typecheck.log).
