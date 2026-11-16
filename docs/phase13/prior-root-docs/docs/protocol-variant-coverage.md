# Protocol variant coverage

No new variant is enabled.

| Investigated path | Evidence | Disposition |
|---|---|---|
| Mayhem supply | Four retained Phase8 cases: mint 2e15 atoms versus curve total 1e15; creator/decimals match | Supply-model incompatibility; neither malice nor safety established |
| Non-native quote / depth | Two actual retained non-native quote examples; official quote-chain/depth schema captured | Quote custody, multihop sell route, fee mechanics and both simulation sides unverified |
| Current Global | Finalized 1096-byte capture versus reviewed 1045/1088 | Rejected; no permissive prefix/padding assumption |
| Creator / fee semantics | One original current-creator mismatch; official configurable fee/reward/sweep fields | Identity changes and fee custody remain mandatory checks |
| Unsupported creation instructions | All 18 original verification failures replay exactly from retained finalized transactions | No event-tail truncation or layout guessing |
| New deployment | Full ProgramData and ELF hashes captured | No verified source/build correspondence; blocked |

[Per-case replay and exact official instruction/account/argument schemas](phase10/protocol-variant-review.json), [current Global bytes](phase10/current-pump-global.json), [binary/source provenance](phase10/pump-deployment/evidence.json). All 18 original verification failures have their original signature, slot/time and transaction hash; no historical receipt is made fresh.

Retained narrow PumpSwap, Raydium CPMM and Meteora DLMM implementations remain regression-tested. Pump's reviewed legacy code/fixtures remain available but the current deployment/global are rejected. Independent SDK results match 8 buy/sell instruction vectors and 16 arithmetic vectors from immutable recorded accounts. [Wire vectors](phase10/builder-reference.json), [quote vectors](phase10/quote-reference.json), [pinned reference package locks](phase10/reference-sdk-integrity.json). Reference dependency installation used `--ignore-scripts`; a pure-JS bigint fallback warning belongs to those isolated reference packages, not the production codec.

Required before a new variant: authoritative source/schema tied defensibly to its deployment, finalized creation/state, all token/custody/supply relationships, integer two-sided quotes, independent arithmetic, exact unsigned wire vectors, supported real buy/sell simulations, and risk/failure regressions. No concentration, liquidity, authority, transfer, identity, expiry or sell-route condition was relaxed.
