# Phase 3 engineering report

Validation completed 2026-11-06. The project was extended in place; dashboard, paper accounting/strategy controls and existing API fields remain. Live mode stays disabled. No application/frontend/container build, deployment, funded transaction, wallet permission or signing path was enabled. Raw artifacts carry their own capture timestamps: the protocol fixture acquisition began on November 3 and final local validation continued on November 6.

## Outcome

The final comparable durable burst improved from **148.399 to 418.049 completed events/s**; median run p95 fell from **958.543 to 408.430 ms**. Both versions completed all 200 offered events per repetition with actual WAL, raw-file and paper Store I/O, and file-fsync ownership before acknowledgement. Group commit adds file/directory syncing in a worker rather than dropping the durability guarantee. These newly measured baselines are distinct from the historical Phase 2 value of 155.779/s; that original result remains unchanged.

Under 1,000 historical plus 100 live inputs, fresh-event p95 improved from **589.262 to 69.279 ms**, while total throughput declined from 1745.417 to 1606.511/s. That fairness tradeoff is reported, not hidden. Unique-mint throughput is slightly lower in this sample; repeated-mint changes are small and neither is a statistical performance guarantee. All offline completion populations match, all recorded integrity flags pass and no duplicate logical callbacks occurred.

**94 tests pass**, including all original 72 tests with the original test files unchanged. Type checks pass for source, tests, scripts and frontend (`noEmit`). Four real finalized creation transactions validate selected Pump, PumpSwap, Raydium CPMM and Meteora DLMM variants. This is not full platform/version coverage or a verified executable price feed.

## Audit and measured bottleneck

The source audit covered EventJournal, ingestion/stages, backfill, monitoring integration, Store, chain/decoder registry, telemetry and existing fixtures/tests. Phase 2 appended and fsynced each ownership record and completion on the main event loop. Its checkpoint serialization/write/rename also ran there. Each paper Store snapshot still writes and renames separately. The original instrumentation and source archive were captured before these changes; optimization was based on the instrumented I/O profile, not README claims.

| Baseline direct WAL profile | Count | Total ms | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| fsyncSync | 2002 | 3206.349 | 1.513 | 2.487 | 3.051 |
| writeSync | 2001 | 70.513 | 0.031 | 0.060 | 0.082 |
| JSON.stringify | 5007 | 81.190 | 0.012 | 0.039 | 0.058 |
| offer | 1000 | 1897.938 | 1.789 | 2.856 | 3.539 |
| complete | 1000 | 1681.818 | 1.597 | 2.544 | 3.110 |
| compact | 1 | 5.231 | 5.231 | 5.231 | 5.231 |

The 1,000-event direct WAL profile took 3595.686 ms and delayed a ready zero-delay timer by 3597.748 ms. Observed main-thread GC time was 4.857 ms over 1 delivered GC entries. Instrumentation hooks and nested timings overlap; totals must not be summed. [Raw profile](phase3/wal-profile-before.json) includes CPU, memory and source hash. Compaction was forced once; no general compaction-tail SLO is inferred from one sample.

## Isolated WAL comparison

Same 1,000 offers, 64-offer cohorts, equal completion populations and three seeded randomized adapter-order repetitions. Worker startup and fixture generation are excluded. Both implementations fsync WAL file data before ownership/completion acknowledgement; the worker also syncs its parent directory. The new checksummed envelope is included in worker cost.

| Adapter | Completed/s | Receipt→completion p50 ms | p95 ms | p99 ms | Event-loop max ms | Process CPU ms | Data-ack groups |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| sync | 299.744 | 105.893 | 133.301 | 163.891 | 3342.860 | 487.401 | per-record sync; not batch-counted |
| worker | 2550.210 | 20.408 | 39.400 | 42.265 | 12.853 | 637.037 | 32 |

Group counts are acknowledged record groups, not individual fsync system-call counts. File/directory sync and checkpoint syncs are distinct operations. [Per-run JSON](phase3/journal-comparison.json) records distributions, memory, CPU, writer counters and ordering seed. Cold worker startup costs remain real even though excluded from this warm throughput comparison.

## Full pipeline workloads: equal completion populations

Environment: v20.19.5, 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz. The identical source harness runs three randomized repetitions using seed 89271. Each cell below is the median of run-level values, not a pooled quantile. Ten-thousand-event unique-mint fixtures contain 10,000 distinct encoded mint/PDA pairs; repeated-mint fixtures contain one mint. Independent synthetic paper quotes retain the original safety and five-position cap. Most completions are strategy evaluations/rejections, not buys.

| Workload | Version | Completed/run | p50 ms | p95 ms | p99 ms | Completed/s | Fresh live p95 ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| unique-mints-10000 | before | 10000 | 7646.008 | 16605.817 | 17501.953 | 555.825 | 16605.817 |
| unique-mints-10000 | after | 10000 | 7812.051 | 16719.126 | 17657.195 | 550.177 | 16719.126 |
| repeated-mint-10000 | before | 10000 | 4033.635 | 9775.425 | 10410.336 | 917.735 | 9775.425 |
| repeated-mint-10000 | after | 10000 | 4122.816 | 9736.756 | 10364.437 | 923.608 | 9736.756 |
| durable-burst-200 | before | 200 | 639.000 | 958.543 | 991.508 | 148.399 | 958.543 |
| durable-burst-200 | after | 200 | 241.729 | 408.430 | 418.870 | 418.049 | 408.430 |
| sustained-stream | before | 1000 | 59.078 | 119.086 | 123.993 | 1564.964 | 119.086 |
| sustained-stream | after | 1000 | 50.202 | 96.653 | 97.250 | 1754.863 | 96.653 |
| concurrent-history-live | before | 1100 | 325.398 | 570.369 | 589.239 | 1745.417 | 589.262 |
| concurrent-history-live | after | 1100 | 339.417 | 631.116 | 649.639 | 1606.511 | 69.279 |
| slow-unavailable-rpc | before | 1000 | 372.580 | 695.433 | 724.182 | 1188.184 | 695.433 |
| slow-unavailable-rpc | after | 1000 | 384.750 | 700.181 | 805.394 | 1192.149 | 700.181 |

Only durable-burst writes real WAL, direct raw append and paper Store snapshots. The comparison preserves the same raw append callback; it does not benchmark production raw rotation or a high-water compaction workload. Other pipeline workloads use in-memory ownership and exercise scheduler/decoder/Store overhead. Sustained delivery paces 64 offers/20 ms for a finite 1,000-event fixture; it is not a multi-hour soak or an open-loop production traffic generator. Slow/unavailable RPC is injected: each 37th identity fails its first two attempts before succeeding. That workload is not live provider risk evidence. No completion/refusal population was trimmed to obtain an improvement.

Measured regressions/tradeoffs:

- unique-mints-10000: throughput -1.02%; overall p95 +0.68%.
- repeated-mint-10000: throughput +0.64%; overall p95 -0.40%.
- durable-burst-200: throughput +181.71%; overall p95 -57.39%.
- sustained-stream: throughput +12.13%; overall p95 -18.84%.
- concurrent-history-live: throughput -7.96%; overall p95 +10.65%.
- slow-unavailable-rpc: throughput +0.33%; overall p95 +0.68%.

The pinned low-level Pump decoder and its cache were not changed in Phase 3. New full-transaction verification is an additional capability with additional work, not a claim that its latency equals log-only decode. Small percent changes have no confidence interval or proven significance. Fair scheduling intentionally shifts waiting time from fresh events toward older backlog; total throughput can decline. Group collection can add low-load acknowledgement delay.

| Workload | Version | Peak sampled RSS MiB | Peak sampled heap MiB | Process CPU ms | Event-loop p95 ms | Event-loop max ms | Observed main GC ms | Peak journal pending | RPC faults |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| unique-mints-10000 | before | 212.426 | 111.106 | 18974.020 | 75.760 | 357.827 | 761.139 | unmeasured | 0 |
| unique-mints-10000 | after | 234.277 | 119.851 | 19338.950 | 75.366 | 405.537 | 704.309 | 10000.000 | 0 |
| repeated-mint-10000 | before | 223.062 | 104.199 | 11509.043 | 50.397 | 385.090 | 619.476 | unmeasured | 0 |
| repeated-mint-10000 | after | 209.684 | 98.706 | 11957.587 | 48.562 | 394.527 | 614.548 | 10000.000 | 0 |
| durable-burst-200 | before | 228.176 | 120.202 | 874.114 | 12.509 | 354.157 | 10.403 | unmeasured | 0 |
| durable-burst-200 | after | 278.230 | 56.508 | 814.843 | 10.977 | 15.917 | 9.242 | 198.000 | 0 |
| sustained-stream | before | 229.363 | 124.419 | 848.431 | 28.934 | 31.474 | 22.740 | unmeasured | 0 |
| sustained-stream | after | 192.168 | 63.353 | 588.685 | 21.971 | 26.149 | 23.873 | 193.000 | 0 |
| concurrent-history-live | before | 224.809 | 120.965 | 708.251 | 22.495 | 39.420 | 27.121 | unmeasured | 0 |
| concurrent-history-live | after | 192.168 | 79.507 | 791.163 | 23.134 | 43.516 | 27.365 | 1100.000 | 0 |
| slow-unavailable-rpc | before | 218.992 | 107.988 | 748.407 | 12.222 | 36.372 | 29.590 | unmeasured | 56 |
| slow-unavailable-rpc | after | 242.238 | 135.482 | 747.249 | 12.141 | 37.913 | 31.261 | 1000.000 | 56 |

RSS/heap are sampled (5 ms plus offer cohorts) and include already-generated fixtures and process history; a sample can miss a brief peak. CPU is process accounting, GC observations cover delivered main-thread entries, and worker GC is not separately profiled. Memory bounds come from queue/byte limits and tests, not from treating sampled RSS as a ceiling. Raw JSON includes every stage queue-wait distribution, occupancy peak, WAL byte count, ownership/completion acknowledgements and retry/error count. Journal `pendingPeak` is newly measured; no baseline peak is invented.

## Bounded wall-time durability soak

A separate after-only observation experiment ran for 30.016 s at a target 200/s: 6020 offered and 6020 completed, with zero refusals/duplicate callbacks. Receipt-to-completion p95 was 17.495 ms; event-loop p95 10.625 ms. End pending/quarantine was 0/0. The durable WAL was real; logs were empty observation-only fixtures, with no Store/raw writes, paper quotes or RPC. Measurement maps and total inputs are capped at 10,000. This short finite health observation is not a comparative speedup or production endurance proof. [Soak JSON](phase3/soak.json).

## Recorded finalized launch replay

| Run | Decode attempts | Distinct captures | Verified results | Local decode p50 ms | p95 ms | p99 ms | Total ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 400 | 4 | 400 | 4.577 | 7.758 | 9.253 | 1992.152 |
| 2 | 400 | 4 | 400 | 4.605 | 7.895 | 8.973 | 1995.115 |
| 3 | 400 | 4 | 400 | 4.605 | 7.831 | 8.924 | 1981.579 |

Each run repeats four real captures 100 times. It does not contain 400 distinct launches. Their pinned instruction/event schemas, invocation boundaries, successful status and later finalized account evidence are validated. Accounts are not reconstructed at the creation slot; mutable present-day state is not used to invent original liquidity or prices. [Coverage/provenance matrix](phase3/protocol-coverage.md) lists exact enabled variants, program IDs, commits, signatures and version limits. Future/other layouts remain disabled.

## Retained Phase 1 and Phase 2 compatibility runs

The original harness files remain byte-identical. The following Phase 1 before/after runs use 1,000 primary offers and three repetitions on the same host; overload includes its existing reconnect re-offer. These exercise the compatibility path, not worker-backed runtime admission.

| Phase 1 scenario | Version | p95 ms | Completed/s | Completed / duplicate / refused |
| --- | --- | ---: | ---: | --- |
| sequential | before | 1.059 | 1439.119 | 1000 / 0 / 0 |
| sequential | after | 0.990 | 1569.662 | 1000 / 0 / 0 |
| dedupe-burst | before | 398.625 | 1702.814 | 750 / 250 / 0 |
| dedupe-burst | after | 384.481 | 1751.826 | 750 / 250 / 0 |
| overload-reconnect | before | 34.849 | 1705.996 | 128 / 251 / 622 |
| overload-reconnect | after | 38.518 | 1515.656 | 128 / 251 / 622 |

| Original Phase 2 workload | Version | Completed / unique | p95 ms | Completed/s | Refused / recovered / uncompleted |
| --- | --- | --- | ---: | ---: | --- |
| burst-1000 | before | 1000 / 1000 | 1021.692 | 864.531 | 0 / 0 / 0 |
| burst-1000 | compatible after | 1000 / 1000 | 985.533 | 876.743 | 0 / 0 / 0 |
| stress-10000 | before | 10000 / 10000 | 15553.527 | 569.403 | 0 / 0 / 0 |
| stress-10000 | compatible after | 10000 / 10000 | 15074.160 | 590.073 | 0 / 0 / 0 |
| sustained | before | 1000 / 1000 | 16.899 | 1246.972 | 0 / 0 / 0 |
| sustained | compatible after | 1000 / 1000 | 15.611 | 1230.920 | 0 / 0 / 0 |
| duplicate-heavy | before | 100 / 100 | 60.128 | 1196.239 | 0 / 0 / 0 |
| duplicate-heavy | compatible after | 100 / 100 | 79.281 | 885.742 | 0 / 0 / 0 |
| saturation | before | 1000 / 1000 | 810.370 | 1165.437 | 936 / 936 / 0 |
| saturation | compatible after | 1000 / 1000 | 887.780 | 1064.721 | 936 / 936 / 0 |
| disconnect-backfill | before | 1000 / 1000 | 668.323 | 1335.706 | 0 / 100 / 0 |
| disconnect-backfill | compatible after | 1000 / 1000 | 720.763 | 1214.480 | 0 / 100 / 0 |
| out-of-order | before | 1000 / 1000 | 629.416 | 1427.284 | 0 / 0 / 0 |
| out-of-order | compatible after | 1000 / 1000 | 663.672 | 1341.875 | 0 / 0 / 0 |
| durable-burst | before | 200 / 200 | 902.003 | 155.159 | 0 / 0 / 0 |
| durable-burst | compatible after | 200 / 200 | 893.721 | 155.202 | 0 / 0 / 0 |

These Phase 2 runs explicitly construct the synchronous journal; they preserve the original harness and do not select the new worker runtime. Their single-run values and changed success populations (where applicable) are not substituted for the equal-population three-run worker comparison. Any slower compatibility result remains visible in this table. [Before](phase3/phase2-before.json) and [compatible after](phase3/phase2-compatible-after.json) retain full telemetry.

## Optional mainnet read-only experiment

The bounded public-provider collector recorded **501 actual confirmed observations**, 1 duplicate receipts, 0 RPC errors and 0 HTTP 429s during this final sample. Capture duration was 10.598 s (including initial head/subscription/reconnect work), with 47.177 captured observations/s. The configured observation cap was 500; reaching it limits coverage. Earlier fixture acquisition did encounter rate-limit/unsupported-version failures, retained in acquisition logs; a zero in this short final run does not erase them.

| Read-only measurement | Samples | p50 ms | p95 ms | p99 ms |
| --- | ---: | ---: | ---: | ---: |
| rpc_getSlot_ms | 1 | 985.585 | 985.585 | 985.585 |
| local_receipt_handling_ms | 500 | 0.086 | 0.216 | 0.269 |
| reconnect_to_all_acks_ms | 1 | 2671.651 | 2671.651 | 2671.651 |
| rpc_getTransaction_ms | 5 | 1115.708 | 1544.875 | 1544.875 |
| rpc_getSignaturesForAddress_ms | 4 | 1747.621 | 2048.781 | 2048.781 |

Local replay examined 69 Pump observations and decoded **0 distinct Pump launch mints**, with 0 decoder failures. No observed launch throughput is claimed when no CreateEvent was present. The separate recorded fixtures supply real positive launch cases. Token-balance mint distribution, if present, describes only the bounded transaction retrieval sample, not every observation or a launch assertion.

Signed slot-lag summary: `{"count": 500, "max": -7, "p50": -25, "p95": -8, "p99": -7}`. The head is a pre-window snapshot; negative lag means that snapshot is stale relative to later receipts. It is not negative network latency and is not converted into milliseconds. Historical checks scan at most 100 signatures/program and explicitly label sampled missing receipts/page caps as partial coverage. No exhaustive mainnet recovery, precise chain-event-to-receipt latency or permanent-loss count is claimed. The collector is independent of the Node WAL pipeline; its network results cannot substantiate mainnet funded or durable-processing throughput. [Network JSON](phase3/mainnet-readonly.json), [bounded observations](phase3/mainnet-readonly.observations.json), [decode JSON](phase3/mainnet-readonly.decode.json).

## Correctness and durability validation

The final log reports **94 passed / 0 failed**. Hashes verify all 12 original test/helper files recorded at Phase 2 are unchanged. Tests add grouped fsync ownership, duplicate in-flight offers/responses, bounded writer pressure, ENOSPC at write/sync, checksummed corruption, truncated tail, explicit worker failure, restart replay, SIGKILL between ownership/paper commit and completion, weighted live/history fairness, stale/unknown freshness rejection, four real protocol positive fixtures plus malformed negatives, archive retention/tombstones and fork/provider conflicts. No original readiness timeout or assertion was weakened. An earlier run overlapped a smoke benchmark and hit the existing API cold-start deadline; it was discarded, then the final suite and performance runs were executed separately.

Checks establish the tested supported crash window, not unlimited exactly-once execution. Work is not processed before durable ownership. Completion acknowledgement follows its fsynced completion record. A crash may still replay an acknowledged-owned event whose completion was not acknowledged. Callbacks must be idempotent; the paper seen-ID horizon is finite. ENOSPC is deterministic failure injection, not an actual disk-filling experiment. Physical power cuts and arbitrary filesystem/device failure were not tested.

## Remaining risks and next phase

1. The paper Store and WAL/raw/SQL are not one atomic ledger. Store snapshots still lack file fsync; retained paper IDs do not guarantee exactly-once purchases forever. Funded execution needs a separate transactional execution ledger, reconciliation and signer review.
2. Worker startup, IPC/copying, checksums and group collection add costs. Fresh fairness improves fresh latency while reducing mixed-load total throughput; cold unique-mint gains are not demonstrated. Evaluate these tradeoffs under longer representative load before setting an SLO.
3. Coverage is four pinned creation variants and four real positive captures, not every program upgrade or launch route. Deployment slots/IDL versions do not prove historical binary identity. Later account snapshots cannot prove initial liquidity, prices, sellability or token risk. Expand independently verified fixtures before enabling another variant.
4. Provider history/finality is bounded and fallible. Slot/log conflicts fail closed with gaps; no automatic accounting rollback, cryptographic completeness proof or independent-provider finalized-history reconciliation exists. Finality delays/RPC failures can quarantine accepted work.
5. Raw retention deliberately removes old audit payloads after preserving bounded cumulative coverage metadata. It is not permanent complete history. Legacy oversized archives and external disk growth require operator monitoring; free-disk/WAL metrics are sampled at writer activity, not an independent continuous disk monitor.
6. The public run is short and cap-limited, and the sustained fixture is finite. No multi-hour soak, production memory ceiling, broad RPC-provider comparison, funded benchmark or profitability claim is supported.
7. The end-to-end Node verification service was not proven against the public provider in this environment: a direct Node RPC probe timed out, while the independent Python collector succeeded. Local HTTP/WebSocket integration and replay of captured finalized evidence passed. Provider transport compatibility needs a deployment-specific check.
8. Next priorities: longer constrained-traffic soak and slow-storage stress; archived program binaries/additional layout fixtures; explicit finality/fork reconciliation; durable verification-issue audit across restart; and independently reviewed transactional paper/account persistence before any funded design. Live mode remains rejected.

## Reproduction and evidence

[Commands, architecture and operations](phase3/README.md) · [WAL durability contract](phase3/wal-durability.md) · [protocol matrix](phase3/protocol-coverage.md) · [baseline source archive](phase3/before-source.tar.gz) · [final test log](phase3/after-tests.txt) · [type checks](phase3/typecheck.txt) · [full workloads](phase3/workloads.json) · [WAL comparison](phase3/journal-comparison.json). Source/schema/fixture/harness manifests identify the measured inputs. The generator verifies harness/source compatibility, equal populations, test preservation and integrity flags; it does not manufacture samples or infer unavailable results.
