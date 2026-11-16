# Phase 8 engineering report

Prepared 2026-11-11; the main long-run artifacts retain their recorded 2026-11-10 UTC timestamps, while final short checks retain their own timestamps. **266 tests pass**, preserving all 241 originals; backend/frontend typecheck, production build and isolated current-artifact container smoke pass. Actual mainnet monitoring ran for a configured 15 minutes, with separate authenticated database fault/heartbeat and provider diagnostics. **No transaction was signed, broadcast or funded; live mode remains disabled.**

Production readiness remains **blocked**. No qualifying current-chain paper entry or exit was demonstrated; three high dependency findings remain, provider infrastructure agreement remains unknown and multi-hour/HA/distributed recovery validation remains incomplete. No benchmark rate difference is claimed as an optimization.

## Audit and source changes

Phase 7 supplied four pinned unsigned builders and actual buy/sell captures, serialized policy, paper risk gates, separate fenced SQL intents and241 tests. Gaps included short monitoring, no eligible paper entry, partial dependency/provider/operational validation and a dashboard without research evidence. The initial producer also inferred market verification from a callback and mislabeled confirmed notification head as finalized; those metadata errors are corrected without changing risk or raw decisions.

The existing ingestion/WAL/Store/engine/model modules, strategy configuration, original tests, dashboards outside the Research tab and startup live-mode rejection are preserved. Narrow changes add numeric sanitized market RPC diagnostics, a configured provider guard/strategy digest/bounded paper diagnostics, the read-only research endpoint and frontend view, dependency override and separate tools/tests. Previous source/evidence is archived and hashed. Legacy test outputs that refresh Phase 7 are retained under Phase 8 and original bytes restored.

## Measured mainnet outcome

| Observation | Actual value |
|---|---:|
| Configured observation window |900 seconds |
| Notifications |57,518 |
| Sampled candidates |18 |
| Verified creations |8 |
| Paper decision callbacks |8 |
| Parsed market reviews |0 |
| Candidate buy/sell simulation attempts |0 |
| Paper trades |0 |

**The WebSocket exhausted its reconnect budget at 408.9 seconds, followed by 492.8 seconds without further receipts. The15-minute process was not15 minutes of connected coverage; no gap recovery was performed. Extended continuous-feed validation failed.** Final source marks exhaustion failed and stops new paper work, with deterministic tests; this guard was added after the long run.

The monitor samples candidates across the window; this is not complete feed coverage. Rejections and unsupported/unknown evidence remain explicit. Local receipt→paper-decision timing includes rejected candidates; chain time and RPC latency are separate. Full p50/p95/p99, CPU/memory/event-loop/queue/WAL, error categories, scope and current-source limits are in [mainnet monitoring](phase8/mainnet-monitoring-report.md). [End-to-end validation](phase8/end-to-end-paper-validation.md) explicitly records the missing positive entry/exit trace.

Fresh position quotes are polled through the existing paper exit rules; no position existed to validate an actual exit. Four historical actual buy/sell protocol captures continue to pass serialization/economic regression checks; they are not fresh market opportunities. No artificial balances, risk assertions, paper fills or relaxed mandatory rules were added.

## Security, providers and database

The narrowly assessed Jayson browser-client override removes the three moderate findings; web3/SPL versions remain. The remaining **three high paths** represent one unpatched bigint-buffer native advisory and block funded release. Actual localHTTP compatibility, Token2022/account/decoder/transaction and regression tests pass. [Dependency remediation](phase8/dependency-remediation.md) documents the deliberate major override's limited browser API compatibility and unresolved release impact; no incompatible SPL downgrade or hidden ignore was used.

Two public RPC endpoints returned correct mainnet genesis and nearby finalized slots, but different account banks and insufficient attribution of independent infrastructure. The result is **unknown / ineligible**, not independent agreement. The new bounded comparison/fallback/quarantine/manual-resolution layer never makes a failed or unknown comparison authorization. Process-local quarantine history and authenticated multi-instance coordination remain limits. Actual status agreement is not claimed from mocked tests. See [provider validation](phase8/multi-provider-validation.md).

A retained private PostgreSQL16 deployment now uses peer administration and separate SCRAM migration/runtime logins, bounded pools1/2/1, restricted grants, durability, actual secret rotation/old-secret rejection, fenced immediate-crash recovery, duplicate prevention and exact backup restore. Five-minute SELECT heartbeat: **62 successes / 0 failures**, p50/p95/p99 **1.935/2.178/3.173 ms**. These are same-host health queries, not transaction/HA latency. [Database readiness](phase8/production-database-readiness.md) distinguishes tested local behavior from proposed backup/retention/alert automation and unimplemented production service isolation.

[Signer readiness](phase8/signer-security-readiness.md) reviews custody, authorization, exact message/spending, replay/stop, audit and incidents as **design only**. No signer or funded interface was implemented.

## Dashboard and performance

The existing dashboard gains an authenticated, read-only Research tab: observed identities, verification/market status, rejections, simulations, separate research paper P&L, provider/WAL/backfill, explicitly sourced research intent rows, latency and readiness. Missing/stale evidence remains explicit. The bounded local projection strips unrecognized fields and endpoint credentials; no HTTP path selects files or enables live controls. Tests cover authorization/origin/no-store/GET-only, bounds, SSR escaping and mode separation. Container smoke confirms the built research API and disabled live mode. Browser screenshot/interactive validation is unverified. See [dashboard details](phase8/dashboard-research.md).

Eighteen randomized A/A jobs use identical ingestion/WAL implementation hashes and current shared dependencies, with separate six-job scheduler/JSON/V8 profiling. Observed medians vary despite identical source; no speedup is claimed. Per-thread runqueue/runtime, worker fsync/ack, JSON/GC and event-loop costs are separated with observer limits. Historical regressions remain incompletely attributed. [Performance investigation](phase8/performance-investigation.md) retains all measurements, drafts, source/profile provenance and remaining remedies.

## Release evidence and remaining work

Full suite: **266/266 pass**, no failed/skipped, 23.216s. Original241 tests remain, prior reports preserved. Typecheck/build/container smoke and PostgreSQL fault tests pass. Container validation uses current artifacts in existing Node22 with networkdisabled/read-only mounts/private state; it is not a full production image/Compose/storage rollout. Security audit still fails on the three high findings.

All requested report categories and reproduction commands are linked from [Phase 8 index](phase8/README.md). [Remaining funded blockers](phase8/remaining-funded-trading-blockers.md) identify positive real entry/exit, high-advisory remediation, independent providers, multi-hour operational coverage, production DB/auth/backup/alerts/HA, distributed stop and independently authorized signer/settlement. These incomplete requirements prevent a funded-release proposal.
