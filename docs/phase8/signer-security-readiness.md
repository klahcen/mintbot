# Independent signer security readiness — design review only

No signer, funded-wallet connector, signing RPC, broadcast service or private-key input is implemented in Phase 8. The existing isolated offline replay and the public unsigned simulation transport remain separate from a future execution service. No research, dashboard or database result confers spending authority.

## Threat and custody model

Treat dashboard/API callers, executor processes, public RPC responses, parsed account JSON, paper portfolios and notification/WAL processing as separate trust domains. A compromised executor must not turn a valid paper decision or an ingestion acknowledgement into a signature. Principal threats are changed transaction destinations or minOut, fee-drain retries, stale ownership fences, forged provider independence, program upgrades, malicious account metadata, restore rollback, emergency-stop races, credential theft and unauthorized operator overrides.

Wallet custody belongs to a separate OS/service identity and network segment. That identity must never share the dashboard bearer token, database migration-owner credential, application filesystem or logging channel. A reviewed KMS/HSM or isolated signing process must enforce independently reviewed public-key/derivation/network policy; key generation, import, backup, rotation, recovery and revocation require separate explicit authorization. Nothing in the current local PostgreSQL SCRAM deployment establishes wallet custody isolation.

## Authorization protocol

Retain the typed request bindings from [Phase 7 signer design](../phase7/security-review.md): network genesis, unique request/intent, public wallet, owner/fence, immutable strategy revision, complete message bytes and digest, evidence digest, exact integer input/minOut/destination/cost limits, blockhash validity, expiry and emergency-stop epoch. Phase 8 hashes complete strategy configuration in research authorization rather than relying on a display name. This does not add signing authority.

A future signer must authenticate a dedicated audience-bound service identity (for example, independently provisioned mTLS/workload identity), validate freshness and replay protection, read authoritative current intent ownership and emergency-stop state, and decode the actual message bytes itself. Caller-supplied booleans, decoded metas, provider names, attributed operator labels and approval records are insufficient. Bind the request to exactly one approved original message and wallet. Reject altered writable accounts, source/destination custody, token programs/decimals, instruction discriminators, compute fees, rent, blockhash and unsupported extensions/versions. Unknown or conflicting mandatory evidence fails closed.

A signer must independently enforce exact maximum wallet debit, input quantity, minimum output, fee/rent caps, allowed destination owners and strategy capital limits using actual custody balances. Paper balance and public-account unsigned simulation establish neither available funds nor authorization. The current `ProviderConsistency.eligible` refers only to research comparison scope; health-only agreement, different-bank evidence, spoofable configuration attribution and single-provider failover cannot substitute for transaction authorization.

## Replay, stop and uncertainty

Use a durable unique request/message claim and current fencing token. Atomically record the original packet/signature identity before any separately authorized submission. Bind emergency-stop epoch and revocation checks immediately before signing, and separately at the submission boundary. A stop must prevent new authorized work across all instances; restarting an executor or restoring an old database must not reset consumed requests or replay guards.

A lost acknowledgement remains uncertain. Keep reservations and original identity, query independent authenticated providers and reconcile actual wallet effects. A missing status, expired blockhash, confirmed rollback or provider disagreement cannot automatically create a replacement spending transaction. Manual resolution needs a separately authenticated reviewer, reason, current fence and durable audit. Current research-intent cancellation is safe only because there is no submission path; it cannot be reused for ambiguous funded transactions.

## Audit, deployment and incident response

Record authenticated request/decision IDs, canonical message/evidence digests, policy revision, ownership fence, stop epoch, rejection reason and original signature, with a separate protected audit sink. Never record keys, seeds, wallet recovery material, service tokens or raw credential-bearing endpoints. Restrict runtime roles, use bounded connections/requests, monitor denial/error rates, and reconcile audit exports with transactional state. The present immutable database triggers protect the application privilege boundary; a superuser/OS administrator can still bypass them.

On incident: revoke service identities and signing capability, stop new work, retain uncertain reservations, preserve original evidence/audit/packets, determine whether a signature or submission escaped, reconcile each original identity and perform reviewed credential/key recovery. Restore into a separate environment and compare post-backup identities before resuming. An audit/dashboard declaration must never itself clear the stop or authorize spending.

Before funded release, require independent review of the signer implementation and dependencies, separate administrative custody, production secret distribution/rotation, authenticated operator roles, distributed stop testing, canonical packet persistence, actual settlement and signature reconciliation, disaster-recovery/replay drills and separately authorized controlled funded validation. This document and its interface remain a design, not an installed or audited signer service.
