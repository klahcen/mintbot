# Phase 11 engineering report

Generated 2026-11-14T22:46:34.285646+00:00. **Working integration changes are delivered; end-to-end current-chain paper trading is not validated. Funded execution remains disabled.**

The final simulation wrapper also propagates the shared decision fence to inherited exits. The primary clock-discontinuity dataset predates that final two-module correction; its snapshots remain immutable. The final [release stop/owner probe](phase11/release-stop-owner-smoke.json) executes the delivered code, with [exact compiled core comparisons](phase11/loaded-runtime-coherence.json) and [earlier-run differences](phase11/primary-runtime-coherence.json). Its roughly ten seconds and the earlier control probe are excluded from the primary duration. No hot reload or final-code full monitoring window is claimed.

The existing research runner now supports all four registered venues with bounded per-venue candidate sampling and gap/recovery requests. A sampling hint never replaces strict finalized transaction verification. The final release probe is a separate ten-second stop/owner check, not an extension of the primary run. Matching uses program plus signature, preventing a multi-venue transaction from being assigned to the wrong selected receipt. Default legacy server selection and Phase10 CLI defaults remain available; the explicit research profile selects the Phase11 entrypoint.

Coverage epochs durably retain historical coverage evidence by hash, separately measure the new window, and remain unauthorized pending independent policy review. Offline quarantine retries require a current WAL/plan-bound, expiring authority artifact and expected event fingerprints. Durable authorization and per-review JSONL audit records precede/follow the WAL mutations. A shared exclusive decision-owner fence refuses automatic stale-container takeover. Authenticated global stop writes a sticky file, fences queued paper commits, and stops the research controller at its next sampling poll.

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

| Venue | Notifications | Creation hints | Selected | Verified creations | Reviews with parsed state |
|---|---|---|---|---|---|
| pump | 20565 | 17 | 5 | 1 | 0 |
| pumpswap | 27088 | 3 | 2 | 1 | 0 |
| raydium-cpmm | 256 | 0 | 0 | 0 | 0 |
| meteora-dlmm | 13727 | 0 | 0 | 0 | 0 |

Validation: **307/307 pass, 0 fail**, including all original 299 tests. New tests cover shared-signature identities, sampling boundaries, retained coverage epochs, operator authority, durable CLI review/replay, queued-commit stop fencing, inherited simulation-wrapper exit fencing, and refusal to steal a foreign owner lock. Node22 clean install/build, authenticated API/dashboard/live-mode rejection, PostgreSQL faults/recovery, current RPC reads, isolated SDK comparisons and disk-backed performance controls are retained under [Phase11 evidence](phase11/README.md). Audit: **0 findings at capture**.

The first full suite had a server-startup timeout during concurrent build work; a subsequent run had `EADDRINUSE`. Both logs remain in `validation` and `final-validation`. The clean Docker attempt first exposed an incorrect diagnostic import; the corrected uncached build and later runtime build passed. The first research bootstrap rejected oversized history before monitoring; it is excluded. No failed result was overwritten as a pass.

Current Pump still has deployment slot 469055660 and ELF SHA-256 `0630a8108569c1c7a5b833c6e11276ebac03c801c495b1685fcfac99bf865cc5`. The 1096-byte Global leaves a nonzero eight-byte tail after the official 1088-byte schema. Pin, schema acceptance and financial assumptions remain unchanged. Current alternate-venue loader pins match; publication of an IDL or matching header is not new source/binary equivalence proof. The primary run terminated on a host clock discontinuity after 584.319388 monotonic seconds across 7854.626 supervisor wall seconds. Its 7270.307-second discrepancy is excluded from monitored coverage; the 1800-second target is unmet. The separate 10-second operational control probe is never added to that window.

Required reports: [Pump](current-pump-compatibility.md), [venues](market-venue-coverage.md), [current paper results](current-chain-paper-validation.md), [coverage/quarantine policy](coverage-and-quarantine-policy.md), [providers](provider-agreement-validation.md), [performance](performance-validation.md), [operations](operational-integration.md), [security/blockers](security-and-release-blockers.md).
