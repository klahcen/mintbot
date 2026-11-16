# Phase 15 external gate assessment

**EXTERNALLY BLOCKED. First dependency: two authenticated RPC services with independently reviewed operating attribution have not been supplied.** The current process has none of the five RPC/provider configuration variables, no local `.env`/`.env.local`, and only `strategy.json` under `config`. No unrelated credential stores were searched. Presence alone would not establish approval.

| Required prerequisite | Verdict | Action and evidence needed |
|---|---|---|
| Two authenticated independent services | EXTERNALLY BLOCKED | Operator supplies service IDs, operator/upstream attribution and an independent review record. Distinct public hostnames are insufficient. |
| Secret-managed HTTPS/WSS | EXTERNALLY BLOCKED | Configure SOLANA_RPC_URL, SOLANA_SECONDARY_RPC_URL, SOLANA_WS_URL, SOLANA_SECONDARY_WS_URL and RESEARCH_PROVIDERS_PATH through the operator's secret mechanism. Never put credentials in reports. |
| Required transaction versions | PARTIAL | Locked SDK includes v1; application has no validated v1 provenance/config/account reconstruction chain. Services must document preserved v1 encoding and history support. |
| Logs and history capacity | EXTERNALLY BLOCKED | Supply per-connection subscriptions, notification throughput, RPC request quotas, history retention/lookback, rate-limit and evidence-retention terms. |
| Reviewed epoch and named authority | EXTERNALLY BLOCKED | Existing Phase12 proposal is explicitly unapproved. Supply actual independent procedure, authority and signed review bound to policy/evidence hashes. |
| Runtime, owner, stop, storage | PARTIAL | Existing owner fencing, sticky stop, WAL and database tests are local capabilities; no current operator runtime/storage/clock readiness or exclusive research owner was certified. |

[Presence evidence](phase15/external-gate.json), [offline recheck](phase15/offline-audit/configuration-presence.json), [operator setup contract](external-prerequisites.md). No authorization is inferred from a new run ID. No provider pair, epoch, market lifecycle or timed research run was attempted after this gate stop.
