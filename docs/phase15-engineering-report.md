# Phase 15 engineering report

**PARTIAL delivery / EXTERNALLY BLOCKED acceptance.** The first blocking dependency is missing operator-provided authenticated RPC services with independently reviewed attribution. No genuine current-chain paper entry or exit occurred (0/0), so Phase15 is not complete.

| Gate / task | Verdict | Evidence and limit |
|---|---|---|
| 0 — External prerequisites | EXTERNALLY BLOCKED | No RPC/provider environment or local secret configuration; epoch draft unapproved. [Matrix](external-gate-assessment.md). |
| 1 — Versioned transaction support | PARTIAL | Exact recorded -32015 failures audited. SDK 1.99.0 has v1 support, but application proof is incomplete. Existing inspector/native version limits audited; all runtime source preserved. [Validation](versioned-transaction-validation.md). |
| 2 — Per-venue delivery | EXTERNALLY BLOCKED | No authenticated paired controls or completeness interval. Quiet venues remain UNKNOWN. [Delivery](per-venue-delivery-validation.md). |
| 3 — Provider agreement | EXTERNALLY BLOCKED | No attribution review or signed transaction/common-state comparison with legitimate services. [Consistency](independent-provider-consistency.md). |
| 4 — Epoch review | EXTERNALLY BLOCKED | No independent authority/procedure or approval; original WAL histories retained. [Review blocker](reviewed-coverage-epoch.md). |
| 5 — Supported market path | EXTERNALLY BLOCKED | No current fresh market approval; past diagnostics do not prove eligibility. [Lifecycle](supported-market-paper-lifecycle.md). |
| 6 — Paper entry/exit | EXTERNALLY BLOCKED | 0 entries, 0 exits; decisive acceptance unmet. [Lifecycle](supported-market-paper-lifecycle.md). |
| 7 — Operations/validation | PARTIAL | Local validation recorded separately; timed research runs withheld at Gate 0. [Operations](monitoring-and-performance.md), [security](phase15/security-validation.md). |
| Funded/approval boundaries | PASS | No funded keys, signing/broadcasting/spending or self-approval. |
| Historical preservation | FAIL | Legacy validator overwrote two older mutable database summary JSON files. Original hashes retained; matching original bytes unavailable. All other prior artifacts checked separately. |

The safe independent changes add offline, secret-value-free diagnostics, isolated validation and regression controls. All original runtime source is unchanged. No architecture rebuild, alternate provider system or new authorization mechanism was introduced. Local test success cannot promote any external gate. [Reproducible evidence](phase15/README.md), [remaining funded blockers](remaining-funded-trading-blockers.md).

Preservation incident: the reused validator symlinked docs, allowing existing tests to overwrite `docs/phase7/persistent-database-validation.json` and `docs/phase8/database-validation.json`. No byte-exact backups matching their start hashes were found; this failure is not excused by their mutable-summary role. The new Phase15 validator isolates writes and retains fresh database evidence. WAL histories, quarantines, refusals and other prior artifacts remain separately hash-checked. [Preservation record](phase15/preservation-check.json).

Final isolated local validation: **330/330 TypeScript tests** (all original 328 retained), **5/5 Python clock tests**, Node22 clean install, backend/frontend typecheck, production build, PostgreSQL immediate-crash/restart/fencing/reconciliation and **zero npm audit advisories**. These results do not authorize infrastructure, an epoch or a trade. [Machine results](phase15/validation-summary.json).
