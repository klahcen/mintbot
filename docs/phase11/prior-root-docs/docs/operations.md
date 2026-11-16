# Local operation

This repository is a local paper-trading prototype. It is not a Sites-hosted application and does not execute live swaps. The server rejects `MODE` values other than `paper`; Selected Pump, PumpSwap, Raydium CPMM and Meteora DLMM creation variants have read-only finalized transaction/account verification; remaining layouts and all live swap adapters are unavailable.

## Install and verify

Use Node.js 22 LTS and npm (initial host checks also ran under Node 20.19). Run from the repository root:

```sh
npm install
npm run typecheck
npm test
npm run build
```

Once a lockfile exists, use `npm ci` for repeatable installs. The root build compiles the backend and builds the frontend into `frontend/dist`. Review actual command output before claiming that checks passed. The frontend is served by the same backend process when that build exists.

Create a local `.env` from `.env.example` if supplied by the repository. Use a random token of at least 32 characters; a memorable 32-character password is not equivalent to a random token. For a temporary shell session:

```sh
export API_TOKEN="$(openssl rand -hex 32)"
export MODE=paper
export HOST=127.0.0.1
export PORT=3001
export STATE_PATH=data/state.json
npm run dev
```

The application reads process environment variables; a local `.env` file is not automatically loaded by `npm run dev`. Export its settings or use your runtime's explicit environment-file support. Keep tokens and RPC URLs containing credentials out of version control, screenshots and shared command output.

Open `http://127.0.0.1:3001`. Use the same API token in the dashboard. State starts stopped, including after restart. `INITIAL_BALANCE_SOL` only affects newly initialized state; it does not overwrite persisted balances.

## Exercise paper trading

Run these requests from another shell with the same `API_TOKEN` exported:

```sh
curl -sS http://127.0.0.1:3001/health
curl -sS -H "Authorization: Bearer $API_TOKEN" http://127.0.0.1:3001/api/state
curl -sS -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' -d '{"action":"start"}' http://127.0.0.1:3001/api/control
curl -sS -X POST -H "Authorization: Bearer $API_TOKEN" http://127.0.0.1:3001/api/replay
curl -sS -H "Authorization: Bearer $API_TOKEN" http://127.0.0.1:3001/api/state
```

`replay` creates a labeled synthetic fixture. Its venue name is test metadata, not a claim that a real launch was detected. Inspect the response and state: limits can reject entries, and rejected entries are expected behavior. Copy an open synthetic position's actual `mint` into the following request:

```sh
curl -sS -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' -d '{"mint":"synthetic-mint-1","priceSol":0.0002,"liquiditySol":100}' http://127.0.0.1:3001/api/paper/mark
```

Marks apply only to synthetic positions. A fresh higher price can trigger the configured take profit when running; lower prices or liquidity can trigger other exit rules. A one-second scheduler checks delayed entries and exit rules, but no periodic market feed refreshes prices. Stored stale prices never authorize exits. Refresh marks before manual exits when the configured price-age limit has elapsed.

For a partial manual sale, substitute the actual position ID:

```sh
curl -sS -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' -d '{"fraction":0.5}' http://127.0.0.1:3001/api/positions/POSITION_ID/exit
curl -sS -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' -d '{"action":"stop"}' http://127.0.0.1:3001/api/control
```

Change strategies only while stopped, using the full strategy object from `config/strategy.json` with `POST /api/strategies`. The settings file supplies initial defaults; persisted strategy state survives restarts. Daily spending uses a UTC date bucket.

`kill` stops the engine and blocks manual paper exits. It does not liquidate positions. To recover, inspect state and the incident first, then send `reset` while stopped and explicitly `start`. Reset clears the kill/failure latch, not positions, balances or trading history.

## Containers and persistence

The repository's `compose.yaml` defines `app` and `postgres`, with an optional unused Redis profile. Generate credentials before rendering or starting it:

```sh
export API_TOKEN="$(openssl rand -hex 32)"
export POSTGRES_PASSWORD="$(openssl rand -hex 32)"
docker compose config
docker compose up --build -d
docker compose logs --tail=100 app
docker compose down
```

Compose publishes `app` only at `127.0.0.1:3001`; PostgreSQL and Redis have no published host ports. Its app container runs as the `node` user and drops Linux capabilities. Keep the loopback binding unless an authenticated TLS reverse proxy is configured. `docker compose down -v` removes named volumes; do not use it when retaining state. `docker compose config` can include credentials in its output; do not share that rendered output.

The JSON state file is the application's paper account source of truth. Compose stores it in `paper-state`, and PostgreSQL in `pg-data`. PostgreSQL receives optional replay event records; it is not a substitute for backing up JSON state. Redis is available only with `--profile future-queue` and is unused by the application; its presence does not supply locks, queues, caching or recovery. Compose mounts `db/schema.sql` as a PostgreSQL initialization script, which runs only on first creation of an empty database volume. For an external database, initialize that schema before enabling `DATABASE_URL`.

Run exactly one application writer per state path. The temporary-file rename protects against partial replacement in routine writes but is not a durable multi-process database transaction. Replay returns the committed paper result plus `auditPersisted:false` if the optional database insert failed; investigate the audit outage without repeating an already committed trade. When no database is configured, `auditPersisted:true` does not indicate a database record exists.

## Monitoring and notifications

- `/health` reports process responsiveness and paper mode; it does not verify PostgreSQL, RPC connectivity, scanner coverage, Telegram delivery or execution readiness.
- `/api/state` requires authorization and exposes positions, alerts, failures and recorded latency histograms. Synthetic decision latency is a local measurement, not chain landing latency.
- Review process logs and disk space. Histories and deduplication windows are bounded; retain external logs separately when needed for a research audit.
- Public WebSocket monitoring has bounded reconnect attempts, heartbeat loss detection and bounded historical gap backfill. Inspect authenticated `/api/ingestion` for journal pressure, quarantine, fatal errors and incomplete gaps. An exhausted transport or recovery budget requires investigation; see the [recovery runbook](phase2/README.md).
- Optional Telegram uses `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. Configure only a destination you control. Delivery is best effort and should not be the sole operational alarm. No private keys should be included in alerts.

## Backup, restore and incidents

Stop the application before copying the state file, ingestion WAL and relevant configuration. The WAL has a single-writer PID lock; do not delete a lock owned by a running process. Back up PostgreSQL separately with `pg_dump` if its event history matters. Store credentials separately from data backups; restrict read/write access and encrypt backups where appropriate.

Restore to a separate directory first, verify file structure and run the same version of the application. Invalid state should fail startup rather than be replaced silently. A restored server starts stopped; compare balances, positions, counters and histories before resuming. Do not run the old and restored instance against the same state file.

For a suspected token leak, stop the process, rotate `API_TOKEN`, restart and clear any dashboard session using the old token. For corrupted state or inconsistent accounting, preserve the original file and logs before repair. For an uncertain future chain submission, reconcile the original signature on-chain; a network timeout is not evidence that a transaction failed.

Live execution, funded-wallet provisioning, remaining protocol decoders, executable discovery enrichment and actual swap routing remain blocked integrations. See `security-review.md` for the requirements before funded operation.

## Read-only chain CLI and dashboard

Set `SOLANA_RPC_URL` and `SOLANA_WS_URL`. Opt into the server monitor with `MONITOR_PROGRAMS=pump,pumpswap,raydium-cpmm,meteora-dlmm`; leave it empty for synthetic-only operation. The standalone monitor defaults to these four verified mainnet program names.

```sh
node --env-file=.env --import tsx scripts/monitor.ts
node --env-file=.env --import tsx scripts/monitor.ts mint MINT_ADDRESS
node --env-file=.env --import tsx scripts/monitor.ts transaction SIGNATURE
```

The monitor persists raw public observations to `data/observations.jsonl`; the standalone CLI also writes decoded Pump metadata to `data/discoveries.jsonl`. Phase 3 source monitoring rotates these raw files at 16 MiB with four archives by default, preserving cumulative retention/coverage metadata. Back up or externally rotate with monitoring stopped. The server's read-only decoded discoveries are retained in memory and displayed separately from priced synthetic launches. Reconnection and historical backfill are bounded; provider limits, missing anchors and unavailable history remain explicit gaps. A registry entry covers the named program, not every program of that platform.

Authenticated `GET /api/chain/mints/:mint` and `GET /api/chain/transactions/:signature` expose the same inspections when RPC is configured. No inspection endpoint signs or submits a transaction.

Use **Mark price** on a synthetic position in the dashboard to supply a fresh operator price/liquidity mark. This is an explicit simulation input and can trigger configured automatic exits. No market movement is fabricated by the interface.


## Phase 2 ingestion controls

`SOLANA_SECONDARY_WS_URL` optionally enables a second provider without duplicate logical processing. `INGESTION_JOURNAL_PATH` selects the journal: default `data/server-ingestion.wal` for the server or `data/monitor-ingestion.wal` for the CLI. Separate processes must use separate raw files, state and journals. Existing environment files need no change for paper-only operation.

```sh
curl -sS -H "Authorization: Bearer $API_TOKEN" http://127.0.0.1:3001/api/ingestion
curl -sS -X POST -H "Authorization: Bearer $API_TOKEN" -H 'Content-Type: application/json' -d '{"program":"pump"}' http://127.0.0.1:3001/api/ingestion/recover
```

Recovery uses read-only RPC and does not resume or enable trading. An omitted program requests all configured programs. Requests coalesce; they are not completion acknowledgements. Manual recovery resets the three-cycle budget, so investigate the recorded reason first. Quarantined work requires diagnosis; manual gap recovery does not bypass a failed decoder or repeatedly invoke a broken callback. Do not delete the WAL to clear a status: doing so discards outstanding work and its dedupe history.

The queues are bounded; Phase 3 source monitoring also supplies bounded JSONL rotation with durable retention tombstones. Existing oversized files are preserved during migration and can require operator archiving. Optional PostgreSQL observation audit is bounded and best effort after the raw event is committed; audit refusals/failures are counted separately. See [the contract](phase2/README.md) for finite dedupe, persistence and recovery limits.


## Phase 3 worker journal and verified metadata

See [the WAL durability design](phase3/wal-durability.md) before operating the new source monitor. File-backed admission is asynchronous and acknowledged only after the dedicated worker syncs the WAL and directory. Writer failure is explicit and requires investigation; do not infer ownership from the pending mirror count. Preserve raw retention manifests and the work WAL during backup. Use separate raw/journal/state paths and one process per file set.

`/api/ingestion` now exposes pending peak/oldest age, unacknowledged occupancy, WAL bytes, free disk, queue/disk alerts, verified discoveries and bounded verification issues. Head sampling and finalized verification use read-only RPC with bounded timeouts. Unknown layouts never become valid launches; missing finality/provider data can retry then quarantine. Quarantined work still consumes the bounded journal. A manual recovery request does not erase a processing failure or authorize an unsafe entry.

The optional strategy `freshness` object controls receipt age, slot lag, historical origin and an optional chain-event age requirement. Verified inputs without required evidence are rejected. Existing synthetic paper flows retain their previous behavior. Same-identity provider/fork disagreements are coverage gaps and never authorize a second purchase; there is no automatic financial fork rollback.

The standalone monitor emits additive `verified-protocol-launch` JSON for supported finalized transaction/account evidence, separately from existing Pump metadata output. All discovery records remain ineligible for execution. Inspect [the coverage matrix](phase3/protocol-coverage.md): only the listed creation variants are verified, accounts were sampled after creation, and pinned schema metadata does not prove a deployed binary version. No new wallet permissions or funded endpoints exist.
