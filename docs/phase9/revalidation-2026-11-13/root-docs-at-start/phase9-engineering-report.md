# Phase 9 engineering report

Status date: 2026-11-11. **Read-only reliability changes delivered; verified continuous coverage and positive real-launch paper execution remain unproven.** RUNNING: final two-hour results are not yet available. Live trading remains disabled.

The repository was audited before edits. The original application, dashboard, journal worker, ingestion identity/durability, quotes, strategy and paper engines were retained. New work adds the opt-in bounded WebSocket supervisor, finalized recovery/page audit checkpoints, durable exhausted-gap status correction, structured Pump failure evidence, exact historical diagnosis, and a narrow native-bigint dependency replacement. The before source/archive and old root documents are retained under [phase9](phase9/README.md). All 100 checked prior-phase artifacts still match the Phase8 manifest.

Validation: **282 tests, 282 passed, 0 failed** in the retained full run, including all original 266 tests. Sixteen new tests cover supervisor faults, restart/recovery/deduplication, explicit coverage/quarantine gates, exact eight-case diagnostics and codec boundaries. The final full run, typecheck and production image include the fsync completion refinement and explicit quarantine admission guard; inspect the validation artifacts for exact hashes and versions. Typecheck, production build, mounted Node22 smoke, actual two-stage Docker build and production-image smoke evidence are retained. Both container probes assert authenticated APIs/dashboard assets/SQL assets and live-mode rejection. PostgreSQL crash/restart/SCRAM/privilege/restore/fencing tests run against the private research cluster, with previous-phase files restored. Dependency findings changed from 3 to 0; no advisory was suppressed.

| Observation | Measured value |
|---|---|
| Experiment | RUNNING: final two-hour results are not yet available |
| Supervisor elapsed seconds | 995.146 |
| Transport open seconds | 981.507 |
| Transport disconnected seconds | 13.640 |
| Connections / incidents | 12 / 11 |
| Delivered notifications | 140984 |
| Admission refusals/conflicts | 62 |
| Sampled candidates | 15 |
| Verified creations | 4 |
| Durable market reviews / parsed states | 4 / 0 |
| Simulation diagnostic records | final evidence pending |
| Paper entries / exits | 0 / 0 |
| Instrumented RPC calls / errors | 128 / 97 |
| Observed explicit rate limits (lower bound) | 2 |
| WAL checkpoints | 9 |
| Live trading | False |
| Completed ingestion identities | 140906 |
| Processing fatal state | None |
| Quarantined observations | 26 |
| Oldest pending age ms (includes quarantine) | 892984 |
| Admission queue peak | 1024 |
| Worker unacknowledged record peak | 17 |
| Intentional transport backpressure pauses | 1 |
| Paired account-state quote reviews (before simulation) | 0 |

The first full-stream controller had an integration failure: the acknowledgement gauge reached 1024, gap metadata persistence failed while the worker remained healthy, completions stopped at 256420, and transport continued. Its 66-minute partial run was stopped and retained. A deterministic 1000-conflict replay reproduces that frontend-capacity failure, while the bounded admission test avoids it without raising worker limits. A 128-item buffer calibration then showed excessive pauses; the final run uses 1024 items with the same 4MiB byte limit and eight concurrent fsync-aware jobs. No failed attempt is hidden or counted toward the full-window criterion.

The eight historical market failures are reproducible: four supply mismatches on Mayhem state, two non-native quote variants, and two stale/unknown original event times. Current finalized loader headers match all four pins. No new protocol variant was enabled without complete evidence. All eight independent SDK buy/sell wire comparisons and 16 quote vectors match after the dependency migration. No unsafe token classification, imaginary quote, coverage recovery, eligible trade, profit or speed improvement is asserted.

Required evidence and limits:

- [WebSocket reliability](websocket-reliability.md)
- [Recovery coverage](recovery-coverage.md)
- [Eight-case market diagnosis](market-rejection-analysis.md)
- [Protocol review and disabled variants](verified-protocol-extensions.md)
- [End-to-end paper results](end-to-end-paper-results.md)
- [Extended mainnet report](long-duration-mainnet-report.md)
- [Dependency security](dependency-security-report.md)
- [Provider comparison](rpc-provider-comparison.md)
- [Matched performance and database measurements](performance-comparison.md)
- [Remaining funded blockers](remaining-funded-trading-blockers.md)

Acceptance is bounded by actual observations: tested retries and durable identity hold; real missing coverage is still partial/unrecoverable; unsupported market variants fail closed; provider independence remains unknown; no eligible positive paper entry/exit is claimed. The final validated process includes the corrected bounded admission and coverage controls from launch. The earlier failed/calibration runs remain separately attributed. Read-only research delivery does not establish a funded release.
