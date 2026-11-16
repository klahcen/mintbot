# Cloud operations

Continuous service means the authenticated paper dashboard/API and durable PostgreSQL. It does not mean continuous authorized market decisions. Research remains a maximum 7,200-second single-owner experiment with explicit operator launch, fresh output directory and no restart policy. Cloud startup uses the existing store loader to pause a previously running synthetic paper ledger; positions and history are retained and resumption requires an operator action. Coverage, protocol and provider approval remain blocked. No timer starts research or trading.

Install timers after a successful manual backup/drill:

```bash
sudo install -m 644 deploy/cloud/mintbot-{backup,monitor,rpc}.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mintbot-backup.timer mintbot-monitor.timer mintbot-rpc.timer
sudo systemctl list-timers 'mintbot-*'
sudo journalctl -u mintbot-monitor.service -u mintbot-backup.service -u mintbot-rpc.service --since today
```

Paths assume `/opt/mintbot`. Review `OnCalendar` and UTC scheduling against the desired recovery point; the local client timezone is Africa/Casablanca. Systemd units execute as root to access Docker and private host files. Keep unit/source files root-owned and review every update before root execution. Timers are not installed or activated on the development workstation by Phase 19 validation.

`manage.py health` is authenticated database-aware readiness. `/health` remains public paper-mode liveness and intentionally does not establish database or market health. Docker health checks do not automatically restart an unhealthy running process; restart policies recover exited app/database processes. Repeated readiness failures require operator investigation. Do not add a watchdog that restarts research or deletes its locks.

`manage.py monitor` checks container state/health, authenticated readiness, sticky stop, research snapshot age/run status, WAL and coverage readiness, finite RPC observations, backup age/failure, free space across accessible app/Docker/backup paths, container CPU/memory and host load. It emits fixed alert names and resource numbers, never secrets. Expected blocked research produces a nonzero exit and warnings; service availability and execution approval must be assessed separately. A stopped default research service means stale/unavailable market data and unapproved coverage, even when app/database are healthy. It warns about research failure, unexplained termination, unhealthy delivery/fatal/quarantine/coverage, provider errors, WAL problems, disk below 5 GiB, memory above 85% or CPU above 140%. Change disk/backup-age thresholds through public cloud configuration. Bounded RPC health is never coverage approval.

`manage.py rpc-check` invokes the existing Phase 18 allowlisted diagnostic in a disposable research-profile container, with the research engine command replaced. It makes finite paced HTTP reads and capped finalized WSS subscriptions and stores observations in mode-0600 `private/rpc-health.json`. HTTP/WSS failure, quiet/unknown per-venue delivery, provider disagreement/unverified agreement and observations older than 30 minutes warn. Quiet subscriptions do not prove a broken venue or complete delivery. The 15-minute timer does not establish continuous WSS availability; review live research heartbeat and WAL during an authorized run. This phase did not perform new public-provider diagnostics. Missing attribution/configuration causes a fixed diagnostic failure alert.

Free alerting options include systemd failed-unit inspection and journald, an operator-managed `OnFailure=` unit delivering through an existing local mail service, or an external uptime checker observing HTTPS liveness. Configure notification destinations separately; send only alert codes/counts, never state payloads, tokens or provider URLs. No external message was sent or destination configured by this phase. Alerts require an operator response policy; a failed monitoring unit alone is not a delivered notification.

For controlled updates:

1. Review source and security changes, run isolated regression and cloud integration checks, build a **new unique** image tag, and retain the previous image/configuration. Pin published images by reviewed digest for repeatable production releases; examples use readable release tags. Never overwrite a release tag once deployed.
2. Confirm research is stopped and back up protected source/private configuration separately. Set only `MINTBOT_IMAGE` in `cloud.env` to the new release; keep previous configuration securely. Verify database/schema compatibility. There are no automatic destructive migrations in this phase.
3. Run `sudo python3 scripts/cloud/manage.py --https update` (or `--tunnel update`). It validates config, completes encrypted database/evidence backup, checks the local target image exists and starts only PostgreSQL/app/proxy with readiness checks. It never pulls arbitrary source, rebuilds implicitly, prunes images, resets volumes or launches research. A failure stops the script for investigation; partial service updates may remain.
4. Verify `health`, HTTPS authentication, persistence, monitoring and expected blocked execution state. Public certificate and off-host backup checks remain separate operator tasks.

For rollback, stop research, restore the prior reviewed source/configuration and immutable image reference in `cloud.env`, then run `sudo python3 scripts/cloud/manage.py --https rollback`. The command recreates only continuous services with existing volumes. It does **not** rewind database or file evidence. Do not roll back an incompatible schema; use an isolated recovery plan instead. Database image upgrades/downgrades need a dedicated reviewed migration and restore drill, never a casual tag change.

For emergency stop:

```bash
sudo python3 scripts/cloud/manage.py emergency-stop
sudo docker compose --env-file cloud.env -f compose.cloud.yaml --profile research ps --all
```

The command durably writes the existing sticky kill intent and stops the named research service. Confirm every one-off research container has actually terminated, preserving its output. If app/API is unavailable, stop research directly through Docker, then use a one-off app-image helper mounted on the control volume to call the existing `requestResearchStop` function before permitting any restart. Do not delete stop files, owner locks, WAL, quarantines or epoch evidence. For a complete service outage, stop app/proxy as well; leave PostgreSQL and all volumes intact. Never use `down -v`, `volume prune`, production resets or legacy retained-cluster tests.

An authorized research experiment additionally requires the same-boot Phase 12 host-clock evidence and all unchanged execution gates. Collect fresh bounded clock evidence for at least the requested run duration with `scripts/phase12-host-health.py --seconds N --container APP_CONTAINER --output NEW_DIRECTORY`; copy its evidence and system-start record into protected `private/research-clock/` with UID 1000 read access. Use a fresh `RESEARCH_RUN_NAME`, review retained stop/owner state, and launch only the named service through the cloud research profile. The cloud service forces `RESEARCH_REQUIRE_HOST_HEALTH=true`. No procedure here authorizes clearing sticky stops or approves coverage. Phase 18 provider independence, historical coverage, epoch authority and protocol/deployment restrictions remain external blockers; keep real-market entries/exits at zero until independently resolved.

Use `python3 scripts/phase19-validation.py --output-root docs/phase19/NEW_VALIDATION --serial-tests` for a clean regression run. It copies source into a disposable Node 22 install, redirects only test-process `os.homedir()` to a disposable cluster home, and isolates legacy mutable database reports. It never changes `HOME` or targets retained Phase 7/8 deployments. `python3 scripts/cloud/validate-local.py` uses a random cloud project, synthetic credentials, temporary private files, isolated Docker volumes and a local test CA; only those disposable resources are removed with volumes. Run it only on a development/test host with Docker and adequate RAM/disk. Production runbooks never delete volumes.
