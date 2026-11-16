# Current-chain paper execution — Phase 12

**Genuine eligible entry/exit acceptance is UNMET. Paper entries: 0. Paper exits: 0. No P&L is claimed.** Existing shared research supervision and `SimulationGatedPaper` remain the decision path; historical diagnostics cannot create fresh entries.

| Separate run | Notifications | Selected | Finalized creations during run | Selected outcome funnel |
|---|---:|---:|---:|---|
| Initial 300-second run | 29,847 | 15 | 6 | 6 market rejected; 8 HTTP 429; 1 RPC/finality unavailable |
| Final guard, 120-second run | 15,484 | 5 | 2 | 2 market rejected; 3 HTTP 429 |

Every selected normalized notification, original receipt time, verification result and available review is retained in [initial outcomes](phase12/candidate-outcomes.json) and [final outcomes](phase12/final-candidate-outcomes.json). The first run's market rejections are five unsupported Pump Global versions and one unknown/stale chain time. The final run's two market rejections are unsupported Pump Global versions. This funnel covers all selected receipts, not every network opportunity; hint sampling, failed lookups and capture limits remain explicit.

The final run selected four Pump receipts and one Raydium receipt. Raydium creation was verified only [after monitoring](phase12/postrun-creation-verification.json), with history origin and entry eligibility false. The final zero-identity guard also rejected 58 observations before selection. Original raw-wire envelope completeness and actual wire-arrival latency are not established by normalized receipt captures.

| Required execution stage | Result |
|---|---|
| Live receipt and finalized creation | Some genuine creations verified; all selected outcomes retained |
| Coverage/provider policy | Blocked: gaps, unverified independence and no external epoch approval |
| Current deployment/account contract | Current Pump rejected; observed PumpSwap orientation unsupported |
| Authorities/extensions/concentration/liquidity | Partial diagnostic account checks; complete eligibility absent |
| Integer buy and full-position sell/wire validation | Supported diagnostic subjects only; no qualifying fresh candidate |
| Unsigned simulation and costs | PumpSwap buy/sell and Raydium sell diagnostics; no fresh candidate reaches eligible commit |
| Strategy limits and persisted entry | No qualifying entry; original limits retained |
| Fresh sell monitoring, exit, terminal P&L | Unmet because no eligible position was opened |

[Current buy simulations](phase12/current-buy-simulations.json) reject Pump's Global version, Raydium reservation capacity and Meteora liquidity/fees; a supported PumpSwap subject reaches unsigned simulation. [Current sell simulations](phase12/current-sell-simulations.json) reconcile PumpSwap and Raydium effects; Pump/Meteora inventory discovery is incomplete. Raydium's 50-atom diagnostic sell returns 678 lamports but costs 6,000: it is not profitability evidence. These public-account impersonation diagnostics use zero signatures and never submit transactions. They neither demonstrate ownership nor create synthetic paper inventory.
