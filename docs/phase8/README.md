# Phase 8 — end-to-end research and readiness validation

[Engineering report](../phase8-engineering-report.md) · [end-to-end paper validation](end-to-end-paper-validation.md) · [monitoring](mainnet-monitoring-report.md) · [dependencies](dependency-remediation.md) · [providers](multi-provider-validation.md) · [database](production-database-readiness.md) · [performance](performance-investigation.md) · [signer design](signer-security-readiness.md) · [dashboard](dashboard-research.md) · [funded blockers](remaining-funded-trading-blockers.md).

Live mode remains disabled. Existing modules, synthetic replay and dashboard controls are preserved. The new Research view is read-only and separate from synthetic balances. No wallet secrets, signer endpoint or broadcast operation are introduced.

## Local release checks

```sh
npm ci
python3 scripts/phase8-regression-validation.py
npm run typecheck
npm run build
python3 scripts/phase8-container-smoke.py
npm audit --json
```

The unchanged legacy persistent test refreshes a Phase 7 diagnostic file. The Phase 8 regression wrapper retains that rerun under Phase 8 and restores the previous report bytes, preserving older evidence. Plain `npm test` remains supported, but intentionally refreshes those legacy diagnostic outputs. The lock includes a narrowly assessed Jayson5 browser-client override; inspect the dependency report before extending its use to other transports. Node22 is recommended; the existing cookie dependency declares Node>=22 even though local checks also ran under Node20.19.5.

PostgreSQL tests require the existing PostgreSQL16 binaries and a non-root Unix user. Phase 8 exclusively owns a private marker-guarded retained SCRAM cluster under `$HOME/.local/state/mintbot-phase8-postgres`, separate from Phase 7 and application DATABASE_URL. It is stopped after tests. Do not run its fault tests and heartbeat concurrently against that same deployment.

```sh
node --import tsx --test tests/phase8-database.test.ts tests/phase8-providers.test.ts
node --import tsx scripts/phase8-database-soak.ts --run --seconds 300
```

## Explicit read-only network validation

```sh
node --import tsx scripts/phase8-mainnet.ts --run --seconds 900 --max-candidates 60 --output docs/phase8/new-monitor
node --import tsx scripts/phase8-provider-validation.ts
node --import tsx scripts/phase8-dashboard-snapshot.ts docs/phase8/new-monitor
```

Monitoring samples supported Pump CreateV2 candidates across a bounded window, counts excluded sampling separately, retains original notifications for selected candidates, verifies finalized identity and current accounts, and preserves mandatory risk/freshness/strategy checks. It polls fresh position quotes every five seconds. No candidate is fabricated or reclassified historical-to-live. A full feed or multi-hour production soak is not implied. The recorded15-minute process exhausted the public WebSocket reconnect budget after 408.9 seconds and had 492.7 seconds without further receipts. Its continuous-feed validation failed; gaps were not recovered. Final source marks exhaustion failed, stops new paper work and cannot silently clear it on a ready callback.

Final source additionally checks mainnet genesis and configures a fail-closed independent-provider paper guard. By default operator independence is unknown; it cannot authorize an entry. To provide reviewed explicit provider attribution, `RESEARCH_PROVIDERS_PATH` can identify a local JSON array accepted by `ResearchProviderConfig`; its first endpoint must equal the actual SOLANA_RPC_URL. Attribution strings are configuration evidence, not cryptographic identity. Same-bank comparison and all original safety checks still apply.

Use new output directories. Public endpoints may rate-limit, time out or expose unsupported current variants. The historical long run's exact harness is retained; short integration/release checks identify later instrumentation and guard changes. Neither diagnostic sampling nor an unsigned public-payer simulation supplies wallet authorization.

## Dashboard

Set `RESEARCH_STATUS_PATH` to the absolute path of the generated `research-status.json` before starting the existing server. `GET /api/research/status` uses the existing bearer/origin authorization and `Cache-Control: no-store`. The server reads only a bounded allowlisted local projection; no HTTP parameter selects files. Missing, malformed or stale evidence remains unavailable/unknown/stale. The Research tab includes observed identities, rejection reasons, simulation status, paper P&L, provider/WAL state, explicitly sourced research intents and latency/readiness. Snapshot availability is not evidence freshness or authority.

The stopped snapshot is rebuilt from immutable run evidence with expired market state marked stale. Any database intent rows are explicitly sourced from separate restricted-role fault tests, not live candidate execution. Raw account bytes, credential-bearing endpoints and secrets are excluded from the API.

## Scope of evidence

Raw captures, logs, previous-source archive, source/harness hashes and per-run metrics are retained here. A/A controls use identical ingestion/WAL modules and shared current dependencies. Separately instrumented profiles and concurrent monitor/database activity are documented; no benchmark rate difference is called an optimization. Production readiness remains blocked, with unknowns and failed acceptance items listed explicitly.
