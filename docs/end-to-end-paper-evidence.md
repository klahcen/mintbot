# End-to-end current-chain paper evidence — Phase 13

**Acceptance FAIL / UNMET: 0 genuine paper entries, 0 exits. No realized paper P&L is inferred from diagnostics.** The existing shared supervisor, market adapter, mandatory risk engine, simulation gate and file-backed paper ledger are retained.

Primary notifications: 275,760; selected receipts: 30; finalized creations during run: 22. Invalid-identity refusals occur before candidate admission and are separately retained. Original live receipt/time, wire links where captured, finalized verification and every selected outcome are in [the complete selected funnel](phase13/candidate-outcomes.json).

| Selected outcome | Count |
|---|---:|
| market-rejected | 22 |
| strict-creation-verification-rejected | 2 |
| quarantined-processing | 6 |

This is complete for selected receipts, not all launches on the network. Sampling limits and capture drops remain in [final evidence](phase13/runtime/mainnet-validated/evidence.json). Market rejection reasons are {'Unsupported Pump global version': 20, 'Market read failed or timed out': 2}; verification reasons are {'Truncated binary layout': 1, 'Pump instruction/event mismatch': 1}. Unresolved or quarantined work never becomes an eligible entry.

The full required path remains original live receipt → finalized identity → current reviewed protocol/account custody → token/extension/holder/liquidity evidence → fresh integer buy/full-position sell quotes → independently validated unsigned instructions → reconciled simulation effects/costs → current provider/coverage/freshness/strategy/stop recheck → durable entry → fresh executable sell monitoring → normal exit and terminal ledger/P&L. Historical post-run proof cannot satisfy the original receipt's freshness or fill a missing stage.

Unsigned [buy diagnostics](phase13/current-buy-simulations.json) and [sell diagnostics](phase13/current-sell-simulations.json) retain actual errors, fees, rent, public inventory and reconciled effects. Supported PumpSwap and Raydium diagnostic subjects are different from unapproved current variants. Public inventory impersonation with `sigVerify:false` is neither user-owned inventory nor a fresh paper entry. Separate buys/sells on different public accounts cannot form a synthetic round trip or establish profitability.

With no qualified position, fresh full-position exit monitoring and terminal paper P&L remain unproved. No strategy limit, concentration requirement, deployment guard, provider rule or coverage policy was bypassed to force a trade.
