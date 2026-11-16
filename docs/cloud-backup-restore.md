# Backup and restore

PostgreSQL is only part of Mintbot state. File snapshots, research WAL/raw evidence, epoch/history records and owner/stop controls must be protected separately. Cloud backups create an encrypted PostgreSQL custom-format dump and a separately encrypted tar archive containing app `data`, read-only `research-data` and `research-control`. They never delete/reset live data. Source historical coverage documentation and private configuration should also be archived through protected off-host source/secret storage.

The operator chooses RPO, retention, disk capacity and off-host location. Defaults are daily at 02:15 UTC and 14 days retention; a backup older than 26 hours warns. Edit the timer for a shorter RPO. Scheduling is not a backup result: check `last-success.json`, `last-failure.json`, systemd failure status and run a restore drill. A running research session makes the backup fail closed; schedule backups between bounded experiments. The app is briefly paused while file volumes are archived; PostgreSQL uses a consistent live `pg_dump`. Large evidence archives can extend the pause. Maintenance operations use a separate exclusive lock. The systemd unit permits up to 30 minutes and uses SIGINT for cancellation so Python can run cleanup. The script unpauses the app in its failure cleanup; after a host crash during the pause, explicitly check `docker ps` and unpause only after reviewing state.

Create an RSA recipient key and public certificate **on a protected offline workstation**, with umask 077:

```bash
umask 077
openssl req -x509 -newkey rsa:3072 -nodes -keyout mintbot-backup-identity.pem \
  -out mintbot-backup-recipient.pem -days 3650 -subj '/CN=Mintbot backup recipient'
```

Keep the private key offline/protected; losing it makes recovery impossible. Transfer only the public certificate to `/etc/mintbot/backup-recipient.pem` on the VPS. Configure its path in `cloud.env`. The script refuses a certificate expiring within one day. Backups use streaming CMS AES-256-GCM authenticated encryption. No unencrypted dump or evidence archive is written to disk. Destination directory is 0700, files 0600; temporary incomplete archives never become successful backup sets. Only timestamped completed backup directories older than the configured positive retention period are pruned. Partial backups are cleaned on normal failure; inspect leftover `.partial-*` after power failure.

```bash
sudo install -d -m 700 /var/backups/mintbot
sudo install -d -m 755 /etc/mintbot
sudo install -m 644 /secure-transfer/mintbot-backup-recipient.pem /etc/mintbot/backup-recipient.pem
cd /opt/mintbot
sudo python3 scripts/cloud/manage.py backup
```

Copy completed encrypted backup directories and their manifests to a separate host/account using SSH/rsync, external disk or a storage service with versioning and independent credentials. Restrict the destination to the backup administrator. Local encryption is implemented; off-host replication and its failure alerts require operator configuration and are not claimed provisioned. A VPS volume snapshot alone shares the VPS failure domain.

For a drill, temporarily install the offline key at a root-readable 0600 location, run the following, then securely remove that temporary copy according to the host storage policy:

```bash
sudo python3 scripts/cloud/manage.py restore-drill \
  --archive /var/backups/mintbot/CHOSEN_COMPLETED_BACKUP \
  --key /secure/mintbot-backup-identity.pem
```

The drill starts a uniquely named PostgreSQL container with network disabled, no exposed ports, dropped capabilities and disposable tmpfs database storage. It streams authenticated decryption into `pg_restore --exit-on-error --no-owner --no-acl`, verifies core tables and reports their row counts, and validates evidence archive readability without extracting it. It always removes the disposable container and its anonymous volumes. It never connects to the active database and never uses retained Phase 7/8 clusters. Counts are a minimal structural check, not a complete application audit; the local integration also verifies a known sentinel survives restore. Restore drills require adequate RAM for the entire disposable database; use a separate recovery host for large datasets.

Disaster recovery is a controlled operator operation on a **fresh isolated stack**:

1. Preserve the failed host/volumes for investigation. Provision a new Ubuntu host and install the reviewed release, private provider configuration and secret files from protected storage.
2. Verify the chosen encrypted set with a disposable drill. Initialize fresh cloud volumes through `install`, then start only PostgreSQL. Keep the app, Caddy and research stopped.
3. Use a new recovery project (`mintbot-cloud-recovery`), never the live project name. Initialize its volumes with `sudo python3 scripts/cloud/manage.py --project mintbot-cloud-recovery install`, then start only its PostgreSQL service. Restore into a new empty database, keeping even the fresh bootstrap database intact:

   ```bash
   set -o pipefail
   recovery_compose() {
     sudo docker compose --project-name mintbot-cloud-recovery --env-file cloud.env -f compose.cloud.yaml "$@"
   }
   recovery_compose up -d --wait postgres
   recovery_compose exec -T postgres createdb -U mintbot_owner mintbot_recovery
   sudo openssl cms -decrypt -binary -inform DER -inkey /secure/identity.pem -in /secure/backup/database.cms | recovery_compose exec -T postgres pg_restore -U mintbot_owner -d mintbot_recovery --exit-on-error --no-owner --no-acl
   recovery_compose exec -T postgres psql -U mintbot_owner -d mintbot_recovery -v ON_ERROR_STOP=1 -c 'SELECT count(*) FROM events; SELECT count(*) FROM orders; SELECT count(*) FROM positions;'
   ```

   If decryption or restore fails, keep the failed isolated database for investigation and repeat into another new database. Never add `--clean` against an active database.
4. Inspect schema, row counts and application invariants. With all app consumers still stopped, rename the fresh bootstrap database and the verified restored database and grant the app its restricted access:

   ```bash
   recovery_compose exec -T postgres psql -U mintbot_owner -d postgres -v ON_ERROR_STOP=1 -c 'ALTER DATABASE mintbot RENAME TO mintbot_bootstrap;'
   recovery_compose exec -T postgres psql -U mintbot_owner -d postgres -v ON_ERROR_STOP=1 -c 'ALTER DATABASE mintbot_recovery RENAME TO mintbot;'
   recovery_compose exec -T postgres psql -U mintbot_owner -d mintbot -v ON_ERROR_STOP=1 -c 'REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT CONNECT ON DATABASE mintbot TO mintbot; GRANT USAGE ON SCHEMA public TO mintbot; GRANT SELECT, INSERT ON events TO mintbot;'
   ```

   The restricted role was created by the new stack's initialization; restored objects are owned by `mintbot_owner`. Restores with no ACL do not preserve grants automatically. No failed production database is renamed or reset by these commands.
5. Decrypt evidence into a protected staging directory, inspect archive paths and permissions, then copy to fresh file volumes while all consumers are stopped. Retain original WAL bytes, original epoch/history references and sticky stop files. Do not activate restored owner locks blindly: review their host/PID/fencing state under the existing owner protocol. Do not clear quarantines, stop controls or coverage failures as part of recovery.
6. Restore the new stack's database name/path configuration deliberately, verify authentication, persistence, blocked research state and HTTPS, then restore dashboard access. Research requires a separate reviewed bounded-session launch, fresh output directory and fresh same-boot clock evidence. Recovery never starts trading.

Full destructive production recovery is intentionally not automated. The executable restore command is exclusively a nondestructive isolated drill. The operator must rehearse complete volume recovery on a fresh host before declaring an organization-specific RTO.
