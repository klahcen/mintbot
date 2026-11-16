# Operational supervisor validation

The validated container runs `dist/scripts/phase10-mainnet.js` → the existing research pipeline → `MonitorSupervisor`, on v22.23.4. [Loaded module hashes and copied compiled code](phase10/runtime/mainnet-validated/runtime-manifest.json), [exact container launch](phase10/runtime-validated-launch.json), [integration audit](phase10/integration-difference.json).

The explicit Compose overlay creates a finite research sidecar and connects its read-only status to the existing Research tab. Default `compose.yaml` and server monitor selection remain unchanged. The overlay uses `RESEARCH_RUN_NAME` for a fresh retained directory, drops capabilities, has a read-only root, uses init, and never automatically restarts. Existing output directories are rejected before opening a WAL. Stop preserves pending/quarantined work and evidence; a new bounded experiment has a distinct scope and does not heal the old interval.

Subscription IDs must be unique per acknowledged request; repeated identical ACKs are idempotent. ACK timeout is ten seconds. The underlying 15-second ping/pong heartbeat and bounded payload/handshake remain. Receipt staleness is thirty seconds. A transport fault clears readiness before its callback/backoff; an overdue receipt arriving ahead of the watchdog triggers a gap rather than resetting freshness. Stable receipts reset only incident attempts. Three failed attempts cause cooldown/rotation; global connection/incident/time budgets remain finite.

WAL admission is bounded to 1024 items / 4 MiB and eight fsync-aware admission jobs. Saturation pauses/fences transport and records a durable gap. Failed callbacks retain bounded redacted stage/cause. Terminal exhaustion, observer failure, WAL failure or wall/monotonic drift above five seconds stops the controller, drains and exports. Stop and start cannot reset a finished supervisor's budgets. Fully acknowledged milliseconds exclude pre-ACK socket time.

[Actual persisted failure-stage checkpoint](phase10/runtime-checkpoint-proof.json), [compiled CLI consent/live/reuse guards](phase10/research-cli-guards.json), [live sidecar dashboard/API smoke](phase10/dashboard-sidecar-smoke.json), [fault/review tests](phase10/readiness-stage-tests.log), [all original/new tests](phase10/complete-validation/after-tests.log), [Compose expansion](phase10/compose-validation.json). Docker research health requires recent receipts and no durability failure, quarantine or unresolved gap. A healthy API server or open socket is not independent chain coverage or paper eligibility.

| Observation | Measured result |
|---|---|
| Run | Finalized bounded experiment |
| Requested monotonic monitoring seconds | 7200 |
| Recorded supervisor seconds | 7,200.000 |
| Process wall seconds | 7,201.782 |
| Transport-open seconds | 7,020.967 |
| Fully acknowledged subscription seconds | 7,004.942 |
| Transport-disconnected seconds | 179.033 |
| Wall/monotonic discrepancy ms | -0.336 |
| Connections / incidents | 111 / 110 |
| Delivered notifications | 898515 |
| Verified creations | 69 |
| Market reviews / parsed states / paired quotes | 69 / 0 / 0 |
| Paper entries / exits | 0 / 0 |
| Admission refusals | 357 |
| Active pending / quarantined | 0 / 79 |
| Oldest active work ms | 0 |
| Oldest pending ms including quarantine | 7194440 |
| Writer / pipeline failure | None / None |
| Two-hour monotonic target met | True |
| Provider-reported continuous coverage established | False |
| Independently operated provider agreement | UNMET |
| Live trading | False |
