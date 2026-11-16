# Phase 9 end-to-end paper results

INTERRUPTED/host-clock discontinuity: final evidence retained; two-hour monitored target unmet. Live signing, broadcasting, funding and submission remain unavailable. The original synthetic replay and ordinary dashboard/API contracts are preserved.

The opt-in Phase 9 CLI uses the existing creation verifier, market service, risk/strategy engine and simulation-gated `RealMarketPaper`. It attempts durable admission for every delivered observation, records refusals and pauses transport on overload, and samples bounded creation candidates, preserves receipt/provider/slot/commitment/provenance, fetches finalized state, and requires original mandatory risk conditions before construction. Both exact unsigned buy/sell simulations and economic checks, independent-provider agreement at the quote bank, fresh receipts and resolved coverage are required before a durable paper entry. Exits continue through existing fresh sell-quote and accounting rules. No test fixture or historical discovered token is inserted into the real experiment as an opportunity.

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

Current/final reasons (a review may have multiple reasons):

| Reason | Count |
|---|---|
| Curve identity, supply or decimals mismatch | 11 |
| Exact liquidity threshold | 4 |
| Liquidity | 4 |
| Unknown or stale chain event time | 5 |
| Unsupported Pump global version | 4 |
| Unsupported completed, configurable or non-native Pump curve | 7 |
| eventIdentity: failed (Launch identity/slot differs from freshness or market evidence) | 3 |
| exitEconomics: failed (Unknown or nonpositive net sell proceeds after network costs) | 2 |
| holderConcentration: failed (Holder balances do not reconcile to mint supply or no circulating supply) | 1 |
| holderConcentration: failed (Largest observed owner exceeds 20% of circulating supply) | 5 |
| priceImpact: failed (Unknown or excessive estimated impact) | 2 |
| sellRoute: failed (Missing, stale or inconsistent route) | 2 |
| simulationGate: Independent provider agreement unknown: Research chain coverage unresolved; Research observations quarantined; processing coverage unknown | 1 |

No eligible current-chain paper entry or exit was demonstrated. There is no realized market P&L claim.

[Extended evidence](phase9/mainnet-2026-11-13/) separates original notifications, verification failures, market decisions and simulation diagnostics. Recorded historical positive buy/sell simulations and deterministic accounting tests remain regression evidence; they do not satisfy a fresh observed launch → real evidence → eligible paper entry → exit. The positive opportunity criterion remains unmet when none qualifies. The two-hour monitored target also remains unmet after the host clock discontinuity.

## Separate current route diagnostics

| Venue | Side | Outcome |
|---|---|---|
| pump | buy | Insufficient reservation capacity |
| pumpswap | buy | Unsigned simulation succeeded |
| raydium-cpmm | buy | Market read failed or timed out |
| meteora-dlmm | buy | Market read failed or timed out |
| pump | sell | Largest inventory has no supported on-curve canonical owned ATA |
| pumpswap | sell | No positive public token inventory |
| raydium-cpmm | sell | Market read failed or timed out |
| meteora-dlmm | sell | No positive public token inventory |

These attempts reread previously identified markets and public account inventory. They do not represent fresh launch candidates, paper trades, signer authorization or submissions. Evidence: [buy attempts](phase9/revalidation-2026-11-13/current-buy-simulations.json), [sell attempts](phase9/revalidation-2026-11-13/current-sell-simulations.json). Historical four-venue buy/sell successes remain separate regression fixtures.
