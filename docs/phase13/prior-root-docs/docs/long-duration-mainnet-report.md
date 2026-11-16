# Phase 9 extended mainnet observation

INTERRUPTED/host-clock discontinuity: final evidence retained; two-hour monitored target unmet. Requested duration is 7200 seconds. Receipt counts represent delivered Pump log notifications, not every network launch. Only bounded sampled CreateV2 candidates enter account/risk evaluation. No other venue is claimed continuously monitored by this run.

| Observation | Measured value |
|---|---|
| Experiment | INTERRUPTED/host-clock discontinuity: final evidence retained; two-hour monitored target unmet |
| Supervisor elapsed seconds | 3,464.806 |
| Process wall seconds | 71,190.455 |
| Transport open seconds | 3,391.464 |
| Transport disconnected seconds | 73.342 |
| Connections / incidents | 52 / 51 |
| Delivered notifications | 421018 |
| Admission refusals/conflicts | 223 |
| Sampled candidates | 52 |
| Verified creations | 34 |
| Durable market reviews / parsed states | 34 / 6 |
| Simulation diagnostic records | 1 |
| Paper entries / exits | 0 / 0 |
| Instrumented RPC calls / errors | 1295 / 140 |
| Observed explicit rate limits (lower bound) | 0 |
| WAL checkpoints | 30 |
| Live trading | False |
| Completed ingestion identities | 421680 |
| Processing fatal state | None |
| Quarantined observations | 40 |
| Oldest pending age ms (includes quarantine) | 70856036 |
| Admission queue peak | 1024 |
| Worker unacknowledged record peak | 17 |
| Intentional transport backpressure pauses | 3 |
| Paired account-state quote reviews (before simulation) | 4 |
| WebSocket handshake 429 incidents (retained events) | 3 |
| Wall minus monotonic duration discrepancy, seconds (unobserved; exact mechanism unknown) | 67,725.649 |

The retained watcher records a wall-clock jump from November 13 to November 14 while only about 50 seconds of monotonic observation elapsed. [The interruption record](phase9/revalidation-2026-11-13/host-clock-discontinuity.json) preserves the evidence. The missing interval is unobserved: it is not counted as transport-open time, provider-disconnected time or chain coverage. Host suspension versus clock adjustment is not established. The delivered supervisor compares independent wall and monotonic clocks and terminates on drift above five seconds, including before delivering a notification; that later fix was not loaded by this experiment.

Confirmed notification heads are recorded in row events and sample WAL anchors. Only verifier transactions and finalized account/RPC reads establish finalized evidence; these are not interchangeable slot observations. Socket-open time includes pre-ACK time and notification pauses, and does not certify finalized coverage. Recovery remains provider-reported and incomplete where anchors, windows or histories are unavailable.

| Slot scope | Recorded range/observation |
|---|---|
| Latest durable completed observation anchor (confirmed feed) | {'pump': {'signature': '4WG2aAL2Tn5QJZcLsRfazZXADshLFqkoiXw6qAYMAqYhTuE9M1o8JQkYJcavLsz8sfoFycAKrxhANxB7JaYwcGup', 'slot': 469346839}} |
| Sampled finalized creation transaction slots | [469016102, 469346671] |
| Sampled finalized market account slots | [469016163, 469346391] |

Slot ranges describe sampled provider-reported reads, not covered intervals or finalized network heads. Slot differences are not converted into elapsed milliseconds.

| Retained sampled verification issue | Count |
|---|---|
| Pump instruction/event mismatch | 15 |
| Truncated binary layout | 3 |

| Resource observation | Value |
|---|---|
| Process CPU user/system microseconds | {'user': 907159501, 'system': 139834262} |
| Sampled peak RSS bytes | 350662656 |
| Sampled peak WAL bytes | 33529110 |
| Minimum sampled disk free bytes | 70262931456 |
| WAL writer failure | None |
| Fsync batches | 194106 |
| Records/group p50/p95/p99 | {'p50': 5, 'p95': 8, 'p99': 9} |
| Event-loop delay captured ms | {'p50': 20.119551, 'p95': 21.725183, 'p99': 27.967487, 'max': 1500.512255} |
| GC captured count/time ms | 6721 / 18900.025591000856 |

Resource snapshots precede final evidence serialization; that export can allocate additional memory. RPC error counters cover instrumented transports. The captured process counter omits WebSocket handshake wording; the separate retained-event handshake count makes those explicit 429 responses visible without rewriting raw telemetry. The delivered CLI recognizes both HTTP and handshake 429 messages. Explicit HTTP429 counts remain a lower bound across captured error paths; retained issue rows are capped at 500.

Selected monotonic histograms, milliseconds:

| Timer | All observations | Retained samples | p50 | p95 | p99 |
|---|---|---|---|---|---|
| store.queue_wait_ms | 88 | 88 | 0.013 | 0.126 | 0.230 |
| research.admission.queue_wait_ms | 421015 | 10000 | 68.714 | 452.457 | 627.924 |
| journal.worker_fsync_ms | 194075 | 10000 | 2.915 | 5.667 | 8.169 |
| ingest.decode.queue_wait_ms | 421720 | 10000 | 0.223 | 0.941 | 1.566 |
| ingest.decode.end_to_end_ms | 421720 | 10000 | 82.782 | 468.236 | 637.874 |
| ingest.enrichment.queue_wait_ms | 421680 | 10000 | 0.015 | 0.052 | 0.444 |
| ingest.strategy.queue_wait_ms | 421680 | 10000 | 0.090 | 0.398 | 0.752 |
| ingest.strategy.processing_ms | 421680 | 10000 | 0.048 | 0.201 | 0.311 |
| ingest.persistence.queue_wait_ms | 421680 | 10000 | 0.015 | 0.055 | 0.232 |
| raw.persistence.queue_wait_ms | 421680 | 10000 | 2.147 | 7.562 | 14.941 |
| research.admission.processing_ms | 421015 | 10000 | 12.254 | 31.794 | 47.724 |
| research.admission.end_to_end_ms | 421015 | 10000 | 86.000 | 468.353 | 636.722 |
| market.transaction_verification_ms | 52 | 52 | 203.926 | 428.170 | 492.430 |
| market.pipeline.queue_wait_ms | 34 | 34 | 0.009 | 0.016 | 0.059 |
| market.receipt_to_evaluation_ms | 34 | 34 | 830.139 | 1,690.843 | 1,754.050 |
| market.accounts.queue_wait_ms | 58 | 58 | 0.268 | 6.004 | 7.278 |
| rpc.market.getLatestBlockhash_ms | 29 | 29 | 94.770 | 136.454 | 145.607 |
| rpc.market.getMultipleAccounts_ms | 116 | 116 | 337.139 | 981.263 | 1,053.427 |
| rpc.market.getRecentPrioritizationFees_ms | 29 | 29 | 305.223 | 734.721 | 826.167 |
| rpc.market.getMinimumBalanceForRentExemption_ms | 29 | 29 | 301.297 | 866.706 | 977.292 |
| rpc.market.getProgramAccounts_ms | 29 | 29 | 78.269 | 376.467 | 416.480 |
| rpc.market.getFeeForMessage_ms | 29 | 29 | 91.283 | 201.299 | 217.350 |
| market.state_retrieval_ms | 29 | 29 | 639.218 | 1,199.523 | 1,212.655 |
| research.receipt_to_paper_decision_ms | 34 | 34 | 1,476.255 | 2,424.420 | 2,444.385 |
| market.quote_computation_ms | 7 | 7 | 0.779 | 0.851 | 0.851 |
| market.risk_evaluation_ms | 6 | 6 | 0.487 | 0.681 | 0.681 |
| market.receipt_to_decision_ms | 7 | 7 | 1,476.546 | 1,800.587 | 1,800.587 |
| risk_evaluation_ms | 4 | 4 | 0.194 | 0.198 | 0.198 |

Histograms are bounded rolling samples (10,000 retained by default), not exact lifetime quantiles once full. Decode end-to-end starts at the existing monitor's normalized-event receipt clock and includes intake, WAL ownership and queue delay for live observations. JSON/message normalization precedes that clock and has separate timers; this is not wire-arrival or chain-occurrence latency. Historical/restart timing has its own origin and cannot measure an earlier process receipt. Quote/risk/simulation timers absent from the table have no measured population; absence does not mean zero latency. Queue age, peak depth, fsync groups, memory/CPU, GC and event-loop observations are in samples and telemetry.

Pending age includes quarantined observations and must not be labeled active queue wait. The checkpoint diagnosis in [quarantine-diagnostics.json](phase9/quarantine-diagnostics.json) reproduces existing strict log decoder errors against a checksummed compressed checkpoint, without relaxing parsing or asserting unsafe tokens. Counts from that one checkpoint are not a full-run inventory. The validated run includes the coverage helper that rejects quarantined observations and durable ingestion failures. Active queue depth, quarantined work and fatal processing state are recorded separately.

Raw observations rotate at 8 MiB with two retained archives; removal/coverage metadata is explicit. Captures are bounded to 64 MiB/2000 records; capture drops are counted. WAL bounds remain 64 MiB/10,000 pending/20,000 completed and checkpointing retains durable ownership semantics. Disk free space, WAL writer failures, pending age and checkpoint counters are recorded. The research CLI has no PostgreSQL pool attached; database fault/latency validation is separate.

The reported run loaded the retained source snapshot under `mainnet-2026-11-13/source-at-start`, including all gap, admission, failure-reporting and status corrections. No hot reload was used. Two earlier interrupted runs are retained: `mainnet-extended` exposed acknowledgement saturation and stalled processing; `mainnet-final` calibrated an overly small 128-item intake buffer. Neither is counted as a successful two-hour run. Their partial snapshots and WALs are evidence of the failed attempts, not complete capture sets; in-memory candidates/captures were not exported at abrupt termination.

Shared-host tests, builds, benchmarks and database probes overlap portions of this observation. Results are observations under that load, not quiet-host SLOs or a comparable throughput improvement over Phase 8. Startup requests, draining and shutdown can make total wall duration exceed the supervisor window. The 7200-second target is satisfied only if the final supervisor evidence actually records that duration.

## Final-source short smoke

A separate 15-second read-only run using the delivered clock guard completed with 2201 notifications, 15.001 monotonic seconds and 15.001 wall seconds, with no fatal ingestion error. It is retained in [the short smoke evidence](phase9/revalidation-2026-11-13/clock-release/mainnet-smoke/evidence.json). This verifies normal callback integration after the fix; it does not satisfy the two-hour target or prove complete chain coverage.
