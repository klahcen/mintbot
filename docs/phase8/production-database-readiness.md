# Phase 8 production database readiness

Phase 8 validates a **retained single-node PostgreSQL 16 research deployment**, separate from the ingestion WAL, Phase 7 cluster and dashboard. It improves local authentication and operational evidence; it is not high availability or a funded executor deployment.

## Tested deployment

`scripts/phase8-authenticated-postgres.ts` exclusively owns `$HOME/.local/state/mintbot-phase8-postgres`, guarded by `MINTBOT_PHASE8_PRIVATE_CLUSTER`. It refuses to adopt unmarked directories, never reads `DATABASE_URL`, and retains data after stopping PostgreSQL. Root/socket directories are private mode 0700; local credentials and backup files are mode 0600. PostgreSQL listens on a Unix socket only, with TCP disabled. Local OS administration uses peer authentication. Separate `mintbot_migration8` and `mintbot_runtime8` LOGIN roles authenticate with **SCRAM-SHA-256**, confirmed by verifier type, successful connections, wrong/old-secret rejection and actual rotation.

The migration role owns schema objects. Runtime is neither superuser, role creator, database creator, replication role nor object owner. It receives schema USAGE; SELECT/INSERT/UPDATE on intent/budget tables; and SELECT on audit history. It cannot create schema objects, update migration checksums, delete audit rows or disable triggers. The owner performs migration before runtime grants; runtime never invokes `migrate()`. Audit writes occur through the existing narrowly scoped SECURITY DEFINER trigger, preserving Phase 7 protections. Runtime SQL remains a trusted application boundary: privileged runtime budget updates are research accounting, not an independent spending-policy enforcement system.

Pools have maxima **1 migration, 2 runtime, 1 administration**, two-second connection/lock timeout, five-second statement timeout, and five-second idle timeout. PostgreSQL max_connections is 20. Durability settings remain fsync/full_page_writes/synchronous_commit **on**. All connection strings/secrets remain outside repository artifacts. This local helper runs both application roles under one administrative OS account; production must isolate the application from owner credentials and the cluster directory with separate service identities and secret distribution.

## Actual fault and operational checks

```sh
npx tsx --test tests/phase8-database.test.ts
```

[Raw evidence](database-validation.json), [focused transcript](provider-database-tests.log). Four database subtests plus their parent test pass. The test reopens the retained cluster and:

- Connects using runtime SCRAM, rejects privileged DDL/audit mutations, and proves concurrent duplicate reservations preserve one identity and one reservation audit row.
- Rotates the runtime secret and rejects the previous secret while the replacement connects.
- Immediately stops/restarts PostgreSQL, verifies the original identity/fence remains durable, expires the owner to UNCERTAIN, retains reservations, rejects old ownership, then requires explicit manual review/cancellation before releasing capacity.
- Creates a real custom-format `pg_dump`, restores to a separate database, and compares audit rows, identity state and all budgets exactly. The restore database and dump are removed after comparison; the retained original data remains. Digest and byte size are recorded in JSON.

Ten actual authenticated `SELECT` health round trips record server settings, database bytes and latency. These are small-sample same-host responsiveness observations, not a production SLO or steady-state transaction p99. Re-running the full suite updates the Phase 8 evidence with the latest actual retained-cluster run.

## Five-minute authenticated heartbeat

```sh
npx tsx scripts/phase8-database-soak.ts --run --seconds 300
```

[Separate soak evidence](database-soak.json), [heartbeat transcript](database-soak.log). The actual run lasted **300,002.120 ms**, with **62 successful SELECT health samples, zero failed samples and zero emitted threshold alerts**. Heartbeat round-trip latency measured p50 **1.935 ms**, p95 **2.178 ms**, p99 **3.173 ms**, max **7.461 ms**. Sampling targeted five-second intervals; timer scheduling produced two closely spaced terminal samples, all retained in the real sample population. The database remained **7,994,391 bytes**; the observed runtime pool used one idle connection, zero waiting clients, with configured maximum two. Durability settings stayed on and local SCRAM identity was checked every sample. No outages were injected during this run, and no intent mutations were performed by the heartbeat runtime.

The heartbeat process used **879,461 user / 241,730 system CPU microseconds**; these values exclude PostgreSQL and other concurrent processes. Event-loop delay p99 was **20.726 ms** at a **20-ms histogram resolution**, which includes that timer resolution. This was a five-minute responsiveness sample alongside other host work, not a multi-hour soak, saturation benchmark, high-availability exercise or proof of production alert delivery. The script accepts bounded runs from five to 3,600 seconds and always stops its owned cluster at completion.

`scripts/phase8-database-snapshot.ts --run` separately reopens the retained deployment, reads only the last 20 intent IDs/statuses/update timestamps through the restricted runtime role, then stops it. [Actual research records](database-intents-snapshot.json) are explicitly attributed to **Phase 8 fault tests, not live candidate intents**. No payloads, wallet secrets or credentials are exported. This snapshot supports research-only visibility; it is not evidence that a mainnet opportunity reached the intent ledger.

## Operator runbook and remaining deployment work

**Backups.** Before migrations, drain research workers, retain uncertain holds, and take a custom-format backup with exact application/migration checksums. Restore into a separate database; compare identities, budgets, audit and migration checksums before switching. Reconcile every post-snapshot identity; never silently replay unknown intents. This phase tests local logical snapshot restoration only. Off-host encrypted backups, scheduled backup freshness, recovery-point/recovery-time targets, continuous WAL archiving/PITR and restore drills remain required.

**Retention.** Runtime cannot delete or truncate audit/intent history. Do not prune research history through application credentials. Archive reviewed ranges with row counts, identity coverage, checksums and verified restore before any owner-controlled retention migration. Operational policy proposal: daily encrypted backups, 30-day daily/12-month monthly retention, immutable audit export and monthly restore drill. This is a proposed policy, **not an installed job**. Disk exhaustion should stop new research intents; deleting uncertain records to free space is forbidden.

**Rotation.** Drain runtime pools, rotate only the runtime LOGIN secret using administration, atomically replace the protected secret file, recreate bounded runtime pools, then verify new authentication and old-secret rejection. This sequence was exercised. A crash between server password change and secret-file rename requires peer-admin recovery; automated transactional rotation across database and filesystem is not claimed. Production secret-manager versioning, dual-credential rollout, migration-owner rotation and access logging remain required. Do not put credentials in CLI arguments, dashboard state, telemetry or source artifacts.

**Monitoring/alerts.** The helper exposes `health()` with actual role/settings/database size/round-trip samples. A deployed collector must alert on unavailable DB, oldest UNCERTAIN intent, expired lease, pool waiting queue, connection saturation, lock waits/deadlocks, transaction failure/latency, disk free space, retained audit growth, backup age and last successful restore. Suggested initial operational thresholds: any uncertain intent; oldest overdue lease >60s; pool wait >2s; disk free <20%; backup age >24h. These thresholds require production load calibration. No external alert receiver or 24/7 on-call coverage was configured.

**Incident recovery.** Stop research processing, preserve database/audit/notification evidence, establish whether a COMMIT acknowledgement was lost, reconcile by stable intent identity, and retain capacity while ambiguous. Restart does not grant a new owner permission to proceed; use fenced manual resolution. Restore only after reconciling post-backup work. No signing/submission path exists in this deployment.

Funded release remains blocked on separate OS/service identities, protected owner credentials, independently administered production secrets, operational backup/restore/retention automation, monitoring delivery/on-call ownership, physical failure-domain/HA decisions, disaster recovery and a separately authorized signer contract. Local synchronous crash recovery proves neither HA nor disk-loss recovery.
