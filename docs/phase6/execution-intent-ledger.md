# Transactional simulation-intent ledger

`src/simulation/intent-ledger.ts` and `intent-schema.sql` implement a **separate PostgreSQL database contract**, using the existing `pg` dependency. The ingestion WAL and paper JSON Store are not its ledger or balance source. PostgreSQL 16 was tested with `fsync`, `full_page_writes` and synchronous commits enabled. See the [PostgreSQL locking contract](https://www.postgresql.org/docs/16/explicit-locking.html).

## Identity, capacity and ownership

An intent's unique identity is `(opportunity instruction ID, strategy version, side, position generation, public wallet)`, with a deterministic SHA-256 primary key and a database uniqueness constraint on the full tuple. Payload hashes use canonical JSON. Repeated identical creation returns the existing intent and reserves once; changed payload/reservation conflicts reject.

Reservations use decimal integer atoms, not floats. Both a wallet-wide asset budget and its strategy asset budget must have capacity. Both debit atomically in a fixed lock order. Sells can reserve base-token atoms and a separate SOL fee/rent amount. Capacity cannot be lowered below existing reservations. Budget allocation is explicit; it is not populated from paper balances. The diagnostic CLI uses observed native balance as a conservative cap, and cancels completed read-only diagnostics explicitly. These research reservations do not certify custody, funded authorization, current available balance or account-specific settlement.

Creation serializes on a transaction-scoped advisory lock and locks capacity rows through conditional updates. A single owner claims a database-clock lease and increasing bigint fencing token. Every transition/renewal checks identity, owner, fence, expected state and lease validity. A stale process cannot publish a result after reconciliation changes its fence.

## Reachable states

`RESERVED → BUILT → SIMULATED → POLICY_APPROVED`

Other states are `FAILED`, `CANCELLED`, `UNCERTAIN`, `MANUAL_REVIEW`. **SIGNED/SUBMITTED/LANDED do not exist in this schema.** Skips and unsupported states reject at the API and database trigger. `SIMULATED` requires successful non-submitted simulation evidence. Approval additionally requires matching serialized-policy/message identity, consistent accounting and `liveAuthorized:false`.

An immutable-identity trigger prevents changing the opportunity, wallet, reservation or payload hash. Audit triggers append status, owner, fence, data, database time and transaction ID atomically with each mutation. Reservation release for failure/cancellation is part of the same SQL transaction. Repeated terminal release is rejected. SQL values are parameterized. Statement/lock timeouts and bounded JSON payloads apply. Migrations hold an advisory lock and publish transactionally.

## Crash, uncertainty and manual review

A commit acknowledgment failure is explicitly uncertain; the caller must reconcile the deterministic identity before retrying. No helper retries a reservation blindly. Expired leases, or orphaned unclaimed reservations older than 30 seconds, move to uncertainty with a higher fence and retained reservations. A fresh process cannot steal them or automatically approve them.

Manual resolution requires expected fence, reviewer identity and reason. It can retain `MANUAL_REVIEW`, or explicitly cancel an unsubmitted research intent and release both capacities exactly once. It cannot promote uncertainty to policy approval. This cancellation contract is safe only for this submission-free phase; a future funded schema must reconcile original signatures and actual balances before releasing a potentially submitted reservation.

Tests cover concurrent duplicate reservation, conflicting payloads, cross-strategy wallet capacity, wrong/stale fencing, forbidden signing/skip transitions, terminal release, insufficient-capacity rollback, worker `SIGKILL` after reservation/ownership, uncertainty/manual review, and immediate PostgreSQL restart with preserved rows/audit/capacity. Tests use private temporary clusters; they do not touch the configured application/audit database.

## Operating boundary

Use a dedicated persistent PostgreSQL database, least-privileged runtime role, a separate migration/backup role, verified durable storage and bounded Pool connection settings. The supplied local test helper initializes private Unix sockets and deletes only its own temporary cluster after shutdown. It is a validation helper, not a production deployment.

Retain the SQL migration asset when packaging the source library; no application deployment/build was performed. Runtime role grants, TLS, HA/failover, backups/restores, audit retention, global multi-instance emergency control, actual wallet/account settlement and isolated signer authorization remain operational/funded-trading blockers. Privileged database administrators can bypass application intent APIs; this phase does not claim protection against a compromised database owner.
