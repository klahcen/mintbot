# Creation detection coverage — Phase 14

[Four-venue finalized fixtures](phase14/creation-fixtures.json) pass strict invocation/instruction/account verification: one each for Pump, PumpSwap, Raydium CPMM and Meteora DLMM. The newly retained Phase13 Raydium `initialize` at slot 469745467 is preserved by SHA-256, redecoded and reverified with a fresh finalized reread. Its original wire identity and quarantine remain attached; offline proof never releases the original quarantine or creates a new receipt.

[Legacy/current rereads](phase14/creation-validation.json) separately verify the Phase12 Raydium fixture. Meteora `initialize_lb_pair` verifies against genuine retained finalized/account evidence, while the current historical RPC reread is unavailable. Newer permissioned/customizable/`initialize_lb_pair2` variants remain unsupported without authentic complete finalized fixtures. No swap, bin-array initialization, liquidity adjustment or unrelated account initialization is counted as a launch.

The funnel stages remain distinct: delivered program notification → creation hint → finalized verified creation → supported current state → positive integer buy/sell quotes → complete mandatory risks and eligible strategy. Fixtures establish only their stated historical verification stage and can never become fresh eligible entries. Notification totals cannot estimate creation coverage.
