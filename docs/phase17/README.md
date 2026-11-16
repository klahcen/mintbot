# Phase 17 evidence

Start with [the engineering report](../phase17-engineering-report.md) and [final validation summary](validation-summary.json).

- `current-probe-final/`: final bounded current-chain diagnostic capture; endpoint names are primary/secondary, not secret URLs. Read timestamps and scope before interpreting fields. No observation authorizes execution.
- `deployment-headers.json`: actual finalized loader headers and reviewed/observed deployment slots for both services. Pins remain unchanged.
- `history-controls.json`: original gap anchor and retained v0 controls. Successful selected fetches do not close an interval; null remains unavailable.
- `signed-wire-inspection.json`: corrected local inspection of real signed evidence from the earlier probe. The earlier capture's false header-order rejection is retained rather than overwritten.
- `coverage-review.json`: hashes and summaries of retained overlapping histories/epochs; no history or review was changed.
- `final-validation/`: clean isolated Node22 install, typechecks, build, full tests, Python clock tests and dependency audit. Database-summary writes were isolated.
- `preservation-check.json`, `tested-source-sha256.json`, `credential-redaction-check.json`: release checks.
- `current-probe/`, `current-probe-2/`, `release-validation/` and preliminary typecheck logs retain initial errors and intermediate evidence. They are superseded for release conclusions by the final results, not deleted.

Reproduce read-only diagnostics from the repository root with Node22 and `MODE=paper`. Configure services through the existing secret/config mechanism; never paste credentials into artifacts. Choose unused output paths:

```sh
node --import tsx scripts/phase17-market-validation.ts --run --output docs/phase17/operator-probe-NEW
node --import tsx scripts/phase17-history-controls.ts --run --output docs/phase17/operator-history-NEW.json
python3 scripts/phase15-validation.py --output-root docs/phase17/operator-validation-NEW
```

The deployment header artifact includes its own small reproduction script, which refuses to overwrite its fixed output file; use a new output filename in a separately retained copy for another run. No diagnostic command opens a trading store, signs, submits, resolves coverage, approves a provider or enables a protocol variant. Fresh market values may differ from the retained samples. Verification-only signed-wire results always carry `executionEligible:false`.
