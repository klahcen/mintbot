# Phase 12 engineering report

**Phase acceptance: FAIL / BLOCKED. Diagnostic and safety work is delivered; verified end-to-end current-chain paper execution remains unmet.** No wallet signing, transaction submission, funding or spending occurred. Results below are bounded captures on November 14–15, 2026, not a claim about later network state.

The starting evidence is the [Phase 11 report](phase11-engineering-report.md), [immutable source manifest](phase12/source-at-start-sha256.json), source archive, prior failed-monitoring evidence and final inherited-exit wrapper correction. The final delivery verifier checks all 1,818 prior artifacts and original test files against those hashes. Existing Phase 12 work and failed validation attempts were preserved when completing this report; the [completion baseline](phase12/completion-validation/retained-phase12-sha256.json) seals that boundary.

| Required acceptance | Assessment | Evidence |
|---|---|---|
| Regression suite | PASS: 312/312 TypeScript tests; all original 307 retained; 5 separate Python tests | [Fresh tests](phase12/completion-validation/tests.log), [clean build](phase12/completion-validation/clean-build.json) |
| Stable monitoring | PASS only for bounded 300 seconds; 1,800-second extended acceptance UNMET | [Host reliability](host-clock-reliability.md) |
| Current Pump deployment | REJECTED: pin mismatch, unknown Global tail and missing financial/binary link | [Contract review](current-pump-financial-contract.md) |
| Observed PumpSwap variant | REJECTED: signed fee semantics documented; complete orientation/wire/simulation validation absent | [Variant review](pumpswap-variant-validation.md) |
| Raydium/Meteora creation coverage | PARTIAL: one Raydium creation finalized after run; Meteora creation proof UNMET | [Venue audit](raydium-meteora-creation-coverage.md) |
| Provider independence | UNAVAILABLE: no authenticated independent pair; unequal account banks | [Provider/gap report](provider-and-gap-validation.md) |
| Gap recovery | PARTIAL: final run one recovered, three unrecoverable; all four Phase 11 gaps retained unrecoverable | [WAL reconciliation](phase12/final-runtime-reconciliation.json) |
| Current-window policy | BLOCKED: draft, no independent approval | [Proposal](phase12/current-window-policy-proposal.json) |
| Genuine eligible paper entry/exit | UNMET: 0 entries, 0 exits, no P&L claimed | [Execution funnel](current-chain-paper-execution.md) |
| Operations | PASS within tested shared filesystem namespace; distributed ownership unproved | [Operational evidence](operational-ownership-validation.md) |
| Performance/security | Checks pass; zero audit findings at capture; no source-speedup claim | [Validation](performance-and-security.md) |
| Funded deployment | BLOCKED | [Remaining blockers](remaining-funded-trading-blockers.md) |

Host journals correlate earlier wall/monotonic divergence with suspension. A separate 300.000130-second preflight and concurrent 300.000132-second observer support the first bounded mainnet run, whose supervisor measured 300.000538 seconds. It received 29,847 notifications, selected 15 candidates and verified six creations; all were rejected or unavailable. The final delivered zero-identity guard ran for a separate 120.005479 supervisor seconds, receiving 15,484 notifications, selecting five candidates and verifying two creations during the run. Its 120-second preflight and concurrent observer are separate. No durations are combined. Reconnect gaps and incomplete ACK periods mean neither run establishes continuous market coverage.

The principal implementation change refuses research observations with an all-zero transaction signature before ownership/anchor/candidate promotion, while durably recording gaps and original refusal diagnostics. Phase 11's 260 fingerprint refusals include 259 such signatures, with missing predecessor payloads. That explains a concrete collision pattern without establishing provider culpability or finalized transaction identity. The final run refused 58 zero identities and five other fingerprint conflicts. Unknown identities remain an independent coverage blocker even if bounded provider backfill reports recovery.

The delivered host-health gate checks same-boot, fresh, coherent host/container evidence for at least the intended run duration before monitoring starts. The final diagnostic also fixes reading kernel suspend statistics as a directory; earlier artifacts retain the original unavailable result. Finalized protocol reads, signed reserve analysis, bounded venue inspections, post-run creation proof and simulation/worker telemetry extend existing modules without enabling unsupported financial variants.

All final compiled core modules and research entrypoints match the final mainnet and operational-probe snapshots. The earlier 300-second run predates the admission/coverage guard changes and is labeled accordingly; no hot reload is inferred. The final owner probe executes the real container and preserves stop/owner fences. A fresh clean Node 22 install/typecheck/build and audit pass. One retained final-validation attempt failed server startup; the separate completion suite passes without removing tests or rewriting failure evidence.

Reproduce integrity, acceptance accounting and report links using `python3 scripts/phase12-final-validation.py`. The resulting [machine-readable verdict](phase12/validation-summary.json), [runtime coherence](phase12/loaded-runtime-coherence.json), [delivery source hashes](phase12/delivery-source-sha256.json) and [artifact hashes](phase12/delivery-artifact-sha256.json) distinguish source delivery from unmet acceptance. [Evidence guide and commands](phase12/README.md).
