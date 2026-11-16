# Current-chain paper validation

**End-to-end genuine fresh paper entry and exit remain UNMET.** No old pool, public-account impersonation, SDK vector or unit fixture is counted as a fresh launch or trade.

| Measure | Result |
|---|---|
| Run | TERMINAL: host clock discontinuity; partial evidence retained |
| Monotonic supervisor seconds | 584.319388 |
| Wall supervisor seconds | 7854.626 |
| Open / fully ACKed / disconnected seconds | 573.907 / 566.380 / 10.412 |
| Clock discrepancy ms | 7270306.611633 |
| Connections / incidents | 11 / 10 |
| Notifications | 61636 |
| Selected candidates | 7 |
| Verified creations | 2 |
| Paper reviews | 2 |
| Paper entries / exits | 0 / 0 |
| Active pending / quarantined | 0 / 1 |
| Admission refusals | 260 |
| Writer / pipeline fatal | None / None |
| 1,800-second target met | False |
| Continuous coverage / independent providers / epoch policy | UNMET / UNMET / UNMET |
| Signing / broadcast / spending | False |

| Recorded market review reason occurrences | Count |
|---|---|
| Unsupported Pump global version | 1 |
| Unsupported PumpSwap pool version | 1 |

| Strict creation verification failure | Count |
|---|---|
| Pump instruction/event mismatch | 3 |
| Read-only verification HTTP 429 | 2 |

[Final per-selected-receipt accounting](phase11/candidate-outcomes.json) is generated only after the final WAL is stopped and replayed. Current finalized distribution: {'verification-http-429': 2, 'market-rejected': 2, 'strict-creation-verification-rejected': 3}. This population is distinct from all delivered notifications, refusal records and quarantine ownership.

| Venue | Read-only route | Outcome | Artifact |
|---|---|---|---|
| pump | buy | Unsupported Pump global version | current-buy-simulations.json |
| pumpswap | buy | Actual unsigned simulation succeeded | current-buy-simulations.json |
| raydium-cpmm | buy | Insufficient reservation capacity | current-buy-simulations.json |
| meteora-dlmm | buy | Insufficient liquidity or unsupported fees | current-buy-simulations.json |
| pump | sell | Largest inventory has no supported on-curve canonical owned ATA | current-sell-simulations.json |
| pumpswap | sell | No positive public token inventory | current-sell-simulations.json |
| raydium-cpmm | sell | Actual unsigned simulation succeeded | current-sell-simulations.json |
| meteora-dlmm | sell | Largest inventory has no supported on-curve canonical owned ATA | current-sell-simulations.json |
| raydium-cpmm | buy with observed public inventory owner | Insufficient reservation capacity | raydium-buy-simulation.json |
| raydium-cpmm | buy with observed public creation payer | Insufficient payer balance or invalid owner | raydium-buy-public-creator-simulation.json |

The current pipeline preserves the receipt/program/signature/time, verifies finalized creation and custody, retrieves fresh market/safety/holder data, checks quotes, strategy/capital, current coverage/independent provider agreement, and both unsigned simulations before the existing exact ledger can record an entry. Original exit rules and fresh quote accounting remain; no new claim of independently simulated actual exit execution is made. The primary run ended after clock-discontinuity detection, not after its requested duration. Unknown provider authorization or unreviewed epoch policy cannot be bypassed to manufacture a fill. Current non-Pump simulation success is route evidence only; public inventory is real, never allocated to paper positions.

[Buy diagnostics](phase11/current-buy-simulations.json), [sell diagnostics](phase11/current-sell-simulations.json). Raydium buy diagnostics failed reservation capacity for two real public payers and payer balance/ownership checks for a third; that is not a failed RPC swap or token-risk conclusion. A construction/inventory/liquidity failure is distinguished from a simulation executed with an error. No positive current-chain P&L or validated real entry→exit cycle is claimed.
