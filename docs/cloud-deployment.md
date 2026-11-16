# Ubuntu 24.04 cloud deployment

Status: **PREPARED / LOCALLY VALIDATED**, subject to the evidence and limits in [Phase 19](phase19-engineering-report.md). No VPS, public domain, public certificate or external storage was provisioned. This is a standalone stack; do not merge it with `compose.yaml` or adopt local development volumes.

The mandatory services are the paper dashboard/API and PostgreSQL. Caddy is required for public HTTPS; an SSH tunnel is the alternative while a domain is unavailable. Research is an optional, bounded operator job, stopped by default. Redis is unused. Host systemd timers run backups, monitoring and finite read-only RPC probes. No Docker socket is mounted into any container.

1. Provision Ubuntu 24.04 LTS with at least 2 vCPU, 4 GiB RAM and 40 GiB expandable SSD, plus encrypted off-host backup capacity. Start with no inbound rules except SSH from your administration IP. Use an SSH key; test a second SSH session before disabling password/root login in `/etc/ssh/sshd_config.d/60-mintbot.conf` (`PasswordAuthentication no`, `PermitRootLogin no`), then run `sudo sshd -t` and `sudo systemctl reload ssh`. Keep provider console recovery available. Docker access grants root-equivalent authority; use sudo rather than a shared docker group.
2. Configure the provider firewall and UFW to allow your SSH port from the administration IP. For HTTPS, add inbound TCP 80 and 443. Never add 3001 or 5432. Published Docker ports can bypass UFW: the provider firewall and the actual Compose bindings are both important. See the [official Docker installation guidance](https://docs.docker.com/engine/install/ubuntu/).
3. For HTTPS, point the chosen DNS A record (and AAAA only if IPv6 actually works) at the VPS. Remove stale addresses, ensure CAA permits the ACME issuer, and make inbound 80/443 and outbound DNS/HTTPS reachable. Use a dedicated hostname. Caddy owns renewal and persistent certificate state. The [Caddy reverse proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) describes upstream handling; the checked-in configuration preserves Host and API authorization.
4. Install Docker from its official apt repository. Review the current [Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/) before executing the following on the VPS:

   ```bash
   sudo apt-get update
   sudo apt-get install -y ca-certificates curl openssl python3 rsync
   sudo install -m 0755 -d /etc/apt/keyrings
   sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
   sudo chmod a+r /etc/apt/keyrings/docker.asc
   sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF_DOCKER
   Types: deb
   URIs: https://download.docker.com/linux/ubuntu
   Suites: noble
   Components: stable
   Architectures: $(dpkg --print-architecture)
   Signed-By: /etc/apt/keyrings/docker.asc
   EOF_DOCKER
   sudo apt-get update
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   sudo systemctl enable --now docker
   ```

   Remove conflicting distro Docker packages first if present, as specified by Docker. These are operator instructions, never commands automatically sent to a remote server.
5. Install a reviewed repository release at `/opt/mintbot` without `.env`, `.env.save`, `private/`, `data/`, `node_modules/` or local backup artifacts. Transfer historical research evidence separately over an authenticated channel if needed; do not rename it as new evidence. This supplied workspace has no `.git`, so tracking/history cannot be certified here. Verify the actual checkout excludes secrets before creating a source archive. Keep the deployment source and public `cloud.env` root-owned, writable only by the deployment administrator.
6. Prepare public configuration and **new cloud files**, without editing or rotating the existing development credentials:

   ```bash
   cd /opt/mintbot
   sudo install -m 600 deploy/cloud/cloud.env.example cloud.env
   sudo install -d -m 700 private
   sudo install -m 600 deploy/cloud/runtime.example.json private/cloud-runtime.json
   sudoedit cloud.env private/cloud-runtime.json
   ```

   Set `MINTBOT_IMAGE` to a unique reviewed release tag or digest. Set the domain/email, backup path and recipient certificate path. Enter the existing API token, application database hex password and exact reviewed provider endpoints in the runtime JSON using a secure editor; placeholders are rejected. Never paste credentials into shell arguments or shell history. The API token is required even behind HTTPS. Install the matching private provider attribution JSON as `private/research-providers.json`, mode 0600, owner 1000:1000, without changing its evidence or review status. Missing attribution only blocks the optional probe/research job; it does not block the dashboard.

   Create PostgreSQL password files exclusively; this refuses existing files:

   ```bash
   sudo python3 - <<'PY'
   import json, os, secrets
   from pathlib import Path
   os.umask(0o077)
   p=Path('/opt/mintbot/private')
   r=json.loads((p/'cloud-runtime.json').read_text())
   for name,value in [('database-app-password',r['POSTGRES_PASSWORD']),('postgres-password',secrets.token_hex(32))]:
       with (p/name).open('x') as f: f.write(value+'\n')
   PY
   ```

   The separate bootstrap-owner password is never supplied to the app. UID 1000 reads the runtime file; Alpine PostgreSQL UID 70 reads the two database password files. The installer sets those owners. Do not reuse this UID assumption with a different database image family.
7. Build and install locally on the VPS, using exactly the image tag in `cloud.env`:

   ```bash
   sudo docker build -t mintbot:phase19 .
   sudo python3 scripts/cloud/manage.py prerequisites
   sudo python3 scripts/cloud/manage.py install
   sudo python3 scripts/cloud/manage.py validate
   sudo python3 scripts/cloud/manage.py --https start
   sudo python3 scripts/cloud/manage.py health
   ```

   Installation creates and initializes ownership of **new** named volumes only; it checks existing ownership and never repairs/chowns existing volumes. It does not reset databases. Startup requires healthy PostgreSQL and authenticated app readiness. The six volumes are namespaced under `mintbot-cloud_`. Research is not included in startup, update, rollback or timers. Do not run an unqualified `up --profile research`.
8. Verify from outside the VPS:

   ```bash
   curl --fail --max-time 15 -I http://dashboard.example.com/
   curl --fail --max-time 15 https://dashboard.example.com/health
   curl --max-time 15 -o /dev/null -w '%{http_code}\n' https://dashboard.example.com/api/state
   ```

   Expect HTTP redirect to HTTPS on public port 443, a valid publicly trusted certificate, paper liveness, and **401** for the unauthenticated state request. Use the dashboard token field for authenticated access. Do not use `curl -k`. Confirm external scans cannot reach 3001 or 5432. Local test-CA validation does not establish public ACME issuance.
9. Configure [backups and restore drills](cloud-backup-restore.md), then install [operations timers](cloud-operations.md). Verify the first encrypted backup and isolated restore before relying on unattended service.
10. Follow the controlled upgrade, rollback, emergency-stop and disaster-recovery procedures in those runbooks. Keep the last reviewed image and a verified backup available.

Without a domain, use `sudo python3 scripts/cloud/manage.py --tunnel start`, keep public 80/443 closed, and connect from your workstation:

```bash
ssh -N -L 3001:127.0.0.1:3001 operator@VPS_IP
```

Open `http://127.0.0.1:3001` locally and authenticate with the API token. The cloud tunnel overlay binds only VPS loopback; it must not be combined with a running public proxy. When changing access mode, explicitly stop Caddy and recreate the app with the chosen Compose files, then inspect actual bindings. Public HTTPS access is deferred until DNS and ACME checks pass.
