# Phase 7 security review and independent signer design

Status: internal source/operational review on 2026-11-10; no independent security certification. Live mode remains rejected. There is no Phase 7 private-key, signer transport, broadcasting, funded-wallet integration or automatic spending interface.

## Implemented and observed boundaries

| Area | Control / validation | Remaining boundary |
|---|---|---|
| Transaction policy | Existing v0 wire decoder enforces instruction/meta/program/payer/minOut/spend/fees/rent; real sell packets use that policy | Narrow pinned variants only; source-to-deployed-ELF equivalence unproven |
| Simulation | Zero signatures, `sigVerify:false`, fixed read-only RPC methods, timeout/byte bounds, original errors retained | Public impersonation establishes no payer authorization; simulation state can change |
| Paper entry | Opt-in `SimulationGatedPaper` preserves mandatory risk, requires actual supported buy and sell simulations and consistent effects before calling original review | Existing server remains unchanged; this gate is used by explicit Phase 7 monitor only; no eligible real entry was observed |
| Database ownership | Transactional budgets, unique tuple, process fencing, durable renewal, immutable audit guards, migration checksums, expiry/manual uncertainty | DB writes are a trusted application boundary; database owner/superuser can bypass triggers |
| Database privileges | Tested separate non-owner runtime role without audit/migration/DDL mutation rights; trigger-only audit writes | Test uses SET ROLE and private local socket; not production network identity/TLS/SCRAM |
| Outage / backup | Actual stopped-database connection failure, immediate restart, retained holds/fences; consistent pg_dump restore | No off-host encryption/retention, PITR, corruption or HA failover proof |
| API authorization | Existing bearer-token, origin checks, paper-only mode and emergency controls preserved; full regression/API suite and container smoke retained | No signer API or new execution HTTP endpoint; no cross-service auth deployment was introduced |
| Secret isolation | Mainnet diagnostics use public addresses and accounts only; no `.env` content or private keys copied into artifacts | Existing vault utility is disconnected and not a funded signer isolation solution |
| Logging | RPC errors retain numeric status/code and omit endpoint credentials; captured provenance uses provider host | Public user/provider identity remains intentionally visible in research evidence |
| Resource bounds | Existing WAL bounds, two-worker simulation queue, packet/response caps; monitor 90 seconds / six candidates; sell discovery ≤20 accounts / ≤2 holders | No multi-hour production soak or global multi-instance stop proof |

The durable intent ledger and ingestion WAL remain separate. A completed WAL event cannot supply transaction-policy approval, change intent fences or confer signing authority. Replay-only states named submission/confirmation are isolated from SQL intents and are always labeled `actualBroadcast:false`.

## Dependency review

`dependency-audit.json` is the actual `npm audit --json` result for the existing locked dependency tree: **six findings (three high, three moderate, zero critical)**. The affected paths include SPL-token/bigint-buffer/buffer-layout utilities and web3.js/jayson/stream-json. Inspect each advisory/range in that artifact; findings are dependency paths, not six proven reachable application exploits. The lockfile is unchanged. No automatic downgrade or broad dependency replacement was applied: suggested SPL-token changes are incompatible with the existing token-extension and account parser contracts and require a separately tested migration. These findings remain funded-release blockers.

## Future independent signer contract — design only

A signer must run under a separate service identity and secret boundary. The collector, dashboard, RPC provider and paper engine are untrusted callers of that future service. It must not consume paper balances or trust an ingestion completion, JSON approval flag, replay state, HTTP bearer intended for the dashboard, or caller-decoded account list as authority.

A future authenticated request would bind all of the following, without accepting mutable transaction fragments:

```ts
interface FutureSignerRequest {
  protocolVersion: 1;
  requestId: string;             // unique, replay-protected request
  genesisHash: string;           // explicit network identity
  intentId: string;
  owner: string;
  fence: string;                 // exact increasing database token
  strategyRevision: string;
  walletPublicKey: string;
  unsignedMessageBase64: string;
  messageSha256: string;
  evidenceSha256: string;
  minimumOutputAtoms: string;
  maximumInputAtoms: string;
  maximumNativeFeesAndRent: string;
  approvedDestinations: string[];
  blockhash: string;
  lastValidBlockHeight: number;
  expiresAt: number;
  emergencyStopEpoch: string;
}
```

This is an interface specification, not an implemented endpoint. Future responses must bind the original message/request/intent/fence and an independently generated audit reference; errors cannot authorize replacement spending. Secrets must never be returned or stored in execution logs.

The signer must independently read authoritative durable intent state, current wallet balances, current emergency-stop epoch, pinned programs and policy; decode the actual message; enforce exact destinations/source accounts/caps/freshness; and atomically claim the one authorized message before any signature operation. Authenticated mTLS or workload identity, short-lived audience-bound credentials, request replay prevention and key isolation/KMS policy are prerequisites. Reject changed fences, wrong genesis, stale upgrades, unknown lookup tables, added writable accounts, altered fees/minOut, revoked strategy, insufficient actual inventory and ambiguous prior attempts.

Threats include compromised dashboard/executor, malicious or stale RPC evidence, confused deputy destinations, forged approvals, lease races/ABA, fee-drain retries, program upgrades, key exfiltration, restore rollback and stop propagation failures. A future signature must be journaled with its original blockhash/message before any separately authorized submission. Lost acknowledgements retain reservations; blockhash expiration or a missing RPC status alone never permits a second spending transaction. Funded cancellation semantics require original-signature and actual-balance reconciliation, unlike Phase 7's entirely unsubmitted research intents.

No signer has been implemented or connected. External review, actual independent-provider and sell-variant coverage, dependency migration and an explicitly authorized funded validation remain necessary.
