# Phase 10 evidence and reproduction

Start with [the engineering report](../phase10-engineering-report.md). Live signing/broadcasting/funding remain disabled. The current Pump upgrade/global remain blocked. All records distinguish diagnostic fixtures, actual network observations and unmet acceptance items.

```sh
npm run typecheck
npm run build
python3 scripts/phase9-regression-validation.py --output docs/phase10/new-validation-directory
npm run research:monitor -- --run --seconds 7200 --max-candidates 120 --output docs/phase10/new-mainnet-directory
# Explicit operational overlay; set required normal app/DB configuration first:
RESEARCH_RUN_NAME=unique-new-run docker compose -f compose.yaml -f compose.research.yaml --profile research up
# Immutable new capture directories/paths are required:
node --import tsx scripts/phase10-pump-evidence.ts --run --output-dir docs/phase10/new-pump-capture
node --import tsx scripts/phase10-reconciliation.ts --output docs/phase10/new-reconciliation.json
node --import tsx scripts/phase10-variant-review.ts --output docs/phase10/new-variant-review.json
python3 scripts/phase10-report.py
```

The final validated run is `runtime/mainnet-validated`; its copied compiled source and manifest are sealed before import. `runtime/mainnet` and `runtime/mainnet-final` are separate short calibrations and never count toward the final window. `evidence.json` is written after stop, drain, flush and ledger reload; progress files remain interim. Container health is not independent chain agreement. A host clock discontinuity terminates; unobserved time is never added to coverage.

`phase10-quarantine-review.ts --apply --journal <stopped-WAL> --plan <review-plan> --output <new-audit-output>` requires exclusive offline writer ownership and expected fingerprints. Preserve originals and use a forensic copy for diagnosis. Retain/retry preserves payload identity/time; reviewed retries reopen a gap and never authorize an entry. Do not point an old writer at reviewed WALs. No API silently deletes pending work.

The original Phase9 artifact hash manifest, before source archive, root-document copies and current integration differences are retained here. SDK reference locks are isolated from production. Performance commands and exact archived roots are recorded in the command JSON files; reconstruct temporary roots from the source archives after host restart, and link compatible shared dependencies explicitly. Profiling/strace populations have overhead and are separate from unprofiled throughput. No speedup or stable historical root cause is claimed.

The report generator reads retained snapshots and never turns missing final evidence into a passing duration. Independent authenticated providers and a complete current Pump source/financial proof chain are not available. No real paper trade is invented to satisfy acceptance.
