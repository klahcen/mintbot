# Phase 2 engineering report

Generated from recorded JSON on 2026-11-03T19:30:40.824Z. All results are offline fixtures on v20.19.5, 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz, linux/x64. No live RPC benchmark, funded transaction, deployment or application/dashboard build was performed. Live mode remains rejected at startup.

## Outcome and limits

The retained Phase 1 replay's median duplicate-burst p95 fell from **2310.766 ms to 397.772 ms** (82.786% lower). This measures Store/decoder changes through the same legacy replay queue; it does not measure the new runtime queue. The staged 10,000-event fixture completed every input, compared with 1,024 completions and 8,976 refused admissions in the legacy adapter. Saturation recovered 936 refused receipts and the disconnect fixture recovered 100 withheld events using mocked available history. These controlled fixtures do not prove complete mainnet recovery.

**Measured regression:** durable-burst throughput fell from 259.445 to 155.779 completed events/s; p95 rose from 709.577 to 888.684 ms. The new path includes synchronous WAL append/fsync and completion records. This comparison changes durability guarantees and cannot isolate filesystem overhead alone. Against the optimized Store/decoder legacy adapter, staging is also slower on several in-memory workloads; the ablation below exposes that cost.

## Repository audit and implementation

The audit inspected executable source rather than accepting README claims. At the Phase 2 baseline, WebSocket JSON handling and callbacks were synchronous, monitor dedupe was a process-local bounded signature/program Set, and each observation's decode, raw persistence, optional database audit and dashboard transaction shared a serial FIFO with 100 admitted tasks. Overload was explicitly counted but had no durable work ownership or historical repair. Reconnect resubscribed with backoff and tracked a latest slot without closing coverage gaps. The Store serialized transactions but admitted an unbounded promise backlog; every paper event cloned and validated full histories. Risk and strategy evaluation run inside that transaction and assess evidence twice under the existing rules. Profiling showed history cloning/validation dominating the sequential local fixture; the baseline Store clone/validation numbers below substantiate that finding.

Implemented changes preserve the React dashboard, risk/accounting rules, API fields and paper-only guard:

- `Store.paperTransaction` isolates active state while sharing only deeply frozen, schema-validated plain history rows. Newly added rows and all active fields/root limits remain validated. Generic `transaction` retains full clone/full validation. Store admission is now bounded to 1,024 total pending transactions with explicit rejection metrics; writes still publish only after the existing atomic rename succeeds.
- The Pump decoder caches deterministic expected PDA derivations in a 512-entry LRU and caches constant address encodings. Every event still checks stack attribution, discriminator/schema, failed execution and equality with the expected PDA. `DecoderRegistry` exposes future decoder interfaces; PumpSwap, Raydium CPMM and Meteora DLMM are observation-only.
- `EventIngestion` admits receipts to a bounded durable journal before processing, dedupes by verified program address plus signature, limits global flow to 128, and separates decode (1), enrichment (4), strategy (1) and persistence (1) workers. Overload beyond RAM remains journaled; beyond journal capacity records a gap and pauses runtime providers. Stable paper IDs remain necessary for idempotent callback replay.
- `EventJournal` retains pending work, completed IDs, anchors, conservative dedupe slot floors, retries/quarantine and coalesced gaps across restart. It bounds records and bytes, checks single-writer ownership, truncates only an incomplete final WAL record, and fails on complete-record corruption. Work acknowledgements follow persistence. Stage failures retry up to three times and then remain quarantined and visible.
- `recoverGap` paginates supported read-only RPC with overlap, bounded concurrent transaction retrieval, retry/429 handling and coverage checks. `RecoveryCoordinator` coalesces requests per program and bounds automatic cycles. HTTP response size/timeout and WebSocket payload/handshake/heartbeat are bounded. Primary/secondary providers share one journal.
- Server and CLI share the monitoring service; server health/counter updates are batched at 250 ms with at most one Store flush active. Existing API fields remain; authenticated ingestion status and manual recovery endpoints are additive. Read-only chain observations never acquire synthetic prices or automatically open paper positions. Optional SQL observation audit has 64 admitted tasks/two workers and explicit failure/refusal counters after raw persistence.

## Retained Phase 1 workload: comparable three-run medians

The Phase 1 figures quoted in the request remain historical; this report uses a newly measured Phase 2 baseline on the same host as its after run. Identical unchanged `scripts/benchmark.ts`, 1,000 primary offers per scenario (plus one duplicate reconnect re-offer in overload), three independent repetitions, 32 warmup offers per scenario. Values below are the median of the three run percentiles/rates, not pooled quantiles. No disk persistence is configured. Full per-run values, nested timings and counts are in [before.json](phase2/before.json) and [after.json](phase2/after.json).

| Scenario | Version | p50 ms | p95 ms | p99 ms | Completed/s | Completed / duplicate / refused | RPC errors |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| sequential | Before | 3.578 | 4.806 | 6.484 | 282.517 | 1000 / 0 / 0 | 59 |
| sequential | After | 0.598 | 0.936 | 1.599 | 1574.111 | 1000 / 0 / 0 | 59 |
| dedupe-burst | Before | 1083.582 | 2310.766 | 2416.554 | 304.108 | 750 / 250 / 0 | 45 |
| dedupe-burst | After | 206.262 | 397.772 | 414.502 | 1705.410 | 750 / 250 / 0 | 45 |
| overload-reconnect | Before | 53.259 | 133.670 | 145.710 | 520.402 | 128 / 251 / 622 | 8 |
| overload-reconnect | After | 24.937 | 37.247 | 38.163 | 1614.642 | 128 / 251 / 622 | 8 |

The retained overload harness still refuses 622 offers. Its FIFO/capacity deliberately remain unchanged, so this is not a claim that the runtime lost 622 events after Phase 2. Default paper limits allow only five buy mutations per normal run; all other completions include valid strategy rejections. RPC errors here are injected independent historical reads, not evidence supporting synthetic risk assertions.

## Independent optimization checkpoints

Each checkpoint was measured after focused tests, before the next optimization. These are chronological snapshots, not randomized isolated causal experiments. Final Store hardening/formatting is represented by the final after run; checkpoint hashes identify earlier measured sources.

| Checkpoint | Sequential p95 ms | Duplicate-burst p95 ms | Overload p95 ms | Sequential completed/s |
| --- | ---: | ---: | ---: | ---: |
| Baseline | 4.806 | 2310.766 | 133.670 | 282.517 |
| Store only | 1.446 | 675.859 | 59.612 | 964.875 |
| Store + decoder checkpoint | 0.898 | 364.754 | 35.050 | 1714.153 |
| Final Store + decoder | 0.936 | 397.772 | 37.247 | 1574.111 |

| Sequential Store stage | Before p50 ms | Store checkpoint p50 ms | Final p50 ms |
| --- | ---: | ---: | ---: |
| store.clone_ms | 1.744 | 0.073 | 0.077 |
| store.validation_ms | 0.938 | 0.162 | 0.175 |
| store.queue_wait_ms | 0.003 | 0.002 | 0.002 |

Checkpoint data: [Store only](phase2/store-only.json), [Store + decoder](phase2/store-decoder.json). Full baseline sources are archived; these intermediate checkpoint hashes are retained in JSON, but intermediate sources were not separately archived.

Decoder-only paired test excludes fixture generation and compares cache disabled/enabled on the same final decoder. Each row is one ordered 1,000-event run; these are not confidence intervals.

| Decode fixture | Cache | Total ms | Decode p95 ms | Cache hits / misses |
| --- | --- | ---: | ---: | --- |
| repeated-mint | off | 473.881 | 0.812 | 0 / 1000 |
| repeated-mint | on | 90.150 | 0.137 | 999 / 1 |
| unique-mints | off | 731.498 | 1.597 | 0 / 1000 |
| unique-mints | on | 733.245 | 1.580 | 0 / 1000 |

The main replay deliberately repeats one mint and benefits from warm PDA cache locality. Unique-mint cold decoding has no cache hits; do not extrapolate repeated-mint gains to fresh mainnet launches. See [decoder-detail.json](phase2/decoder-detail.json).

## Extended runtime workloads and stage ablation

Same source harness and identical offers, one run per workload/version in fixed order: baseline source + legacy adapter; final Store/decoder + legacy adapter; final staged adapter. The legacy adapter admits 1,024 events (64 for saturation). The staged adapter admits 128 active flows plus a 10,000-entry journal (64 for saturation). Only durable-burst writes Store snapshots/raw JSONL and the new fsynced WAL; other workloads use an in-memory journal/Store. Enrichment is an independent mocked historical read, not live safety evidence. Sustained delivery offers ten events then waits 5 ms; it is not a fixed-rate open-loop load generator.

| Workload | Version | Completed / unique offered | p50 ms | p95 ms | p99 ms | Completed/s |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| burst-1000 | Before | 1000 / 1000 | 1947.617 | 3711.191 | 3908.530 | 250.054 |
| burst-1000 | Optimized legacy | 1000 / 1000 | 520.470 | 892.636 | 922.400 | 1009.478 |
| burst-1000 | Staged | 1000 / 1000 | 686.994 | 1015.739 | 1031.160 | 863.912 |
| stress-10000 | Before | 1024 / 10000 | 2132.333 | 3980.012 | 4129.007 | 243.178 |
| stress-10000 | Optimized legacy | 1024 / 10000 | 630.501 | 979.753 | 1011.294 | 976.274 |
| stress-10000 | Staged | 10000 / 10000 | 5710.309 | 14900.655 | 15964.607 | 596.946 |
| sustained | Before | 1000 / 1000 | 20.474 | 42.886 | 57.871 | 247.704 |
| sustained | Optimized legacy | 1000 / 1000 | 3.823 | 6.780 | 8.254 | 1369.059 |
| sustained | Staged | 1000 / 1000 | 6.717 | 16.831 | 28.351 | 1257.505 |
| duplicate-heavy | Before | 100 / 100 | 150.066 | 227.345 | 234.358 | 377.303 |
| duplicate-heavy | Optimized legacy | 100 / 100 | 35.092 | 49.916 | 50.851 | 1411.784 |
| duplicate-heavy | Staged | 100 / 100 | 53.861 | 60.174 | 61.184 | 1191.620 |
| saturation | Before | 64 / 1000 | 61.050 | 100.522 | 105.573 | 587.079 |
| saturation | Optimized legacy | 64 / 1000 | 46.594 | 57.912 | 59.962 | 1013.172 |
| saturation | Staged | 1000 / 1000 | 394.913 | 839.153 | 868.256 | 1130.112 |
| disconnect-backfill | Before | 900 / 1000 | 703.713 | 1720.173 | 1857.505 | 291.591 |
| disconnect-backfill | Optimized legacy | 900 / 1000 | 133.215 | 294.272 | 317.689 | 1601.393 |
| disconnect-backfill | Staged | 1000 / 1000 | 320.747 | 646.333 | 664.574 | 1394.192 |
| out-of-order | Before | 1000 / 1000 | 1523.001 | 3166.341 | 3319.333 | 295.704 |
| out-of-order | Optimized legacy | 1000 / 1000 | 294.230 | 611.550 | 633.982 | 1497.497 |
| out-of-order | Staged | 1000 / 1000 | 335.234 | 627.571 | 637.899 | 1428.392 |
| durable-burst | Before | 200 / 200 | 293.929 | 709.577 | 752.271 | 259.445 |
| durable-burst | Optimized legacy | 200 / 200 | 176.283 | 374.785 | 393.906 | 495.886 |
| durable-burst | Staged | 200 / 200 | 621.948 | 888.684 | 919.550 | 155.779 |

Stress and saturation latency populations differ: the staged run finishes far more events, including old work the legacy adapter refused. Their higher p95 measures backlog age and must not be sold as a comparable latency improvement. Disconnect before has 900 successful samples versus 1,000 after; the 100 withheld fixture timestamps are known only to the harness. Durable-burst has matching successful populations and regresses. Staging also adds observable cost relative to the optimized legacy adapter on burst, sustained, duplicate-heavy and durable runs; most local speedup comes from Store/decoder work, while staged admission primarily improves ownership and recovery.

## Accounting, loss and recovery

Refused admissions count receipt attempts, not permanent loss. Deferred means admitted to the journal beyond the RAM flow budget. `Uncompleted` below counts fixture identities absent at final drain; actual unseen chain activity has no known count. Duplicates are offers, never successful second callbacks. No staged fixture leaves pending or quarantined work; all reported integrity flags pass (schema, account reconciliation, unique open mints and paper mode). No workload has duplicate logical callbacks.

| Workload | Version | Duplicate offers | Refused attempts | Deferred → finished | Historical recovered | Uncompleted fixture IDs | Injected RPC errors | Recovery result |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- |
| burst-1000 | Before | 0 | 0 | 0 → 0 | 0 | 0 | 59 | not attempted |
| burst-1000 | Staged | 0 | 0 | 872 → 872 | 0 | 0 | 59 | not attempted |
| stress-10000 | Before | 0 | 8976 | 0 → 0 | 0 | 8976 | 61 | not attempted |
| stress-10000 | Staged | 0 | 0 | 9872 → 9872 | 0 | 0 | 589 | not attempted |
| sustained | Before | 0 | 0 | 0 → 0 | 0 | 0 | 59 | not attempted |
| sustained | Staged | 0 | 0 | 0 → 0 | 0 | 0 | 59 | not attempted |
| duplicate-heavy | Before | 900 | 0 | 0 → 0 | 0 | 0 | 6 | not attempted |
| duplicate-heavy | Staged | 900 | 0 | 0 → 0 | 0 | 0 | 6 | not attempted |
| saturation | Before | 0 | 936 | 0 → 0 | 0 | 936 | 4 | not attempted |
| saturation | Staged | 0 | 936 | 0 → 0 | 936 | 0 | 59 | recovered; 10 pages; 0 unavailable |
| disconnect-backfill | Before | 0 | 0 | 0 → 0 | 0 | 100 | 53 | not attempted |
| disconnect-backfill | Staged | 0 | 0 | 772 → 772 | 100 | 0 | 59 | recovered; 7 pages; 0 unavailable |
| out-of-order | Before | 0 | 0 | 0 → 0 | 0 | 0 | 59 | not attempted |
| out-of-order | Staged | 0 | 0 | 872 → 872 | 0 | 0 | 59 | not attempted |
| durable-burst | Before | 0 | 0 | 0 → 0 | 0 | 0 | 12 | not attempted |
| durable-burst | Staged | 0 | 0 | 72 → 72 | 0 | 0 | 12 | not attempted |

The 900 duplicate-heavy offers represent 100 distinct event identities; each is processed once. The saturation fixture recovers its 936 refused observations only because the mock RPC retains them and budgets suffice. In real operation receipt refusal increments a known-refusal count but unknown subscription downtime remains an interval. Missing transaction data, truncated windows, unavailable anchors, pagination limits, non-advancing cursors, RPC failures, quarantined work and exhausted cycles cannot be reported as complete coverage. Focused tests assert these incomplete/unrecoverable outcomes.

## Queue waiting, memory and event-loop delay

Peak RSS/heap are sampled every 5 ms and at receipt/completion checkpoints; they can miss brief peaks. Each adapter runs its workloads in one process, so GC and earlier workloads affect values. Event-loop delay uses 10 ms sampling; `unmeasured` means too few timer observations. These are host observations, not a memory ceiling or long-duration soak proof. The finite queue/byte limits are established by implementation and tests.

| Workload | Version | Peak RSS MiB | Peak heap MiB | Loop p95 ms | Loop max ms | Observation/decode queue wait p95 ms | Peak admitted RAM queue |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| burst-1000 | Before | 146.270 | 36.151 | unmeasured | unmeasured | 3704.500 | 1000 |
| burst-1000 | Staged | 146.340 | 41.263 | 42.172 | 49.480 | 122.104 | 128 |
| stress-10000 | Before | 161.547 | 57.912 | unmeasured | unmeasured | 3975.599 | 1024 |
| stress-10000 | Staged | 200.688 | 96.829 | 82.117 | 111.346 | 78.643 | 128 |
| sustained | Before | 163.367 | 59.908 | 53.379 | 73.794 | 38.638 | 10 |
| sustained | Staged | 169.344 | 59.102 | 16.507 | 26.903 | 3.909 | 11 |
| duplicate-heavy | Before | 163.867 | 58.660 | unmeasured | unmeasured | 225.430 | 100 |
| duplicate-heavy | Staged | 143.621 | 39.374 | 12.567 | 12.567 | 27.560 | 100 |
| saturation | Before | 164.742 | 55.924 | unmeasured | unmeasured | 98.709 | 64 |
| saturation | Staged | 144.246 | 42.275 | 29.295 | 35.455 | 31.943 | 64 |
| disconnect-backfill | Before | 167.492 | 63.469 | unmeasured | unmeasured | 1715.226 | 500 |
| disconnect-backfill | Staged | 144.371 | 46.127 | 25.428 | 29.245 | 62.600 | 128 |
| out-of-order | Before | 162.301 | 65.630 | unmeasured | unmeasured | 3160.558 | 1000 |
| out-of-order | Staged | 144.496 | 49.353 | 25.494 | 31.310 | 38.130 | 128 |
| durable-burst | Before | 163.801 | 64.950 | 12.100 | 13.369 | 703.657 | 200 |
| durable-burst | Staged | 147.621 | 49.928 | 12.354 | 13.312 | 26.668 | 128 |

Queue waits cover only residence after each stage admission; journal backlog residence is included in receipt-to-completion latency, not in decode queue wait. Restart latency starts at local resumption because process-local monotonic origins cannot span restart. Stage end-to-end spans are nested and must not be summed.

| Staged workload | Decode queue p95 ms | Enrichment queue p95 ms | Strategy queue p95 ms | Persistence queue p95 ms | Peak journal pending | End pending / quarantine |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| burst-1000 | 122.104 | 7.470 | 64.238 | 33.537 | not sampled | 0 / 0 |
| stress-10000 | 78.643 | 0.194 | 132.499 | 62.109 | not sampled | 0 / 0 |
| sustained | 3.909 | 0.734 | 3.753 | 7.534 | not sampled | 0 / 0 |
| duplicate-heavy | 27.560 | 10.813 | 18.847 | 8.273 | not sampled | 0 / 0 |
| saturation | 31.943 | 3.018 | 12.365 | 13.540 | not sampled | 0 / 0 |
| disconnect-backfill | 62.600 | 2.962 | 36.361 | 19.536 | not sampled | 0 / 0 |
| out-of-order | 38.130 | 3.065 | 37.008 | 19.646 | not sampled | 0 / 0 |
| durable-burst | 26.668 | 3.808 | 577.614 | 0.054 | not sampled | 0 / 0 |

The JSON includes all stage histograms, queue/in-flight gauge peaks, lifetime maxRSS, retry and recovery counts. Journal pending peak is not instrumented as a gauge in this version; final pending and configured bounds are exposed in status. This omission is explicit rather than substituting capacity for a measured peak.

## Validation and remaining work

Final `npm test`: **72 passed, 0 failed**, including all original 50 regression tests. `npm run typecheck` passed for backend/tests/scripts and frontend (`noEmit`). The test command limits parallel files to four to avoid cold tsx compilation causing the original fixed API-startup deadline to fail under load; no original assertion or timeout was weakened. Tests cover 1,000 duplicate/provider/history offers, bounded workers/backpressure, WAL restart/truncated-tail handling, dedupe floors, malformed work quarantine, paginated overlap and missing history, 429 waits, first-RPC-failure cycle exhaustion, real local WebSocket/HTTP reconnect, silent heartbeat loss and two-provider overlap. The crash test sends SIGKILL after a paper snapshot commit but before journal acknowledgement, restores the WAL and Store, and verifies no second buy or fee using the retained stable paper ID. This proves that tested crash boundary, not arbitrary power-loss exactly-once execution.

Remaining limitations:

1. Synchronous fsync/compaction blocks the event loop and regresses durable throughput. Group commit or a worker-owned durable queue needs separate acknowledgement/failure testing before replacing it.
2. Journal completion and Store/raw/SQL side effects are not one atomic database transaction. Callback replay is at least once until acknowledgement; consumers must be idempotent. The existing paper `seen` list retains 10,000 IDs, so replay outside that horizon cannot promise indefinite duplicate suppression. Raw JSONL can contain duplicate audit lines after a crash. No funded execution is connected.
3. Dedupe and history are finite. Completed-ID eviction raises a conservative per-program slot floor; older unknown events are explicitly rejected as gaps, including legitimate delayed events. Raising bounds is not a proof of complete historical ownership.
4. A recovered window is provider-reported coverage within configured bounds, not a cryptographic chain completeness proof. Confirmed observations can reorganize; there is no finalized fork rollback or independent provider-history reconciliation. A first-ever subscription has no trusted prior anchor, and unseen pre-start activity is not inferred. Startup after a retained anchor triggers bounded recovery.
5. Only one verified Pump metadata decoder exists. Remaining launch/pool/swap adapters, independent prices/liquidity/risk enrichment, actual sell simulation and funded signer/fee reconciliation remain absent. Runtime stages expose extension callbacks but read-only monitoring never manufactures trading evidence.
6. Raw JSONL files grow on disk and need rotation. Journal and Store assume one writer; WAL PID locking does not replace distributed ownership. Rename does not fsync the parent directory, and the existing Store snapshot does not fsync file data. Arbitrary OS/power-loss durability is not proven.
7. No mainnet soak, real provider retention test, high-cardinality live decode profile, randomized repeated extended benchmark or funded performance measurement was performed. SQL audit and notification delivery remain best effort; existing dependency/security limitations remain unchanged.

## Evidence and reproduction

[Architecture, recovery contract and commands](phase2/README.md) · [final test log](phase2/after-tests.txt) · [baseline 50-test log](phase2/before-tests.txt) · [type checks](phase2/typecheck.txt) · [baseline workload](phase2/workloads-before.json) · [optimized legacy ablation](phase2/workloads-optimized-legacy.json) · [staged workload](phase2/workloads-after.json) · [baseline source archive](phase2/before-source.tar.gz). JSON records source/harness hashes. The report generator rejects mismatched comparable harness/environment metadata and failed conservation/integrity flags. Exact timing is host-dependent and is never a test threshold.
