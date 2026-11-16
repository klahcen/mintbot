# Phase 9 extended mainnet observation

RUNNING: final two-hour results are not yet available. Requested duration is 7200 seconds. Receipt counts represent delivered Pump log notifications, not every network launch. Only bounded sampled CreateV2 candidates enter account/risk evaluation. No other venue is claimed continuously monitored by this run.

| Observation | Measured value |
|---|---|
| Experiment | RUNNING: final two-hour results are not yet available |
| Supervisor elapsed seconds | 995.146 |
| Transport open seconds | 981.507 |
| Transport disconnected seconds | 13.640 |
| Connections / incidents | 12 / 11 |
| Delivered notifications | 140984 |
| Admission refusals/conflicts | 62 |
| Sampled candidates | 15 |
| Verified creations | 4 |
| Durable market reviews / parsed states | 4 / 0 |
| Simulation diagnostic records | final evidence pending |
| Paper entries / exits | 0 / 0 |
| Instrumented RPC calls / errors | 128 / 97 |
| Observed explicit rate limits (lower bound) | 2 |
| WAL checkpoints | 9 |
| Live trading | False |
| Completed ingestion identities | 140906 |
| Processing fatal state | None |
| Quarantined observations | 26 |
| Oldest pending age ms (includes quarantine) | 892984 |
| Admission queue peak | 1024 |
| Worker unacknowledged record peak | 17 |
| Intentional transport backpressure pauses | 1 |
| Paired account-state quote reviews (before simulation) | 0 |

Confirmed notification heads are recorded in row events and sample WAL anchors. Only verifier transactions and finalized account/RPC reads establish finalized evidence; these are not interchangeable slot observations. Socket-open time includes pre-ACK time and notification pauses, and does not certify finalized coverage. Recovery remains provider-reported and incomplete where anchors, windows or histories are unavailable.

| Slot scope | Recorded range/observation |
|---|---|
| Latest durable completed observation anchor (confirmed feed) | {'pump': {'signature': '2sBA9NL46gqdAxyzWUWHs69ATWq9Y2JyHS7LF7m4Rkj1fA8uiupkm98yCNUx8uNor5CNKCDjcV9FaGUVYxkRTrLc', 'slot': 467971661}} |
| Sampled finalized creation transaction slots | Unavailable/pending |
| Sampled finalized market account slots | Unavailable/pending |

Slot ranges describe sampled provider-reported reads, not covered intervals or finalized network heads. Slot differences are not converted into elapsed milliseconds.

Final sampled verification distribution pending.

| Resource observation | Value |
|---|---|
| Process CPU user/system microseconds | {'user': 218104134, 'system': 32566847} |
| Sampled peak RSS bytes | 290926592 |
| Sampled peak WAL bytes | 7656230 |
| Minimum sampled disk free bytes | 69152477184 |
| WAL writer failure | None |
| Fsync batches | 54624 |
| Records/group p50/p95/p99 | {'p50': 6, 'p95': 9, 'p99': 10} |
| Event-loop delay captured ms | {'p50': 20.119551, 'p95': 21.004287, 'p99': 22.822911, 'max': 940.572671} |
| GC captured count/time ms | 1998 / 3657.582731023431 |

Resource snapshots precede final evidence serialization; that export can allocate additional memory. RPC error counters cover instrumented transports, while explicit HTTP429 counts are a lower bound across captured error paths; retained issue rows are capped at 500.

Selected monotonic histograms, milliseconds:

| Timer | All observations | Retained samples | p50 | p95 | p99 |
|---|---|---|---|---|---|
| store.queue_wait_ms | 20 | 20 | 0.016 | 0.104 | 0.104 |
| research.admission.queue_wait_ms | 140983 | 10000 | 35.547 | 345.207 | 566.678 |
| journal.worker_fsync_ms | 54615 | 10000 | 1.976 | 3.968 | 4.679 |
| ingest.decode.queue_wait_ms | 140932 | 10000 | 0.163 | 0.665 | 1.157 |
| ingest.decode.end_to_end_ms | 140932 | 10000 | 46.105 | 355.924 | 572.578 |
| ingest.enrichment.queue_wait_ms | 140906 | 10000 | 0.012 | 0.031 | 0.298 |
| ingest.strategy.queue_wait_ms | 140906 | 10000 | 0.075 | 0.256 | 0.541 |
| ingest.strategy.processing_ms | 140906 | 10000 | 0.036 | 0.160 | 0.233 |
| ingest.persistence.queue_wait_ms | 140906 | 10000 | 0.013 | 0.040 | 0.188 |
| raw.persistence.queue_wait_ms | 140906 | 10000 | 1.411 | 3.702 | 7.544 |
| research.admission.processing_ms | 140983 | 10000 | 9.796 | 19.747 | 31.174 |
| research.admission.end_to_end_ms | 140983 | 10000 | 46.977 | 357.137 | 571.389 |
| market.transaction_verification_ms | 15 | 15 | 276.402 | 438.419 | 438.419 |
| market.pipeline.queue_wait_ms | 4 | 4 | 0.008 | 0.015 | 0.015 |
| market.receipt_to_evaluation_ms | 4 | 4 | 1,146.579 | 1,482.789 | 1,482.789 |
| market.accounts.queue_wait_ms | 6 | 6 | 0.036 | 4.260 | 4.260 |
| rpc.market.getLatestBlockhash_ms | 3 | 3 | 155.736 | 155.736 | 155.736 |
| rpc.market.getMinimumBalanceForRentExemption_ms | 3 | 3 | 677.438 | 677.438 | 677.438 |
| rpc.market.getRecentPrioritizationFees_ms | 3 | 3 | 609.299 | 609.299 | 609.299 |
| rpc.market.getMultipleAccounts_ms | 12 | 12 | 447.193 | 655.612 | 655.612 |
| rpc.market.getFeeForMessage_ms | 3 | 3 | 134.081 | 134.081 | 134.081 |
| rpc.market.getProgramAccounts_ms | 3 | 3 | 127.006 | 127.006 | 127.006 |
| market.state_retrieval_ms | 3 | 3 | 729.593 | 729.593 | 729.593 |
| research.receipt_to_paper_decision_ms | 4 | 4 | 2,065.843 | 2,173.710 | 2,173.710 |

Histograms are bounded rolling samples (10,000 retained by default), not exact lifetime quantiles once full. Decode end-to-end starts at the existing monitor's normalized-event receipt clock and includes intake, WAL ownership and queue delay for live observations. JSON/message normalization precedes that clock and has separate timers; this is not wire-arrival or chain-occurrence latency. Historical/restart timing has its own origin and cannot measure an earlier process receipt. Quote/risk/simulation timers absent from the table have no measured population; absence does not mean zero latency. Queue age, peak depth, fsync groups, memory/CPU, GC and event-loop observations are in samples and telemetry.

Pending age includes quarantined observations and must not be labeled active queue wait. The checkpoint diagnosis in [quarantine-diagnostics.json](phase9/quarantine-diagnostics.json) reproduces existing strict log decoder errors against a checksummed compressed checkpoint, without relaxing parsing or asserting unsafe tokens. Counts from that one checkpoint are not a full-run inventory. The validated run includes the coverage helper that rejects quarantined observations and durable ingestion failures. Active queue depth, quarantined work and fatal processing state are recorded separately.

Raw observations rotate at 8 MiB with two retained archives; removal/coverage metadata is explicit. Captures are bounded to 64 MiB/2000 records; capture drops are counted. WAL bounds remain 64 MiB/10,000 pending/20,000 completed and checkpointing retains durable ownership semantics. Disk free space, WAL writer failures, pending age and checkpoint counters are recorded. The research CLI has no PostgreSQL pool attached; database fault/latency validation is separate.

The validated run loaded the sealed source snapshot under `mainnet-validated/source-at-start`, including all gap, admission, failure-reporting and status corrections. No hot reload was used. Two earlier interrupted runs are retained: `mainnet-extended` exposed acknowledgement saturation and stalled processing; `mainnet-final` calibrated an overly small 128-item intake buffer. Neither is counted as a successful two-hour run. Their partial snapshots and WALs are evidence of the failed attempts, not complete capture sets; in-memory candidates/captures were not exported at abrupt termination.

Shared-host tests, builds, benchmarks and database probes overlap portions of this observation. Results are observations under that load, not quiet-host SLOs or a comparable throughput improvement over Phase 8. Startup requests, draining and shutdown can make total wall duration exceed the supervisor window. The 7200-second target is satisfied only if the final supervisor evidence actually records that duration.
