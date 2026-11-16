# Phase 9 evidence and reproduction

Start with [the engineering report](../phase9-engineering-report.md). All network actions are bounded, explicit and read-only; the server still rejects live mode.

```sh
npm test
npm run typecheck
npm run build
node --import tsx scripts/phase9-mainnet.ts --run --seconds 7200 --max-candidates 120 --output docs/phase9/new-run-directory
node --import tsx scripts/phase9-market-diagnostics.ts --run --output docs/phase9/new-diagnostics.json
node --import tsx scripts/phase9-protocol-review.ts --run --output-dir docs/phase9/new-protocol-review
node --import tsx scripts/phase9-provider-evidence.ts --run --output docs/phase9/new-provider-evidence.json
node --import tsx scripts/phase9-performance-benchmark.ts --before-root /tmp/mintbot-phase9-before --runs 3 --output docs/phase9/new-performance.json
```

The mainnet CLI requires a new ledger directory. Default service endpoints are Solana public and PublicNode; environment endpoint configuration does not prove independent operators. Progress files are interim only; `evidence.json` is emitted after stopping, draining, fsync and ledger reload. No operator-independence claims are fabricated. All automatic retry/page/transaction/time/storage populations are bounded. SIGINT/SIGTERM request graceful stop in the final controller; partial/failed runs must not be counted as the requested full window.

Render final reports with `python3 scripts/phase9-report.py --run-dir <directory-under-docs/phase9> --validation-dir <validation-directory-under-docs/phase9>`. Without final evidence, status is interrupted/unfinalized unless `--running` explicitly asserts an active process. A final artifact only satisfies the requested window when supervisor elapsed time reaches the requested duration.

Use `python3 scripts/phase9-regression-validation.py --output docs/phase9/new-validation-directory` to preserve older phase artifacts that legacy tests refresh; it copies new helper outputs here before restoring originals. The before source tarball can be extracted to a separate directory for comparison; link compatible dependencies explicitly and retain the shared-dependency limitation. The matching A/A harness-at-run and its stale-load-label correction are retained.

Early failed install, smoke/build attempts and the database probe overlapping destructive fault tests are retained as diagnostics. They are not successful validation. Source/fixture hashes, actual final gates and preservation records distinguish those attempts from release evidence. The research process source was snapshotted before later corrections; do not imply it hot-loaded edits.

Current finalized report reproduction:

```sh
python3 scripts/phase9-report.py --run-dir mainnet-2026-11-13 --validation-dir revalidation-2026-11-13 --test-log clock-release/after-tests.log
```

Current validation and limitations are recorded in [validation-summary.json](revalidation-2026-11-13/validation-summary.json). The extended attempt was interrupted by a host wall/monotonic discontinuity; its two-hour monitored target remains unmet.
