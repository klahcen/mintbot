# Phase 19 — Production-ready cloud deployment preparation

Date: 2026-11-15 (Africa/Casablanca). Status: **PREPARED / LOCALLY VALIDATED — NOT DEPLOYED**. Public DNS, public ACME issuance, a VPS and off-host storage are not available in this workspace. No remote command was sent, no research session launched, and no funded credential was installed. Genuine current-chain paper entries/exits remain **0 / 0**; no profit or market-readiness claim follows from infrastructure tests.

## Executive summary and architecture

The separate cloud stack continuously hosts the authenticated paper dashboard/API and PostgreSQL. Optional Caddy publishes TCP 80/443 with automatic TLS; the API has no public port and PostgreSQL is on an internal network without host ports. Without DNS, a separate overlay binds the API to loopback for an authenticated SSH tunnel. Optional research remains a bounded job with `restart: no`, a profile and the original Phase 11 entrypoint. No timer or startup/update command runs that job.

Six named volumes retain database, paper state, research state, research controls and Caddy certificate/configuration state across container recreation. The root host installer initializes ownership only for newly created volumes. Existing volumes fail closed on incompatible ownership. Source and private configuration have separate retention requirements.

The audit reviewed local/research/clock Compose files, Dockerfile/context rules, environment templates, server authentication/health/persistence, database schema, research owner/stop/clock/coverage/status controls, Phase 17/18 reports and the isolated regression runner. Redis is an unused optional future queue and is omitted from cloud deployment. Original research execution safeguards and retained historical evidence remain unchanged.

## Created and modified files

Created:

- `compose.cloud.yaml`, `compose.cloud.tunnel.yaml`.
- `deploy/cloud/Caddyfile`, `cloud.env.example`, `runtime.example.json`, `20-runtime-role.sh`.
- `deploy/cloud/mintbot-backup.service`, `mintbot-backup.timer`, `mintbot-monitor.service`, `mintbot-monitor.timer`, `mintbot-rpc.service`, `mintbot-rpc.timer`.
- `scripts/cloud-runtime.ts`, `scripts/cloud-health.ts`, `scripts/cloud/manage.py`, `scripts/cloud/validate-local.py`, `scripts/phase19-validation.py`.
- `tests/phase19-cloud.test.ts`, `tests/test_phase19_cloud.py`.
- `docs/cloud-deployment.md`, `docs/cloud-security.md`, `docs/cloud-backup-restore.md`, `docs/cloud-operations.md`, this report and new `docs/phase19/` evidence.

Modified:

- `src/server.ts`: authenticated database-aware readiness, bounded database connection/query deadlines, sanitized idle-pool disconnect handling, cloud-only fixed request errors and disabled request URL logging. Local runtime behavior remains unchanged unless the new cloud wrapper sets its explicit cloud flag.
- `.dockerignore`, `.gitignore`: exclude environment backups, secret/certificate/key/dump/archive files and cloud settings. Documentation is excluded from Docker context.
- `.env.example`, `README.md`: link the separate deployment procedure without changing local settings.
- Existing `.env` and `.env.save`: permissions restricted to 0600, content not edited. Existing secrets were not rotated.

`compose.yaml`, `compose.research.yaml`, `compose.clock-validated.yaml`, Dockerfile, dependency manifests, existing tests, strategy/protocol configuration and existing historical research evidence were not edited. No command targeted the retained Phase 7/8 database homes or the existing application Compose project. This directory has no `.git`, so Git tracking/history preservation cannot be independently certified here.

## Security controls

The app, research and proxy run as UID 1000; PostgreSQL runs as its nonroot image user. Containers have read-only roots, dropped capabilities, no-new-privileges, bounded tmpfs, process/resource limits and rotating Docker logs. There is no privileged mode, Docker socket, host network or public database port. The app's fresh database role has only SELECT/INSERT on the event audit table, with separate bootstrap-owner credentials.

Runtime secrets are read from mode-0600 bind-mounted files, never Compose interpolation. Validation checks shape, required presence, secure transports, permissions and matching database files without printing values. RPC/provider files remain private. The runtime allowlist refuses signer inputs and weak/placeholder credentials. The production image excludes `.env`, `.env.save` and `private/`. Manual rotation procedures are documented; no existing credential was rotated.

The existing wallet module contains library-only encryption/construction/signing helpers. Those pre-existing helpers were not removed or changed. **No runtime wallet signer is configured or enabled, no funded key is loaded, and no live submission path is authorized by this work.** The cloud loader refuses wallet/private-key fields, forces `MODE=paper` and `REAL_MARKET_PAPER=false`, and disables legacy market ingestion. A literal claim that the entire repository contains no signing primitive would be inaccurate.

## HTTPS and networking

Caddy configuration bounds bodies/headers/timeouts, keeps API bearer authentication and Host/origin controls, supplies security headers, persists certificate state and explicitly redirects to public HTTPS port 443 despite internal unprivileged listeners. Only the proxy has public bindings. The tunnel alternative publishes API loopback only; the startup script refuses tunnel access while an existing public proxy is running.

Local integration uses a temporary internal CA and random loopback ports. It validates an HTTP 308 redirect to public HTTPS semantics, trusted test TLS and HTTP 401 through the proxy for unauthenticated API access. This does **not** validate a public domain or real ACME issuance/renewal. The VPS runbook requires those external checks before claiming deployment.

## Persistence, backups and restoration

Backups produce separate streaming CMS AES-256-GCM encrypted PostgreSQL and evidence archives with restrictive permissions. PostgreSQL is dumped consistently; the app is quiesced during file archiving and running research makes backup fail closed. Retention is configurable; successful backups publish success metadata atomically, and failure/staleness is monitored. No plaintext dump/archive is written by backup/drill commands. Public recipient certificates live on the VPS; decryption keys remain protected/offline except during an authorized drill.

The disposable integration inserts one synthetic audit sentinel, recreates app/PostgreSQL containers, checks file/database preservation and verifies an isolated restore reports core row counts **[1, 0, 0, 0]**. Authenticated encryption corruption must fail verification. The drill uses a separate network-disabled tmpfs database and reads the evidence archive without extracting it over live files. Production disaster recovery remains an explicit fresh-host procedure; off-host replication and organization-specific RPO/RTO require operator setup.

## Monitoring and research controls

Authenticated readiness checks the database; public `/health` remains liveness. Host monitoring observes Docker health, CPU/memory/load/disk, backup age/failures, sticky stop, research age/status, WAL and coverage readiness. The optional timer invokes only the existing finite read-only Phase 18 RPC diagnostic and tracks HTTP/WSS availability, quiet/unknown per-venue delivery and provider agreement. No new public RPC observation was performed in Phase 19. Missing/stale evidence and missing coverage approval remain warnings even with a healthy server.

The original owner/fencing locks, sticky stop, finalized-data/provider-consistency requirements, coverage epoch restrictions, protocol/deployment checks and journal quarantine/history remain. Cloud research additionally requires the original same-boot host-clock evidence. The existing store loader pauses a running synthetic paper ledger on restart while preserving its positions/history; it never resumes research. Stop writes the existing durable stop intent and stops research without clearing evidence. No auto-recovery clears safety failures. Unexpected termination and fatal/quarantined/blocked research produce alerts. Free alert-delivery choices are documented but no external notification service was configured or contacted.

## Automated validation

Final validation passed **367/367 TypeScript tests**, **11/11 Python tests** (five existing clock tests and six cloud monitoring tests), backend/frontend typechecks, production builds, dependency audit (zero advisories), 18 disposable cloud integration checks and 10 cloud isolation checks. The isolated full-run Python snapshot had 10 tests; the additional missing-approval regression and all clock tests passed together in the [final Python run](phase19/python-unit-tests.log).

Authoritative results and command exit codes are linked below. Earlier development attempts remain in separate regression directories and the initial restore-failure artifact; they are not presented as final passing results.

- [Compose/prerequisite checks](phase19/configuration-checks.json): local, local+research, cloud+profiles and cloud+tunnel syntax checks pass without displaying resolved secrets.
- [Disposable integration](phase19/cloud-integration.json): final results recorded by `scripts/cloud/validate-local.py`.
- [Regression release checks](phase19/validation/clean-validation.json), [test log](phase19/validation/clean-tests.log): final results recorded by the isolated Node 22 runner.
- [Actual container controls](phase19/container-hardening.json), [secret scan](phase19/secret-redaction-check.json), [source hashes](phase19/tested-source-sha256.json).

Validation found and corrected a PostgreSQL typing error, Compose NDJSON compatibility, idle-client database disconnect handling, public redirect-port mapping and a restore startup race. The disposable restore now waits for TCP readiness, which occurs after the official image's temporary initialization server exits. Database recovery checks poll authenticated readiness and allow Docker's periodic health state to catch up. These corrections did not modify retained production or regression databases.

## Remaining blockers and operator commands

The following remain external: VPS access/provisioning, SSH/firewall review, domain/DNS and public certificates, protected off-host backups and alert delivery, chosen immutable production image digests, and a complete operator disaster-recovery rehearsal. A bounded local test does not establish a 24-hour cloud soak or a production service SLA. Full historical coverage, provider independence, epoch authority and protocol/deployment restrictions from Phase 18 remain blocked.

After completing the exact Ubuntu/SSH/DNS/Docker/secrets prerequisites in [cloud-deployment.md](cloud-deployment.md), run on the eventual VPS:

```bash
cd /opt/mintbot
sudo docker build -t mintbot:phase19 .
sudo python3 scripts/cloud/manage.py prerequisites
sudo python3 scripts/cloud/manage.py install
sudo python3 scripts/cloud/manage.py validate
sudo python3 scripts/cloud/manage.py --https start
sudo python3 scripts/cloud/manage.py health
sudo python3 scripts/cloud/manage.py backup
sudo python3 scripts/cloud/manage.py restore-drill --archive /var/backups/mintbot/CHOSEN_COMPLETED_BACKUP --key /secure/mintbot-backup-identity.pem
sudo install -m 644 deploy/cloud/mintbot-{backup,monitor,rpc}.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mintbot-backup.timer mintbot-monitor.timer mintbot-rpc.timer
```

The recipient certificate, archive and protected identity paths must be supplied by the operator. Use `--tunnel start` until a domain is ready. Safe upgrades, rollback, emergency stop and fresh-host recovery are documented in the operations and backup runbooks. **Real-money trading remains disabled.**
