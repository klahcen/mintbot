# Phase 7 — reliability and read-only execution research

[Engineering report](../phase7-engineering-report.md) · [sell evidence](sell-simulation-validation.md) · [database reliability](database-reliability.md) · [performance investigation](performance-root-cause.md) · [offline reconciliation](execution-reconciliation.md) · [security / future signer design](security-review.md) · [funded blockers](remaining-funded-trading-blockers.md).

Live mode remains disabled. Existing dashboard, WAL and paper behavior are preserved. New automatic paper gating is used only by the explicit Phase 7 monitoring tool; default server operation is unchanged. No private keys, signer endpoint, broadcast or funded operation is introduced.

## Reproduce local validation

```sh
npm test
npm run typecheck
npm run build
python3 scripts/phase7-container-smoke.py
npm run validate:persistent-intents
npm run replay:execution
```

Node >=20.19 and existing locked dependencies are required. Persistent DB fault tests require PostgreSQL16 binaries and a non-root Unix user. They retain a marker-owned private deployment under `$HOME/.local/state/mintbot-phase7-postgres`, stop it after use and never read application DATABASE_URL. Do not run concurrent copies of the persistent test: its single deployment has exclusive local ownership. See database documentation before choosing production roles or storage.

`npm run build` now copies both SQL migration assets beside compiled intent-ledger.js, then preserves the existing frontend build. Container smoke uses the existing Node22 image with current dist/node_modules/config/frontend artifacts mounted read-only, private tmpfs state, user1000, no capabilities and network disabled. It validates health, dashboard, API authorization, SQL packaging and rejection of MODE=live. It does not rebuild an application image or deploy Compose.

## Actual network diagnostics

```sh
npm run validate:sell-simulation -- --run --venues pump,pumpswap,raydium-cpmm,meteora-dlmm --output docs/phase7/new-sells.json
npm run validate:phase7-mainnet -- --run --seconds 90 --max-candidates 6 --output docs/phase7/new-monitor
```

Public RPC is read-only and can rate-limit/time out. New output paths preserve prior captures. Holder discovery uses public addresses, current inventory and native fee/rent balances; neither a recorded public account nor unsigned simulation authorizes spending. No balance is injected to force a sell. The monitor preserves mandatory freshness/risk/strategy rules and requires both successful simulations for an eligible candidate. It does not promise an entry.

## Artifact interpretation

`after-tests.log`: complete241-test regression suite. `typecheck.log`, `build.log`, `container-smoke.json/log`: current validation. `evidence-summary.json`: offline index of successful actual sell RPC captures and mainnet rejection counts. `sells-*.json/log`: real successes and failures, immutable raw context. `mainnet-bounded/`: actual90-second monitoring WAL, paper ledger and evidence. `persistent-database-validation.json/log`: actual retained PG16 settings/races/recovery/restore; final full suite refreshes its measurement JSON. `reconciliation-replay.json`: explicitly offline injected statuses, not actual broadcasts. `matched-regression.json`, `profiled-regression.json`, `batch-delay-experiment.json` and source/harness hashes: separate matched/profiling/sensitivity workloads, never chain latency. Previous Phase6 source/archive/artifacts are preserved.

Run `python3 scripts/phase7-performance-report.py` and `node --import tsx scripts/phase7-evidence-summary.ts` to regenerate summaries from retained raw evidence. Detailed benchmark commands are in performance-root-cause.md. Rerunning tests/benchmarks refreshes their named outputs; preserve existing measurement files before an intentional new measurement. Hash manifests and the Phase7 starting-source archive identify the reviewed population.

Neither a multi-hour mainnet soak, full production security validation, independent provider agreement nor independently authorized funded readiness is claimed.
