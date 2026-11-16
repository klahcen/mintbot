# Phase 11 evidence and reproduction

Start with [the engineering report](../phase11-engineering-report.md). Current Pump financial compatibility, complete coverage, authenticated independent providers, independently reviewed epoch authorization and a genuine paper entry/exit remain unmet. No signing, broadcasting, funding or live mode exists.

```sh
npm run typecheck
npm run build
# Existing helpers refresh old diagnostic files; this wrapper preserves/restores old artifact bytes:
python3 scripts/phase9-regression-validation.py --output docs/phase11/new-validation-directory
# Fresh output is mandatory; all four venues by default:
npm run research:monitor:all -- --run --seconds 1800 --output docs/phase11/new-run
# Explicit supported topology; set ordinary app/DB configuration first:
RESEARCH_RUN_NAME=unique-new-run docker compose -f compose.yaml -f compose.research.yaml --profile research up
# Read-only network capture; new paths/directories preserve earlier observations:
node --import tsx scripts/phase10-pump-evidence.ts --run --output-dir docs/phase11/new-pump-capture
node --import tsx scripts/phase11-current-network.ts --run --output docs/phase11/new-current-network
node --import tsx scripts/phase11-candidate-inspections.ts --run --output docs/phase11/new-candidate-inspections.json
# Render retained evidence; missing final results never pass:
python3 scripts/phase11-report.py
```

The measured run is `runtime/mainnet-validated`. Its copied compiled source and manifest identify actual loaded Node22 modules. The primary dataset predates the final two-module correction that propagates the decision fence to inherited simulation-wrapper exits. `runtime/release-probe` seals and exercises the final corrected code; its short stop/owner validation is excluded from the primary monitoring time. Exact primary/final differences and current compiled hashes are retained. Later offline diagnostic/report tools are outside those module graphs. `runtime/mainnet` is a bootstrap rejected before monitoring because the complete Phase10 evidence exceeded the history bound; no time from it counts. `coverage-history.json` is an exact compact index with the entire original artifact's digest, not a recovery claim. The measured run is finite, has no automatic restart and preserves all unresolved ownership.

All four venues share one supervisor, ingestion pipeline and file-backed paper owner. The research overlay disables legacy/server market decisions and mounts research status read-only into the dashboard. A separate shared control mount contains the owner lock and sticky stop intent. A second owner is rejected; no PID-based stale-container lock stealing occurs. Stop/kill through the authenticated API returns `researchStop.status=requested`; confirm the stopped research status and process exit before calling it completed. A new run name/API reset does not clear the stop fence. Preserve and inspect abandoned ownership offline before any deliberate restart.

Quarantine review uses a **stopped forensic copy**, not the original WAL:

```sh
node --import tsx scripts/phase11-quarantine-review.ts --apply \
  --journal path/to/stopped-copy.wal --plan path/to/review-plan.json \
  --output path/to/new-review-audit.jsonl
# A retry additionally requires --retry-authority path/to/authority.json.
```

Authority binds exact WAL and plan hashes, distinct named approver, bounded expiry and `liveAuthorized:false`. Names do not prove independently authenticated people. The append-only JSONL contains a fsynced authorization header before WAL changes and a record after each durable review. Pending payload/time/attempts remain unchanged; retry reopens a gap and cannot become a new live opportunity. Crash-partial audits retain the authority header and committed WAL records for reconstruction. All 79 Phase10 observations remain owned on the reviewed copy.

Performance controls reconstruct the Phase10 source archive using the same dependency graph. `phase11-performance.py` records exact Node22 disk-backed commands, alternating order and host filesystem identity; the tested ingestion graph is A/A. Instrumented populations have overhead and are separate. Actual public-network diagnostics and observer work overlap parts of monitoring; no quiet-host latency SLO is claimed.

Current public inventory simulation uses `sigVerify:false`, real public accounts and no keys, spending or submission. A successful diagnostic is never inserted as a fresh launch, paper position or proof of independent provider authorization. Reference SDKs remain isolated under `/tmp` with retained Phase10 lock/integrity metadata; no production dependency is added.
