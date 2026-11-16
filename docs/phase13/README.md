# Phase 13 evidence and reproduction

The [engineering report](../phase13-engineering-report.md) and [machine-readable assessment](validation-summary.json) distinguish source delivery, elapsed monitoring time, required coverage and genuine paper lifecycle acceptance. No diagnostic or new run automatically grants an epoch or trade authorization.

| Evidence | Location |
|---|---|
| Original Phase 12 source/documents | `source-at-start-sha256.json`, `source-at-start.tar.gz`, `prior-root-docs/` |
| Immutable Phase 11/12 artifact boundary | `prior-artifact-sha256.json` |
| Byte-level identity origin | `runtime/identity-probe/wire-identity.jsonl`, `identity-probe-analysis.json`, `runtime/mainnet-validated/wire-identity.jsonl*`, `identity-mainnet-analysis.json` |
| Clock and sleep inhibition | `timing/`, `mainnet-validated-stable-monitor-command.json`, `mainnet-validated-stable-monitor-exit.json` |
| Single primary run | `runtime/mainnet-validated/evidence.json`, `validated-runtime-launch.json`, `mainnet-validated-runtime-container-inspect.json`, original WAL and runtime source snapshot |
| Complete selected funnel | `candidate-outcomes.json`, `postrun-creation-verification.json` |
| Coverage and refusal analysis | `runtime-reconciliation.json`, `run-forensics.json`, `coverage-history.json` |
| Current protocol and SDK evidence | `official/`, `pump-deployment/`, `current-network/`, `pumpswap-contract.json`, `current-protocol-assessment.json`, `builder-reference.json`, `quote-reference.json` |
| Raydium/Meteora | `creation-validation.json`, `dlmm-discovery/`, `venue-delivery-check.json`, `venue-controls.json`, post-run evidence |
| Public provider comparisons | `provider-validation.json`, `provider-history.json` |
| Actual unsigned diagnostics | `current-buy-simulations.json`, `current-sell-simulations.json`, simulation command records |
| Final image/API/owner/stop checks | `production-delivery-smoke.json`, `final-release-probe-stop-owner-smoke.json` |
| Regression, PostgreSQL and build | `delivery-validation/`, `clean-delivery-validation/`, Docker and earlier build/test logs |
| Metric populations and runtime integrity | `performance-summary.json`, `loaded-runtime-coherence.json` |
| Reviewable delivery | `delivery-source.diff`, `delivery-source-sha256.json`, `delivery-artifact-sha256.json` |

Raw public envelopes carry original byte length/SHA-256 and sanitized base64. Only records explicitly marked `byteExact:true` enter the joined byte-level proof. URL/credential redaction or byte clipping makes that flag false. The diagnostic corpus is bounded and capture drops remain explicit. Ordinary normalized observations and refusal logs retain bounded rotation/tombstone metadata; their availability is not claimed to be an exhaustive wire archive. Missing predecessors or rotated payloads remain unknown. Local hash manifests are tamper evidence, not a remote notarization or write-once storage guarantee.

The first 300-second observer completed, but its one-off outer launcher had an exit-handling TypeError; both its evidence and failed log remain. `timing/preflight-300-validated/` is the corrected independent run. The 120-second identity diagnostic predates the final verification scheduler and creation-hint wire capture. Its copied source remains exact. The final primary and final owner probe use the delivered compiled core; no hot reload or concatenation is claimed.

Run from the repository root under Node 22. Outputs are exclusive: choose fresh filenames/directories when rerunning diagnostics. Current chain state, quotas and history availability can change.

```sh
npm ci
npm run typecheck
npm run build
python3 scripts/phase9-regression-validation.py --output docs/phase13-recheck-tests
python3 tests/test_phase12_host_health.py
npm audit --json
docker build --no-cache -t mintbot:phase13-readonly .
```

The regression wrapper preserves summaries refreshed by unchanged legacy database helpers and retains new outputs separately. The complete suite executes private PostgreSQL crash/restart, SCRAM rotation and backup/restore checks; no production database is attached to the monitor.

To repeat timing and monitoring, create a fresh persistent clock container and fresh evidence root. The long preflight preserves the existing requirement that its duration cover the intended monitoring budget. A 300-second probe alone cannot authorize 1,800 seconds.

```sh
docker run -d --name mintbot-clock-recheck --read-only --network none --cap-drop ALL --security-opt no-new-privileges node:22-bookworm-slim node -e 'setInterval(()=>{},1000)'
systemd-inhibit --what=sleep:idle --mode=block python3 scripts/phase12-host-health.py --seconds 300 --container mintbot-clock-recheck --output docs/phase13-recheck/preflight-300
systemd-inhibit --what=sleep:idle --mode=block python3 scripts/phase12-host-health.py --seconds 1800 --container mintbot-clock-recheck --output docs/phase13-recheck/preflight-1800
SOLANA_RPC_URL=https://solana-rpc.publicnode.com SOLANA_WS_URL=wss://solana-rpc.publicnode.com SOLANA_SECONDARY_RPC_URL=https://api.mainnet-beta.solana.com SOLANA_SECONDARY_WS_URL=wss://api.mainnet-beta.solana.com systemd-inhibit --what=sleep:idle --mode=block python3 scripts/phase12-launch-monitor.py --seconds 1800 --clock-directory docs/phase13-recheck/preflight-1800 --output-root docs/phase13-recheck --image mintbot:phase13-readonly --run-name mainnet --container-name mintbot-phase13-recheck --launch-record runtime-launch.json --history docs/phase11/coverage-history.json,docs/phase11/phase11-coverage-history.json,docs/phase12/coverage-history.json,docs/phase12/final-coverage-history.json --identity-diagnostics --bounded-verification --wait
```

The launch wrapper's `--wait` keeps the temporary inhibitor alive through the finite process. It preserves sticky stop, exclusive owner, fsynced WAL, strict finalized verification and unapproved epoch status. Do not reuse run directories or reset history to obtain a pass. Record a separate concurrent clock observer as in `timing/during-mainnet-validated-command.json`; periods are never added to the primary supervisor duration.

Read-only protocol and provider diagnostics can be repeated into new paths:

```sh
python3 scripts/phase12-official-evidence.py --output /tmp/mintbot-official-new
node --import tsx scripts/phase10-pump-evidence.ts --run --output-dir /tmp/mintbot-pump-new
node --import tsx scripts/phase11-current-network.ts --run --output /tmp/mintbot-network-new
node --import tsx scripts/phase12-pumpswap-contract.ts --run --output /tmp/mintbot-swap-new.json
node --import tsx scripts/phase13-creation-validation.ts --run --output /tmp/mintbot-creations-new.json
node --import tsx scripts/phase13-provider-history.ts --run --output /tmp/mintbot-providers-new.json
python3 scripts/phase13-identity-report.py --run-directory docs/phase13/runtime/mainnet --output /tmp/mintbot-wire-analysis-new.json
```

The existing SDK reference commands depend on separately pinned temporary reference installations; exact package versions/integrities are retained in `builder-reference.json` and `quote-reference.json`. They are not application dependency upgrades. Unsigned public-inventory simulations are diagnostics with signature verification disabled; they never sign, submit, fund or create a fresh paper position.

After final evidence and derived artifacts exist, `python3 scripts/phase13-report.py` regenerates reports and `python3 scripts/phase13-final-validation.py` verifies integrity, copied/clean compiled core and links, then seals delivery manifests. Neither command can approve a provider, coverage epoch or trade.

The initial `runtime/mainnet/` container failed during the public RPC genesis bootstrap before a supervisor started. Its launch, copied modules, ledger and logs are retained and excluded from duration. The single primary experiment is `runtime/mainnet-validated/`, using PublicNode as primary and Solana public RPC as secondary. This endpoint change is public transport configuration, not independent-provider approval.
