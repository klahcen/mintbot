# Phase 9 protocol review

No new trading variant is enabled. All four current finalized loader deployment headers matched the retained program-data address and deployment-slot pins; this proves a header match, not a source-to-ELF audit. [protocol-review.json](phase9/protocol-review.json) records the evidence and exact current source commits, files, URLs and hashes under `protocol-sources`.

| Venue | Retained bounded support | New variants and release disposition |
|---|---|---|
| Pump.fun | Reviewed 166-byte native-SOL curve, exact mint/PDA/custody/supply checks; pinned legacy trade instruction layouts | Observed Mayhem inflated supply, non-native quote coins, depth, editable creator fee, cashback/holder rewards and new instructions are not newly enabled |
| PumpSwap | Reviewed native-SOL orientation, bounded enabled mode, exact state/fee/vault checks | New quote orientations, mode flags and smaller instruction families require complete evidence |
| Raydium CPMM | Reviewed exact account/version/fee flags, native-SOL orientation, exact integer curve math | Unknown account/fee flags and other pool families remain rejected |
| Meteora DLMM | Reviewed version-1 pair, bounded active bins, supported fee/token flags and exact bin math | Unknown pair/bin versions, activation/limit-order/fee modes and unverified transfer extensions remain rejected |

Preserved real finalized creation/state fixtures remain in Phase 3–5; original unsigned buy fixtures in Phase 6 and sell fixtures in Phase 7 remain regression inputs. Phase 9 reran all recorded adapter, Token-2022, quote and simulation tests after the codec migration. The pinned independent SDK comparison matched eight buy/sell instruction layouts and 16 Raydium/DLMM quote vectors; see [builder-reference.json](phase9/builder-reference.json), [quote-reference.json](phase9/quote-reference.json) and the full test log. These offline comparisons include UNIT execution-account stubs and are not new mainnet simulations or eligible launch evidence.

The source review retained Pump docs/IDL commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`, Raydium CP swap commit `3d69122790e97cd6aff24e8ba95940793773f58c`, and Meteora SDK commit `1532e540db41ac405dbf4c5bb2ddfceaa1f98ff1`. New support still requires a pinned source/program relationship, real finalized creation and state, exact buy/sell quotes, wire checks, actual unsigned simulation and regression fixtures. No unsupported path is labeled verified because it deserializes.
