# Integration differences and executable provenance

The measured runtime is compiled Node22 in the dedicated read-only research container, not the legacy server monitor. The source-at-start snapshot copied before import is the authoritative loaded version. No hot reload is claimed. The original Phase9 long run predates its final clock/observer/admission refinements; the Phase10 calibrations also predate later readiness and retry-gap corrections and are excluded from the validated window.

| Module | Phase10 source changed from final Phase9 | Phase9 long-run source versus final Phase9 |
|---|---|---|
| src/research/monitor-supervisor.ts | True | different/not captured |
| src/research/admission.ts | False | same |
| src/research/coverage.ts | False | same |
| src/ingestion.ts | True | same |
| src/event-journal.ts | True | same |
| src/async-journal.ts | True | same |
| src/monitor-service.ts | False | same |
| src/server.ts | False | same |
| Dockerfile | False | different/not captured |
| compose.yaml | False | different/not captured |

Exact hashes for all three source versions and actual loaded compiled modules are in [integration-difference.json](integration-difference.json). The [runtime manifest](runtime/mainnet-validated/runtime-manifest.json) and [copied compiled modules](runtime/mainnet-validated/source-at-start/) identify the executed image independently of later source edits. Offline forensic/report tools added later are outside the loaded pipeline's import graph.

The existing HTTP server still imports createMonitoringService. Its optional MONITOR_PROGRAMS path uses the original SolanaMonitor lifecycle and dual-feed service, not MonitorSupervisor. The default compose.yaml and Dockerfile server command are unchanged. Shared ingestion gains durable failure metadata, active/quarantine accounting and reviewed WAL records; existing API fields remain. The original dashboard, synthetic paper engine and market APIs keep their contracts.

The explicit compose.research.yaml overlay adds a finite supervisor sidecar and read-only Research snapshot mount; it sets the legacy server monitor selection to blank only in that explicit overlay. `RESEARCH_RUN_NAME` selects a fresh retained directory for both the job and dashboard. No automatic restart, lifetime-budget reset or old-WAL reuse is permitted. A new experiment does not retroactively recover an older gap.

The validation job uses host networking, a bind-mounted evidence directory and the name mainnet-validated. The Compose profile uses its normal service network and a named volume with a configurable run name. Both use the compiled Node22 entrypoint, init, read-only root, dropped capabilities, no automatic restart and the same receipt/coverage health requirements. Compose expansion was validated without starting the default app, PostgreSQL or Redis services.

The research job has a separate fsynced file-backed paper ledger and no attached PostgreSQL pool. The private PG16 authenticated fault-test deployment and Compose PG17 service are distinct; SQL fault tests do not establish production HA or atomic file/SQL execution ownership.

New WAL review records require the current reader. Old WALs load without changing original event IDs/times; downgrade to an older writer is not authorized. Retry review opens a coverage gap before quarantine release, never completion or trade permission.
