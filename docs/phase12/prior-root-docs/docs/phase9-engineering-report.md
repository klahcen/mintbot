# Phase 9 engineering report

Status date: 2026-11-14. **Read-only reliability changes delivered; verified continuous coverage and positive real-launch paper execution remain unproven.** INTERRUPTED/host-clock discontinuity: final evidence retained; two-hour monitored target unmet. Live trading remains disabled.

The repository was audited before edits. The original application, dashboard, journal worker, ingestion identity/durability, quotes, strategy and paper engines were retained. New work adds the opt-in bounded WebSocket supervisor, finalized recovery/page audit checkpoints, durable exhausted-gap status correction, structured Pump failure evidence, exact historical diagnosis, and a narrow native-bigint dependency replacement. The before source/archive and old root documents are retained under [phase9](phase9/README.md). All 100 checked prior-phase artifacts still match the Phase8 manifest.

Validation: **288 tests, 288 passed, 0 failed** in the retained full run, including all original 266 tests. 22 additional tests cover supervisor faults, restart/recovery/deduplication, explicit coverage/quarantine gates, exact eight-case diagnostics and codec boundaries. The retained full run, typecheck and production image include the fsync completion refinement and explicit quarantine admission guard; inspect the validation artifacts for exact hashes and versions. Typecheck, production build, mounted Node22 smoke, actual two-stage Docker build and production-image smoke evidence are retained. Both container probes assert authenticated APIs/dashboard assets/SQL assets and live-mode rejection. PostgreSQL crash/restart/SCRAM/privilege/restore/fencing tests run against the private research cluster, with previous-phase files restored. Dependency findings changed from 3 to 0; no advisory was suppressed. Current validation artifacts are in [the validation directory](phase9/revalidation-2026-11-13/). The initial loaded rerun had one API startup timeout (281/282 passed); the subsequent full rerun passed without changing the original test or timeout.

| Observation | Measured value |
|---|---|
| Experiment | INTERRUPTED/host-clock discontinuity: final evidence retained; two-hour monitored target unmet |
| Supervisor elapsed seconds | 3,464.806 |
| Process wall seconds | 71,190.455 |
| Transport open seconds | 3,391.464 |
| Transport disconnected seconds | 73.342 |
| Connections / incidents | 52 / 51 |
| Delivered notifications | 421018 |
| Admission refusals/conflicts | 223 |
| Sampled candidates | 52 |
| Verified creations | 34 |
| Durable market reviews / parsed states | 34 / 6 |
| Simulation diagnostic records | 1 |
| Paper entries / exits | 0 / 0 |
| Instrumented RPC calls / errors | 1295 / 140 |
| Observed explicit rate limits (lower bound) | 0 |
| WAL checkpoints | 30 |
| Live trading | False |
| Completed ingestion identities | 421680 |
| Processing fatal state | None |
| Quarantined observations | 40 |
| Oldest pending age ms (includes quarantine) | 70856036 |
| Admission queue peak | 1024 |
| Worker unacknowledged record peak | 17 |
| Intentional transport backpressure pauses | 3 |
| Paired account-state quote reviews (before simulation) | 4 |
| WebSocket handshake 429 incidents (retained events) | 3 |
| Wall minus monotonic duration discrepancy, seconds (unobserved; exact mechanism unknown) | 67,725.649 |

The first full-stream controller had an integration failure: the acknowledgement gauge reached 1024, gap metadata persistence failed while the worker remained healthy, completions stopped at 256420, and transport continued. Its 66-minute partial run was stopped and retained. A deterministic 1000-conflict replay reproduces that frontend-capacity failure, while the bounded admission test avoids it without raising worker limits. A 128-item buffer calibration then showed excessive pauses; the final run uses 1024 items with the same 4MiB byte limit and eight concurrent fsync-aware jobs. No failed attempt is hidden or counted toward the full-window criterion.

The eight historical market failures are reproducible: four supply mismatches on Mayhem state, two non-native quote variants, and two stale/unknown original event times. 3 of 4 current loader headers matched reviewed pins (pumpswap, raydium-cpmm, meteora-dlmm). pump: Unsupported upgraded program version. Unreviewed deployments remain rejected. No new protocol variant was enabled without complete evidence. All eight independent SDK buy/sell wire comparisons and 16 quote vectors match after the dependency migration. No unsafe token classification, imaginary quote, coverage recovery, eligible trade, profit or speed improvement is asserted.

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

Acceptance is bounded by actual observations: tested retries and durable identity hold; real missing coverage is still partial/unrecoverable; unsupported market variants fail closed; provider independence remains unknown; no eligible positive paper entry/exit is claimed. The monitored process uses the captured source in its source-at-start directory. Later terminal-controller, observer-failure, unique-subscription acknowledgement, JSON-RPC error-detail and wall/monotonic discontinuity refinements are tested separately and were not hot-loaded into that process. The earlier failed/calibration runs remain separately attributed. Read-only research delivery does not establish a funded release.
