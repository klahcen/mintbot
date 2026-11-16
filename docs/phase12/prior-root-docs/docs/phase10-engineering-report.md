# Phase 10 engineering report

Generated 2026-11-14T19:11:39.607178+00:00. **Engineering changes are delivered; full protocol/coverage/paper acceptance remains incomplete.** No signer, broadcaster, live configuration or funded submission was introduced.

The audit began with the November 14 Pump mismatch, interrupted Phase9 run and unresolved WAL. Original source, all prior root documents and 759 Phase9 artifact hashes were captured before edits under [Phase10](phase10/README.md). The original 288 tests remain; validation records **299 tests, 299 passed, 0 failed**. Backend/frontend typecheck, production build, uncached Node22 clean-install Docker build and authenticated production-image/live-rejection smoke are retained. Audit findings: **0**. Original safety, quotes, integer accounting and dashboard contracts remain.

The operational entrypoint `npm run research:monitor -- --run` and explicit `compose.research.yaml` overlay reuse the existing research pipeline. The default HTTP server still selects the legacy monitoring service; no silent supervisor switch occurred. The measured job runs compiled Node22 code inside the restricted container and seals its loaded module hashes before import. [Integration differences](phase10/integration-difference.md) distinguish the Phase9 source-at-start, final Phase9 source, final Phase10 runtime and deployment settings.

Fault testing found and corrected stale readiness during retry backoff, and an overdue receipt racing a delayed watchdog. Refusal audits now retain the precise pipeline reason plus conflicting fingerprints. Durable quarantine failures retain stage and bounded redacted cause. Reviewed retries reopen coverage before releasing quarantine; original identity/time/attempts remain and no review marks a gap recovered. Fully acknowledged duration is measured separately from transport-open duration.

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

The Pump binary was captured at deployment slot 469055660; its reviewed slot remains 458921440. The current Global is 1096 bytes versus reviewed sizes 1045/1088. Available official schemas and SDK outputs do not establish source-to-binary correspondence or the complete changed financial contract. Pump stays blocked; no new variant/pin was enabled. Eight independent SDK instruction vectors and sixteen quote vectors match retained fixtures, not the new binary.

All 40 historical quarantines reproduce: 35 truncated-log and five incomplete-invocation-stack failures. The 223 refused/conflicting admissions split into three capacity refusals and 220 fingerprint conflicts, with two duplicates counted separately. The original WAL remains unchanged; 40 retain reviews were demonstrated on a forensic copy with all 40 ownership records and the unrecoverable gap preserved. Missing historical provenance is not invented.

Two earlier container calibrations are retained separately and contribute no time to the validated window. This run's source snapshot includes the readiness and retry-gap fixes from launch; later offline reports/tools are outside its loaded module graph. A running process or completed duration does not establish continuous chain coverage.

| Acceptance item | Disposition |
|---|---|
| Original and new regression suite | 299 tests, 299 passed, 0 failed |
| Final supervisor exercised in intended explicit deployment path | Delivered and exercised; legacy default selection preserved |
| Current Pump compatibility | UNMET: deployment/global blocked pending complete reviewed proof |
| Unverified variants fail closed | Enforced; no new variant enabled |
| Continuous event coverage | UNMET: unresolved gap/quarantine; no independent completeness proof |
| Quarantine ownership/accounting | Retained; historical copy reviewed, current stopped WAL reconciled separately |
| Authenticated independent provider agreement | UNMET: infrastructure/operator attribution unavailable |
| Genuine fresh paper entry and exit | UNMET: zero qualifying fills; no artificial inventory or freshness |
| 7,200-second monotonic process target | MET |
| Continuous-coverage monitoring acceptance | UNMET regardless of process duration |
| Signing, broadcast or spending | Disabled; no funded actions |
| Performance attribution | UNRESOLVED: retained negative signals and experimental limitations disclosed |

Required findings: [Pump deployment](pump-deployment-compatibility.md), [variant coverage](protocol-variant-coverage.md), [supervisor validation](websocket-supervisor-validation.md), [gap/quarantine reconciliation](gap-and-quarantine-reconciliation.md), [providers](independent-provider-validation.md), [paper results](end-to-end-paper-results.md), [long monitoring](long-duration-monitoring.md), [performance](performance-root-cause.md), [security](security-validation.md), [funded blockers](remaining-funded-trading-blockers.md).
