# Phase 12 evidence index

Start with the [engineering report](../phase12-engineering-report.md) and [machine-readable verdict](validation-summary.json). Full phase acceptance is false. Existing artifacts are preserved, including failed runs. Hash manifests are local tamper-evidence, not an external notarization or write-once storage guarantee.

| Evidence population | Primary artifacts |
|---|---|
| Starting source and retained Phase 11 evidence | `source-at-start-sha256.json`, `source-at-start.tar.gz`, `prior-artifact-sha256.json`, `prior-root-docs/` |
| Completion boundary | `completion-validation/retained-phase12-sha256.json` |
| Clocks/suspension | `historical-clock-correlation.json`, `clock-stability/`, `clock-during-mainnet/`, `clock-final-preflight/`, `clock-final-mainnet/`, `clock-operations/`, `clock-completion/` |
| Pump/official interfaces | `pump-deployment-release/`, `global-layout-review.json`, `official/`, `official-supplement/`, `current-network-release/` |
| Observed PumpSwap variant | `pumpswap-contract.json`, `pumpswap-contract-review.json` |
| Creation coverage | `creation-coverage-final/`, `postrun-creation-verification.json`, `raydium-current-creation-fixture.json` |
| Provider/history/forensics | `provider-validation.json`, `provider-method-evidence.json`, `phase11-forensics.json`, `identity-collision-review.json`, `final-run-forensics.json`, `final-coverage-history.json` |
| Distinct mainnet captures | `runtime/mainnet/`, `runtime/final-mainnet/`, each with original observations, WAL, evidence and runtime source snapshots |
| Outcome funnels | `candidate-outcomes.json`, `final-candidate-outcomes.json` |
| Unsigned diagnostics | `builder-reference.json`, `quote-reference.json`, `current-buy-simulations.json`, `current-sell-simulations.json` |
| Final actual-container controls | `final-release-probe-stop-owner-smoke.json`, `production-delivery-smoke.json`, `host-health-cli-guards.json` |
| Performance | `performance-node22.json`, `performance-final-node22.json`, `performance-instrumented-final.json`, `worker-cpu-final.jsonl`, `worker-cpu-analysis.json` |
| Retained failures and DB faults | `validation/`, `final-validation/`, `release-validation/`, build logs and all earlier captures |
| Fresh delivery checks | `completion-validation/`, `loaded-runtime-coherence.json`, `delivery-source-sha256.json`, `delivery-artifact-sha256.json` |

Run commands from the repository root under Node 22. Use **new** output paths and fresh container names. Network state changes; reruns cannot recreate identical banks or guarantee an eligible candidate. Read-only diagnostic simulations impersonate public addresses with signature verification disabled; they never submit transactions.

```sh
npm test
python3 tests/test_phase12_host_health.py
npm run typecheck
npm run build
npm audit --json
python3 scripts/phase12-final-validation.py
node --import tsx scripts/phase12-creation-coverage.ts --run --output /tmp/mintbot-phase12-venues-new
node --import tsx scripts/phase12-pumpswap-contract.ts --run --output /tmp/mintbot-phase12-pumpswap-new.json
python3 scripts/phase12-host-health.py --seconds 300 --container mintbot-phase12-clock --output /tmp/mintbot-phase12-clock-new
```

To launch a new bounded monitoring window, first complete the same-duration timing preflight, then use unique output/launch/container names. Retained histories stay mandatory; the draft policy grants no eligibility:

```sh
python3 scripts/phase12-launch-monitor.py --seconds 300 --clock-directory /tmp/mintbot-phase12-clock-new --run-name independent-new-window --container-name mintbot-phase12-new-window --launch-record new-window-launch.json --history docs/phase11/coverage-history.json,docs/phase11/phase11-coverage-history.json,docs/phase12/final-coverage-history.json
```

The launcher expects the existing `mintbot:phase12-readonly` image; its exact original Docker commands and image identities are in the launch/build artifacts. `performance-final-node22-command.json` records the exact paired benchmark invocation and filesystem binding. Old temporary baseline paths may need reconstruction from `source-at-start.tar.gz`; shared dependency lock and Node version must match. Never overwrite original evidence to rerun a benchmark. Signed negative reserve diagnostics and official publication do not enable that variant.
