# Phase 9 end-to-end paper results

RUNNING: final two-hour results are not yet available. Live signing, broadcasting, funding and submission remain unavailable. The original synthetic replay and ordinary dashboard/API contracts are preserved.

The opt-in Phase 9 CLI uses the existing creation verifier, market service, risk/strategy engine and simulation-gated `RealMarketPaper`. It attempts durable admission for every delivered observation, records refusals and pauses transport on overload, and samples bounded creation candidates, preserves receipt/provider/slot/commitment/provenance, fetches finalized state, and requires original mandatory risk conditions before construction. Both exact unsigned buy/sell simulations and economic checks, independent-provider agreement at the quote bank, fresh receipts and resolved coverage are required before a durable paper entry. Exits continue through existing fresh sell-quote and accounting rules. No test fixture or historical discovered token is inserted into the real experiment as an opportunity.

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

Current/final reasons (a review may have multiple reasons):

| Reason | Count |
|---|---|
| Curve identity, supply or decimals mismatch | 1 |
| Unknown or stale launch slot | 1 |
| Unsupported completed, configurable or non-native Pump curve | 2 |

No eligible current-chain paper entry or exit was demonstrated. There is no realized market P&L claim.

[Extended evidence](phase9/mainnet-validated/) separates original notifications, verification failures, market decisions and simulation diagnostics. Recorded historical positive buy/sell simulations and deterministic accounting tests remain regression evidence; they do not satisfy a fresh observed launch → real evidence → eligible paper entry → exit. The positive opportunity criterion remains unmet when none qualifies.
