# Phase 6 — unsigned swap simulation research

Status: 2026-11-10. [Engineering report](../phase6-engineering-report.md), [builders](swap-builders.md), [simulation evidence](simulation-validation.md), [intent ledger](execution-intent-ledger.md), [security review](execution-security-review.md), [measured performance](performance-comparison.md), [funded blockers](funded-trading-blockers.md).

The existing dashboard, WAL, synthetic replay and real-market paper engine remain. New code is an explicit opt-in library/CLI in `src/simulation`; it is not automatically connected to the server or launch feed. Live mode stays disabled. No application/container rebuild is required for these source tools.

## Local validation

Use existing locked dependencies, Node >=20.19 and PostgreSQL 16 binaries at `/usr/lib/postgresql/16/bin` (the validation helper expects a non-root Unix user). Tests start private temporary Unix-socket clusters with file durability enabled; they do not use the application database. Do not run these helpers as a production database service.

```sh
npm test
npm run typecheck
npm run benchmark:simulation
npm run benchmark:phase6 -- --runs 3
```

Before/after reproduction requires `/tmp/mintbot-phase6-before`, or extraction of `before-source.tar.gz` to that directory and a symlink to this workspace's existing `node_modules`. Retain raw outputs before rerunning benchmark/discovery tools, which write their named results. The mainnet simulator refuses an existing output path and defaults to a timestamped filename.

The independent SDK comparison deliberately uses isolated reference installations, not new runtime dependencies:

```sh
npm install --prefix /tmp/mintbot-pump-reference @pump-fun/pump-sdk@4.3.1 @pump-fun/pump-swap-sdk@2.2.0
npm install --prefix /tmp/mintbot-phase5-reference @raydium-io/raydium-sdk-v2@0.2.84-alpha @meteora-ag/dlmm@1.9.14
npm run validate:phase6-builders
```

`builder-reference.json` records package integrity, version and entry hash. Those packages' transitive dependencies are reference tooling and must not be promoted into the trading runtime without review.

Actual mainnet read-only simulation is explicit:

```sh
npm run validate:swap-simulation -- --run --venues raydium-cpmm --output docs/phase6/new-run.json
```

A public payer override uses `SIMULATION_PUBLIC_PAYER`; no secret/signature is accepted. Public addresses, pools and program versions can change or become unsuitable, and public RPC may timeout/rate-limit. Unsupported or stale evidence rejects. The tool exports its private SQL audit and verifies restart, then deletes its disposable cluster. Production use of the library needs a dedicated persistent Pool, database controls, reconciliation and emergency-stop callback.

## Artifact interpretation

`before-tests.log`: 168 passing baseline tests. `after-tests.log`: 209 passing tests, no skips. `typecheck.log`: backend/frontend checks. `builder-reference.json`: eight buy/sell instruction/meta matches. `mainnet-verified.json`: current successful Pump/PumpSwap/Raydium simulations and DLMM 429. `mainnet-dlmm-current-pool.json`: earlier successful DLMM simulation. Earlier failed attempts are retained separately. UNIT execution accounts/clocks in offline benchmarks are explicitly distinguished from raw current-chain captures. No mainnet paper fill, funded trade or measured production improvement is inferred.
