# Phase 9 WebSocket reliability

The Phase 8 receipt outage followed five lifetime reconnects. `SolanaMonitor` never reset that counter on a successful connection. Recorded errors were `Invalid WebSocket frame: invalid status code 1006`. Code 1006 is reserved and cannot appear in a close frame; the validating receiver correctly rejected it. The artifacts cannot identify whether the provider or an intermediary emitted those bytes. Validation remains enabled. See [ws validation source](https://github.com/websockets/ws/blob/master/lib/validation.js) and [Solana subscription contract](https://solana.com/docs/rpc/websocket/logssubscribe).

[MonitorSupervisor](../src/research/monitor-supervisor.ts) wraps the existing monitor, disables its internal retries for each connection, and owns finite recovery. Acknowledgements must arrive within 10 seconds. An open socket or pong is insufficient: notification receipts must be no older than 30 seconds. Thirty seconds of stable receipts resets the incident attempt counter; successful ACKs alone do not. Three successive unsuccessful attempts cause a 30-second provider cooldown and rotation. Whole-run limits remain 512 connections, 512 incidents, and 7200 seconds in the experiment. A terminal budget or lifecycle callback failure closes the socket; stale callbacks are fenced by generation. Original 15-second ping/pong handling and handshake/payload bounds remain in `SolanaMonitor`.

The delivered lifecycle also notifies the controller exactly once on stop, terminates synchronous observer failures, rejects conflicting subscription acknowledgements, and retains bounded redacted provider JSON-RPC reasons and codes. Independent wall and monotonic clocks stop on drift above five seconds before a delayed receipt can become fresh coverage; timing freezes at stop. These later refinements have deterministic regression tests and were not hot-loaded by the captured extended process.

Events retain monotonic incident times, provider host, transport error/close codes, subscription state and socket intervals. The new supervisor is used by the explicit Phase 9 research CLI. A bounded 1024-item/4MiB admission stage runs at most eight jobs and waits for refusal gap metadata to flush as well as successful ownership. Saturation pauses and fences the socket; resume preserves lifetime budgets and the deadline. Intentional pauses do not accumulate as failed network attempts. Fatal processing resolves the bounded run early and is retained in evidence, rather than allowing a receiving socket to hide a stalled pipeline. The ordinary server/legacy monitors retain their existing contracts; they have not been switched to this research lifecycle or claimed to inherit its recovery results. A supervisor is one run and cannot silently restart after stop/exhaustion.

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

Transport-open duration is not acknowledgement-ready duration, receipt continuity or finalized chain coverage. The deterministic tests cover missing ACKs, stale receipts, cooldown/failover, subscription resynchronization, old socket callbacks, stable-budget reset, run deadline and terminal observer failure. See [retained original Phase 9 test log](phase9/new-tests-final.log), [extended evidence](phase9/mainnet-2026-11-13/), and [coverage limits](recovery-coverage.md).
