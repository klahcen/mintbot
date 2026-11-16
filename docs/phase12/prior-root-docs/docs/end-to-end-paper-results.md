# Phase 10 end-to-end paper results

Finalized bounded experiment. No live signature, broadcast or spending occurred. Historical synthetic fixtures and diagnostic public-account impersonation are never inserted as eligible fresh launches.

| Observation | Measured result |
|---|---|
| Run | Finalized bounded experiment |
| Requested monotonic monitoring seconds | 7200 |
| Recorded supervisor seconds | 7,200.000 |
| Process wall seconds | 7,201.782 |
| Transport-open seconds | 7,020.967 |
| Fully acknowledged subscription seconds | 7,004.942 |
| Transport-disconnected seconds | 179.033 |
| Wall/monotonic discrepancy ms | -0.336 |
| Connections / incidents | 111 / 110 |
| Delivered notifications | 898515 |
| Verified creations | 69 |
| Market reviews / parsed states / paired quotes | 69 / 0 / 0 |
| Paper entries / exits | 0 / 0 |
| Admission refusals | 357 |
| Active pending / quarantined | 0 / 79 |
| Oldest active work ms | 0 |
| Oldest pending ms including quarantine | 7194440 |
| Writer / pipeline failure | None / None |
| Two-hour monotonic target met | True |
| Provider-reported continuous coverage established | False |
| Independently operated provider agreement | UNMET |
| Live trading | False |

The existing flow retains live receipt identity/provider/time, strict finalized creation verification, current market accounts, mandatory risk/strategy/capital checks, unsigned two-sided simulation/economic checks, independent agreement and coverage gating, then durable paper entries and fresh-quote exits. A verified creation identity does not establish compatibility of a changed deployed financial contract. Current Pump deployment/global failures prevent eligibility; safety was not relaxed to produce a fill.

| Current recorded review rejection (reason occurrences, not mutually exclusive) | Count |
|---|---|
| Unknown or stale chain event time | 6 |
| Unsupported Pump global version | 63 |

| Separate route diagnostic | Side | Outcome |
|---|---|---|
| pump | buy | Unsupported Pump global version |
| pumpswap | buy | Market read failed or timed out |
| raydium-cpmm | buy | Market read failed or timed out |
| meteora-dlmm | buy | Market read failed or timed out |
| pump | sell | Largest inventory has no supported on-curve canonical owned ATA |
| pumpswap | sell | No positive public token inventory |
| raydium-cpmm | sell | Market read failed or timed out |
| meteora-dlmm | sell | No positive public token inventory |

| Strict finalized creation verification rejection | Count |
|---|---|
| Pump instruction/event mismatch | 22 |
| Truncated binary layout | 14 |

Final per-selected-receipt accounting is retained in [candidate-outcomes.json](phase10/candidate-outcomes.json) after WAL reconciliation. Current finalized accounting: {'market-rejected': 69, 'strict-creation-verification-rejected': 36}. This separates decoder quarantine, strict verification, RPC/finality absence and actual market rejection rather than treating every receipt as a failed trade.

These route diagnostics reread previously identified markets/public inventory. A construction, inventory or account fetch failure is not a failed transaction simulation or an executed trade. [Buy attempts](phase10/current-buy-simulations.json), [sell attempts](phase10/current-sell-simulations.json). Recorded old successful unsigned simulations remain regression fixtures only.

Positive fresh eligible entry/exit and reconciled real-chain paper P&L are not demonstrated when none qualifies. The final ledger retains original timestamps/provenance and exact accounting; no artificial token inventory, historical freshness or positive profit was supplied.
