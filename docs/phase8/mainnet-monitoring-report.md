# Phase 8 mainnet monitoring report

Actual public mainnet experiment, requested **900 seconds (15 minutes)** of observation, source provider `api.mainnet-beta.solana.com`. Including initialization/final drain, receipt-to-stop wall duration is 901.658 seconds. This is a longer bounded research run, not a multi-hour production soak or complete feed coverage.

| Observed population | Count |
|---|---:|
| Notifications received | 57,518 |
| Successful CreateV2 notifications considered (may repeat a signature) | 54 |
| Candidates selected across the window | 18 |
| Excluded by configured sampling/duplicate/maximum bound | 36 |
| Verified creation instructions | 8 |
| Final paper decision callbacks | 8 |
| Paper reviews with parsed market state | 0 |
| Actual linked simulation attempts in candidate gate | 0 |
| Paper trades | 0 |
| Admission refusals | 0 |
| Recorded disconnect/reconnect gap entries | 11 |

Sampling admits at most one selected candidate per configured interval and at most 60 candidates. Excluded notifications were not all decoded or durably ingested: this is **not** proof of zero event loss, total coverage or full-feed throughput. Verification failures before opportunity creation are recorded separately from paper decisions. Reasons overlap; their counts cannot be summed into opportunity counts.

## Degraded coverage — failed extended-feed validation

**The public WebSocket exhausted its five-reconnect budget at approximately 408.9 seconds.** It received no further notifications for the remaining 492.8 process seconds. The11 gap records represent six disconnects and five reconnects, not11 independent recovered intervals. The configured900-second process ran to completion, but it did **not** provide15 minutes of connected coverage. No backfill recovery was performed, so long-duration continuous mainnet validation remains failed/incomplete.

Final source now tracks feed health separately from RPC/provider agreement, marks exhaustion failed, stops new paper work on permanent exhaustion, and prevents a later ready callback from silently clearing the terminal health state. These changes are covered deterministically; the original long run did not exercise that later guard. Do not raise retry budgets or infer recovered coverage to conceal the failure. A replacement provider/recovery experiment remains required.

## Rejections and limitations

| Verification issue | Selected receipts |
|---|---:|
| Pump instruction/event mismatch | 7 |
| Truncated binary layout | 3 |

| Paper decision reason | Decisions containing reason |
|---|---:|
| Curve identity, supply or decimals mismatch | 4 |
| Unsupported completed, configurable or non-native Pump curve | 2 |
| Unknown or stale chain event time | 2 |

No mandatory risk condition, token balance, account authority or strategy parameter was fabricated. The result is **0 paper trades**, with positive entry/exit behavior unproven if no eligible candidate appeared. Initial instruction/state checks can reject unsupported current variants before any quote exists; those rejections do not imply verified prices or simulations.

## Timings and resources

Local monotonic receipt → completed paper-decision callback: n=8, p50/p95/p99 **1051.645/1253.602/1253.602 ms**. This population includes rejections, not eligible fills.

| Measured stage | Count | p50/p95/p99 ms |
|---|---:|---|
| market.transaction_verification_ms | 18 | 223.949/285.102/285.102 |
| market.state_retrieval_ms | 6 | 550.451/672.938/672.938 |
| ingest.enrichment.queue_wait_ms | 18 | 0.040/0.049/0.049 |
| market.queue_backlog_age_ms | 8 | 0.020/0.046/0.046 |

Missing simulation or paper-fill latency is **unmeasured**, never zero. Chain block time, confirmed receipt slot, finalized transaction/account context, wall age and process-local receipt clocks stay distinct. Peak sampled RSS/heap: **260.4/49.8 MiB**; CPU user/system: **15.262/1.318 seconds**. Five-second samples retain memory, CPU, event-loop p50/p95/p99/max, main-thread GC and WAL status. Sampling can miss peaks; main-thread GC is not complete worker GC attribution.

The market transport counted 54 calls / 6 errors. Tagged rate-limit counter: 0. Separate issues: 20. These counters are not an exhaustive count of all underlying verification/holder RPC attempts: some legacy read paths normalize errors, and successful verifier requests are also retained in raw capture records. A zero tagged rate-limit count cannot certify zero provider throttling. Raw request/result provenance and issue categories are preserved.

Final WAL pending/unacknowledged: **0/0**, disk bytes **168632**, fsync groups **37**. Compaction telemetry is retained if emitted; no forced production-sized compaction or exhaustive historical recovery is inferred from this small sampled WAL. 0 capture records exceeded the explicit retention bounds. Disconnect gap entries describe observations, not guaranteed historical recovery.

## Source and evidence scope

[Raw run](mainnet/evidence.json), [ledger](mainnet/ledger.json), [WAL](mainnet/ingestion.wal), [transcript](mainnet.log), [summary](validation-summary.json). The long experiment used the preserved initial Phase 8 harness in `mainnet-harness-executed.ts.txt`, retaining Phase 7 mandatory paper gating. Later source adds optional independent-provider rejection, complete-strategy digest and bounded diagnostics, mainnet genesis validation, terminal feed-health handling and corrected dashboard metadata. Short integration/release-check directories preserve those later observations separately. No current-chain eligible entry exercised the added provider gate; its unknown/conflict rejection is tested deterministically.

Two producer-only metadata errors were corrected: a rejection callback does not verify market state; a confirmed notification head is not a finalized slot. The stopped Research snapshot is rebuilt from durable evidence, old market banks become stale, and explicit finalized provider observations are separate. The original at-stop projection is retained as superseded metadata; raw decisions/account bytes are unchanged. No clock is refreshed into executable evidence.

A separate authenticated PostgreSQL heartbeat overlaps this monitoring window for five minutes: 62 successful checks, 0 failures, p50/p95/p99 1.935/2.178/3.173 ms. It is not a database connection attached to the live candidate pipeline and not HA evidence. Node profiles/benchmarks and normal development activity also overlap parts of the run, so resource/latency observations are under documented concurrent research load.

Reproduction uses the explicit `phase8-mainnet.ts --run --seconds 900 --max-candidates 60 --output NEW_DIRECTORY`; defaults are read-only. Public providers and current program variants can change. Multi-hour soak, fresh eligible entry/exit, independently verified provider infrastructure and production recovery remain open.
