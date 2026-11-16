# Phase 7 execution database reliability

The execution research ledger remains a separate PostgreSQL subsystem. It cannot sign, submit, fund, or authorize spending. Ingestion WAL completion has no relationship to intent policy approval. This phase validates PostgreSQL 16 on a retained private deployment, process races, an immediate database crash/restart, unavailable database connections, and backup/restore. It does not deploy a production database.

## Changes

`IntentLedger.migrate()` applies the original schema and additive `intent-migration-007.sql` within one synchronous transaction and migration advisory lock. `simulation_schema_migration` stores SHA-256 of each exact SQL source; applied migration edits fail closed. Existing Phase 6 schemas are adopted by idempotently running the original schema once before registering its checksum. New migrations must be new files, not edits to an applied file. Source distributions must include both SQL files beside the compiled module.

New database triggers reject UPDATE/DELETE/TRUNCATE of intent audit history and DELETE/TRUNCATE of intents. An owner identity change must increase its fencing token. The audit writer is a narrowly scoped SECURITY DEFINER trigger function with fixed `pg_catalog, public, pg_temp` search path; runtime needs no INSERT permission on audit rows. A non-owner runtime role is tested without audit mutation, schema migration modification or trigger-disable privileges. Administrators/superusers can still disable triggers or rewrite storage; the audit is append-only within the application privilege boundary, not cryptographically tamper-proof.

Lease renewal now uses the same bounded synchronous transaction wrapper as reservations, ownership and transitions. It requests synchronous commit, two-second lock timeout and five-second statement timeout. A lost COMMIT acknowledgement remains explicitly uncertain; there is no blind new-intent retry.

Unique identity, payload conflict detection, wallet-wide plus strategy reservations, ordered reservation updates, all-or-nothing cancellation and terminal-state checks remain intact. The original Phase 6 tests exercise oversubscription and conflicting duplicates. Phase 7 adds four independent Node processes racing the same reservation and then ownership: exactly one identity and one owner survive.

## Retained deployment and evidence

Run:

```sh
npx tsx --test tests/simulation-persistent.test.ts
```

The test owns only `$HOME/.local/state/mintbot-phase7-postgres`, marked `MINTBOT_PHASE7_PRIVATE_CLUSTER`. It refuses to adopt an unmarked directory. The directory/socket are mode 0700, PostgreSQL listens only on a Unix socket, and the helper never reads `DATABASE_URL`. PostgreSQL is stopped after the test and its data retained for subsequent invocations. The helper requires PostgreSQL 16 binaries under `/usr/lib/postgresql/16/bin` and a non-root OS user. This is a single-node, fsync/full-page-writes/synchronous-commit-on deployment, not HA or a cloud service.

Artifacts: [validation JSON](persistent-database-validation.json), [test transcript](persistent-database-validation.log). The JSON records actual server settings and whether the existing retained deployment was reopened. Test data contains research labels only. The test creates a consistent custom-format `pg_dump`, restores into a different database, compares intent identity/status, all audit rows and all budget rows, records dump digest/size, then removes the copied database and dump. A restore test is evidence that this snapshot is internally consistent; it is not a tested continuous backup service or point-in-time recovery policy.

## Expiry, outage and uncertainty

The immediate PostgreSQL stop occurs after durable ownership/reservation. Connection attempts during the outage fail. Restart retains fence and reservations. Expiration increments the fence, clears ownership, moves the intent to UNCERTAIN and retains all holds. The expired worker cannot renew or mutate; a replacement cannot directly claim uncertain work. Explicit reviewer identity/reason advances the fence for MANUAL_REVIEW, and another explicit decision may cancel the read-only intent and release both reservation scopes exactly once.

There is deliberately no automatic execution takeover after ambiguity. This is the safe takeover policy for a future executor: reconcile first, retain capacity while uncertain, reject old fences, and never infer permission to create a second spending transaction. The offline reconciliation subsystem models hypothetical submission separately; this database contains no SIGNED or SUBMITTED states.

## Deployment role and authentication contract

Use a dedicated database and separate migration-owner and runtime roles. The migration owner creates objects; the application runtime must not own tables/functions or inherit the migration role. Provision runtime with CONNECT, USAGE on the schema, SELECT/INSERT/UPDATE on `simulation_intent` and `simulation_budget`, and SELECT on `simulation_intent_audit`. Do not grant audit INSERT/UPDATE/DELETE/TRUNCATE, schema CREATE, sequence/DDL ownership or migration-table mutation. Revoke public schema CREATE before granting access. Triggers write audit history without granting direct audit writes. Apply migrations using the owner at deployment time; the runtime must not call `migrate()`.

This test uses private same-OS-user Unix-socket trust authentication in a mode-0700 directory and disposable NOLOGIN runtime roles via SET ROLE. It does not claim network authentication, TLS, password/certificate rotation, service identity or denial against a compromised OS user. A production deployment requires authenticated local peer mapping or TLS/SCRAM and secret rotation, bounded pool connection counts, operational monitoring and reviewed runtime privileges. Runtime SQL writes remain a trusted application boundary: these triggers do not independently verify Solana evidence supplied by the application.

## Rollback and restore procedure

1. Stop every research executor and the API bridge. Do not run old code against partially changed schema.
2. Take a consistent custom-format dump using the owner and preserve an off-host verified copy, role definitions and exact source/migration checksums. Inspect pending uncertain holds before maintenance.
3. Apply migrations with the owner in a transaction. A SQL error or checksum mismatch aborts the entire migration transaction and leaves the prior committed schema usable.
4. Prefer rolling forward. To restore an older application version, restore its matching pre-upgrade backup into a separate database, compare intent identities/audit/budgets, and reconcile every post-backup identity before switching. Never silently discard newer reservations or re-create uncertain intents.
5. Do not delete migration rows or edit migration digests to make old code start. A reverse migration that removes Phase 7 audit/fence protections is intentionally not automated. Restoring a pre-upgrade database may lose newer audit/ownership history and requires an explicit reconciled recovery decision.

The fault test validates successful migration idempotence, rejected checksum tampering, and successful logical backup restoration. It does not validate physical corruption, disks lying about fsync, standby failover, cross-region disaster recovery, PITR, backup encryption, production operator access control, or off-host retention. These remain funded-trading blockers.

## Measured local commit acknowledgement

The focused validation passed **14 tests** (six existing intent tests plus eight new persistent-database tests). The final full-suite run also executed fifty synchronous COMMIT acknowledgements from one SQL client while other tests ran. COMMITs following an actual budget UPDATE measured p50 **1.011 ms**, p95 **2.801 ms**, p99 **3.859 ms**, max **4.504 ms** on the retained local PostgreSQL 16 deployment. Raw samples and exact server settings are retained in the validation JSON. These measurements isolate the COMMIT request/acknowledgement; they exclude preceding connection, SQL, lock and application work, and are not directly comparable to Phase 6's full `intent.commit_ms` transaction metric. They do not establish production p99 or explain the unrelated ingestion benchmark regression.
