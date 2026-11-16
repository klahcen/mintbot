# Supported operational integration

Use `npm run research:monitor:all -- --run --seconds 1800 --output <new-directory>` or the explicit `compose.research.yaml` profile. The Phase11 wrapper seals compiled Node22 sources/config/lock and an epoch before importing the shared Phase9 pipeline; there is no parallel research engine. [Actual launch/image/arguments](phase11/runtime-launch.json), [runtime manifest](phase11/runtime/mainnet-validated/runtime-manifest.json), [Compose expansion](phase11/compose-validation.json).

| Component | Supported role/ownership |
|---|---|
| Default server monitor | Existing opt-in legacy lifecycle; unchanged unless the explicit research overlay is used |
| Research sidecar | One bounded four-venue decision owner, fsynced WAL and isolated file-backed paper ledger |
| Dashboard server in overlay | Authenticated projections/control, `MONITOR_PROGRAMS` empty, `REAL_MARKET_PAPER=false` |
| Research data mount | Read-only to dashboard; writable only to the research owner |
| Research control mount | Shared writable stop/owner namespace, separate from ledger/status volume |
| PostgreSQL intents | Separate read-only simulation diagnostics and fault tests; no second live paper decision owner |

`RESEARCH_OWNER_PATH` is exclusively created, file/directory fsynced and token-checked on graceful release. It never interprets a foreign PID as a dead container and never automatically steals a stale lock. Crash recovery requires stopping every possible owner, preserving the lock/ledger/audit, inspecting in-flight effects and explicitly clearing the abandoned scope offline. A second run name does not bypass a shared owner lock. Different deliberately configured namespaces require separate operational review.

Authenticated `/api/control` stop/kill also persists `RESEARCH_STOP_PATH`. Its response says **requested**, not completed. The sidecar notices at its next five-second sample, stops intake, marks its ledger stopped/killed and drains. The sticky file is checked synchronously inside paper entry/exit transactions, including queued work. A transaction already executing before the file exists can finish; operators must confirm the stopped snapshot and process exit. Stop intent does not auto-clear on API reset/start or a new run name. Restarts need a fresh retained output directory and deliberate offline control review. Startup rejects simultaneous legacy monitor/server market decisions when shared research control is selected.

[Authenticated dashboard reading real updates](phase11/dashboard-sidecar-smoke.json), [final production API/live rejection](phase11/production-delivery-smoke.json), [authenticated sticky stop/reset and conflicting topology](phase11/control-api-smoke.json), [earlier compiled owner refusal and API stop/drain](phase11/operational-stop-owner-smoke.json), [final corrected-wrapper release probe](phase11/release-stop-owner-smoke.json), [fault/regression tests](phase11/delivery-validation/after-tests.log). Compose defaults to 1,800 seconds and all four venues, no automatic sidecar restart, init, read-only root, dropped capabilities and a coverage/policy-gated health check. A healthy HTTP server is not authorized research coverage.

The original file-backed ledger and SQL intent ledger are separate durability domains. Tests/diagnostics do not establish atomic file/SQL ownership or production HA/PITR. No signer, broadcaster, funding route or automatic promotion exists.
