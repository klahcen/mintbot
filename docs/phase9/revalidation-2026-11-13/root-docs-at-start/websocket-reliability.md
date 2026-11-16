# Phase 9 WebSocket reliability

The Phase 8 receipt outage followed five lifetime reconnects. `SolanaMonitor` never reset that counter on a successful connection. Recorded errors were `Invalid WebSocket frame: invalid status code 1006`. Code 1006 is reserved and cannot appear in a close frame; the validating receiver correctly rejected it. The artifacts cannot identify whether the provider or an intermediary emitted those bytes. Validation remains enabled. See [ws validation source](https://github.com/websockets/ws/blob/master/lib/validation.js) and [Solana subscription contract](https://solana.com/docs/rpc/websocket/logssubscribe).

[MonitorSupervisor](../src/research/monitor-supervisor.ts) wraps the existing monitor, disables its internal retries for each connection, and owns finite recovery. Acknowledgements must arrive within 10 seconds. An open socket or pong is insufficient: notification receipts must be no older than 30 seconds. Thirty seconds of stable receipts resets the incident attempt counter; successful ACKs alone do not. Three successive unsuccessful attempts cause a 30-second provider cooldown and rotation. Whole-run limits remain 512 connections, 512 incidents, and 7200 seconds in the experiment. A terminal budget or lifecycle callback failure closes the socket; stale callbacks are fenced by generation. Original 15-second ping/pong handling and handshake/payload bounds remain in `SolanaMonitor`.

Events retain monotonic incident times, provider host, transport error/close codes, subscription state and socket intervals. The new supervisor is used by the explicit Phase 9 research CLI. A bounded 1024-item/4MiB admission stage runs at most eight jobs and waits for refusal gap metadata to flush as well as successful ownership. Saturation pauses and fences the socket; resume preserves lifetime budgets and the deadline. Intentional pauses do not accumulate as failed network attempts. Fatal processing resolves the bounded run early and is retained in evidence, rather than allowing a receiving socket to hide a stalled pipeline. The ordinary server/legacy monitors retain their existing contracts; they have not been switched to this research lifecycle or claimed to inherit its recovery results. A supervisor is one run and cannot silently restart after stop/exhaustion.

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

Transport-open duration is not acknowledgement-ready duration, receipt continuity or finalized chain coverage. The deterministic tests cover missing ACKs, stale receipts, cooldown/failover, subscription resynchronization, old socket callbacks, stable-budget reset, run deadline and terminal observer failure. See [new test log](phase9/new-tests-final.log), [extended evidence](phase9/mainnet-validated/), and [coverage limits](recovery-coverage.md).
