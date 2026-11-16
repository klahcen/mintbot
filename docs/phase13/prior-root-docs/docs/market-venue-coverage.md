# Market venue coverage

| Venue | Notifications | Creation hints | Selected | Verified creations | Reviews with parsed state |
|---|---|---|---|---|---|
| pump | 20565 | 17 | 5 | 1 | 0 |
| pumpswap | 27088 | 3 | 2 | 1 | 0 |
| raydium-cpmm | 256 | 0 | 0 | 0 | 0 |
| meteora-dlmm | 13727 | 0 | 0 | 0 | 0 |

All four programs share the approved bounded supervisor and the existing finalized verifier, MarketService, integer adapters, simulation gate and durable file-backed paper ledger. Fair sampling has per-venue spacing/caps; notification count is not creation coverage. Hints include newer initializer names so unsupported variants are visible and rejected rather than silently whitelisted. Missing or malformed attribution remains quarantined or strictly rejected. Confirmed receipts never become finalized proof by age or name alone.

| Program | Observed deployment slot | Reviewed pin | Header matches |
|---|---|---|---|
| 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P | 469055660 | 458921440 | False |
| pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA | 458921517 | 458921517 | True |
| CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C | 463522946 | 463522946 | True |
| LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo | 423977638 | 423977638 | True |
| pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ | 456132171 | 456132171 | True |

A genuine current PumpSwap creation was verified and rejected by market parsing. Its 287-byte account exactly matches the official Pool schema, but it has a non-native quote with SOL as base and negative virtual quote reserves; this route is outside reviewed support. [Original launch, finalized transaction and subsequent account inspection](phase11/alternate-candidate-inspections.json) retain the failed case without treating the subsequent read as fresh eligibility. The account-length match alone does not authorize its financial path.

Current inspection of historical addresses parses native-quote PumpSwap and Raydium accounts, fees, vaults and integer buy/sell quotes; selected DLMM inspection rejects for insufficient liquidity or unsupported fees. These are current-state diagnostics with historical subjects, never new launch events. Current captured liquidity/fees/owners/accounts and timings are in [current network evidence](phase11/current-network-final/evidence.json). A successful diagnostic on one pool does not generalize to every pool or initializer.

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

| Official repository | Captured revision | File | SHA-256 or issue |
|---|---|---|---|
| pump-fun/pump-public-docs | 639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22 | idl/pump_amm.json | b7d8c57a4d9c4dd0109a9ab893052352333252d4eedced10ac091d4d66cab89b |
| pump-fun/pump-public-docs | 639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22 | docs/PUMP_SWAP_README.md | 58edc63278cf87ff464f8ff7efd55bed83f55045319e483454abd075c34956fa |
| raydium-io/raydium-cp-swap | 3d69122790e97cd6aff24e8ba95940793773f58c | programs/cp-swap/src/states/pool.rs | e2a836869400bf3cbe3aa52e664235620f82a5c701edd4ced75789f6d7d124ad |
| raydium-io/raydium-cp-swap | 3d69122790e97cd6aff24e8ba95940793773f58c | programs/cp-swap/src/instructions/initialize.rs | 709a9a7ba72a74c9d74f63babced50e060b42adcdc5aff844bf4572933a66608 |
| raydium-io/raydium-cp-swap | 3d69122790e97cd6aff24e8ba95940793773f58c | programs/cp-swap/src/instructions/swap_base_input.rs | 5878ed09654745b5725030c5d84a8794a07088e836330890cbae2b0d7d7b1349 |
| MeteoraAg/dlmm-sdk | 1532e540db41ac405dbf4c5bb2ddfceaa1f98ff1 | idls/dlmm.json | 045c0f4af044be046b6a14b350077e4242e8ac026b64a855803dab30fcdd8b35 |

[Official source bytes and URLs](phase11/official-schemas/evidence.json) are retained alongside existing reviewed schemas. Raydium source remains at its reviewed revision; current DLMM SDK repository revision is `1532e540db41ac405dbf4c5bb2ddfceaa1f98ff1` versus reviewed decoder revision `af36dd53ab180783ccecda306926189a4700953c`. Its selected LbPair/BinArray/Bin schemas and PumpSwap Pool/GlobalConfig compare equal ignoring documentation in [schema comparison](phase11/official-schema-diff.json). Equality of those types does not validate every changed instruction or financial behavior. No changed DLMM instruction/layout is enabled from an SDK revision alone. Exact fixture comparisons are [wire](phase11/builder-reference.json) and [quotes](phase11/quote-reference.json); these do not prove fresh opportunity safety. Receipt-to-decision histograms belong to the live run, while inspection elapsed times are separate.
