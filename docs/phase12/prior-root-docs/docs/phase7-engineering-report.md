# Phase 7 engineering report

Delivered 2026-11-10: actual unsigned sell validation for four restricted protocol routes, persistent intent-database reliability checks, deterministic offline reconciliation, stricter sell accounting, an opt-in buy/sell simulation paper gate, measured performance investigation and operational/security evidence. **Live mode remains disabled. No transaction was signed, broadcast, funded or spent.**

The implementation is reviewable and tested; full production readiness is **not complete**. Fresh eligible launch-to-paper integration, multi-hour mainnet soak, independent provider/deployment validation, dependency remediation and exact historical performance attribution remain open. No unmeasured optimization or real fill is claimed.

## Repository audit and preservation

Phase 6 supplied 209 passing tests, four pinned unsigned builders, actual buy simulation captures, serialized-message policy, integer market quotes and a separate PostgreSQL intent ledger. Sell builders existed but lacked actual sell evidence. Native sell-effect accounting was incomplete; audit rows were mutable by the application table owner, lease renewal bypassed the synchronous transaction wrapper, and migration source checksums were absent. Existing worker WAL, dashboard, paper controls and signed legacy utilities were reusable and retained.

The Phase 7 starting snapshot and hashes are preserved. **All 38 original files under tests (including fixtures/helpers) are byte-identical**, and all original 209 tests remain in the expanded passing suite. Package lock/dependency versions, original ingestion/WAL/Store/engine/model modules, dashboard source and safety controls remain unchanged. Changes extend simulation accounting and intent migration/renewal; add isolated reconciliation/economics, read-only diagnostics and a gated paper wrapper; and package SQL assets in the existing build. The default server has no new execution or signer route.

## Actual sell simulations

| Supported restricted route | Actual result | CU consumed | Native output before network fee | Network fee |
|---|---|---:|---:|---:|
| Pump native curve | Success | 57,010 | 9,750 lamports | 6,000 lamports |
| PumpSwap native quote | Success | 95,490 | 41,332 lamports | 6,000 lamports |
| Raydium CPMM USDC→SOL | Success | 45,802 | 597 lamports | 6,000 lamports |
| Meteora DLMM native quote | Success | 50,871 | 1,076,925 lamports | 6,000 lamports |

These are separate actual finalized `simulateTransaction` captures using verified existing public token inventory and zero signatures. They are neither authorized transactions nor future execution guarantees. Raydium's small actual inventory makes this diagnostic economically negative after fees; it is not a trading opportunity. All four recompute exact token debit, quote output, returned fee and native/WSOL effects with zero unexplained difference. Actual recipient deltas are retained where available; complete LP/platform/protocol fee decomposition remains limited as documented.

Initial HTTP429, timeout, RPC -32015, expired/unsupported deployment and insufficient-liquidity attempts remain intact. No balances or signer permissions were manufactured to force success. [Sell validation](phase7/sell-simulation-validation.md) documents supported contexts, inputs/minOut, custody, fees, program logs, account bytes, provenance and failures; [evidence-summary.json](phase7/evidence-summary.json) indexes capture SHA-256 and current offline accounting.

## Durable ownership and reconciliation

The separate persistent PostgreSQL 16 validation deployment is retained under a private marker-owned OS-state path, stopped after tests and reopened across invocations. It does not use the application DATABASE_URL. Actual fsync, full-page writes and synchronous commits are enabled. Four independent executor processes race duplicate reservation and ownership: one identity/reservation and one owner survive.

An additive checksummed migration adds audit/intent deletion/truncation guards, owner-change fence enforcement and trigger-only audit writing. Renewal now uses the bounded synchronous transaction wrapper. Restricted runtime-role tests deny audit/migration/DDL mutation. Immediate database stop/restart preserves reservation/fence state; unavailable connections fail closed; expiry increments fences and retains uncertainty holds; explicit manual cancellation releases both wallet/strategy reservations once. A consistent PostgreSQL custom backup restores identity/audit/budgets to a different database. [Database reliability](phase7/database-reliability.md) includes migration, role, rollback and restoration boundaries.

The new isolated replay model preserves original intent/packet/signature identity through injected attempt, timeout, unknown status, failure, confirmation/finality, rollback, expiry, provider conflict and restart. A second simulated spending attempt is forbidden, including after expiration. Its real public creation transaction anchors identity only; outcome/status/provider events are explicitly offline injections. It has no transport and cannot broadcast. SQL intents still contain no reachable signed/submitted states; WAL completion cannot authorize signing. See [execution reconciliation](phase7/execution-reconciliation.md).

Exact integer economics reconciles owner balance postings, native/token changes, fees/rent/WSOL/refunds, failed atomic transaction network charges and partial cost/dust. Retained actual Phase 6 buys and new Phase 7 sells reconcile. Deterministic economic edge tests are distinct from actual on-chain failure receipts or independent fee decomposition.

## Fresh launch-to-paper experiment

A **90-second** read-only Pump monitor received **7,561 notifications**, selected six CreateV2 candidates, verified five creations and recorded five durable paper decisions. **Zero paper trades** occurred. Four decisions rejected curve identity/supply/decimals evidence; the other failed owner concentration and liquidity thresholds. One candidate failed original instruction/event verification. Reason counts overlap and are grouped separately for verification versus paper decisions in the summary. One RPC error remains recorded.

The opt-in `SimulationGatedPaper` wrapper first preserves existing mandatory risk checks. A candidate passing them must have actual owned inventory for its linked sell amount, pass actual buy and sell simulations with consistent accounting, then pass original freshness/risk/strategy controls again. Failures record a durable paper rejection. No candidate reached this gate during the bounded run; **fresh event → linked simulations → eligible paper entry remains unproven**. The default dashboard/server behavior is unchanged. A multi-hour mainnet soak was not run; ninety seconds does not establish production reliability.

## Performance investigation

Five fixed-seed randomized interleaved repetitions per implementation/scenario (30 jobs) reran the original Phase 6 comparison against its preserved Phase 5 source. This is a diagnosis, **not a Phase 7 speedup claim**. All offered events completed, with zero logical duplicates/refusals and preserved fsync acknowledgements.

| Matched diagnostic | Before events/s | Current events/s | Sample difference |
|---|---:|---:|---:|
| Durable burst | 793.7 | 975.9 | +23.0% |
| Mixed history/live | 3,864.5 | 5,700.9 | +47.5% |
| Sustained paced stream | 2,996.4 | 2,963.1 | −1.1% |

The original −36.0/−7.0/−2.9% results remain historical evidence. They did not reproduce as stable negative implementation deltas. Durable wall time correlates with fsync group count (r=.992 original / .999 new), while the slowest original run did not have a slower individual median fsync. Scheduling/batch fragmentation is a measured bottleneck; its exact external trigger remains unproven. JSON profiling perturbs batching, and a separate four-ms batching experiment did not improve the median, so no durability/batching default was changed. Sustained results have an imposed 320-ms pacing floor; the new difference is 3.75 ms.

Raw CPU, sampled memory, GC, event-loop delay, queues/backlog, context switches, fsync groups and latencies are retained. Worker CPU/GC and continuous host allocation/contention attribution are incomplete. PostgreSQL/market parsing/RPC are absent from the ingestion workload, so cannot directly explain its regression. [Performance investigation](phase7/performance-root-cause.md) provides p50/p95/p99, separate profiling/sensitivity artifacts, source/harness hashes and remedies/remaining experiments. No causality or production SLO is inferred from sample deltas.

The final concurrent full-suite run measured 50 actual local PostgreSQL COMMIT acknowledgements, one SQL client: p50/p95/p99 **1.011/2.801/3.859 ms**, max 4.504 ms. This is COMMIT-only timing during other test activity, not full transaction latency or remote/HA performance. Actual RPC tails are small diagnostic samples, not production p99 guarantees.

## Validation and operational review

| Validation | Actual outcome |
|---|---|
| Complete regression suite | **241 pass**, zero failed/skipped, 31.591 seconds |
| Original test preservation | 209 retained; all 38 original test/fixture/helper files unchanged |
| Backend/frontend typecheck | Pass |
| Existing production build | Pass; both SQL assets copied beside compiled ledger |
| Isolated container smoke | Pass: health, dashboard, bearer authorization, SQL assets, rejected MODE=live |
| Actual unsigned sells | Four supported contexts succeed; zero submitted/signed |
| Persistent database / offline recovery | Fault tests pass; retained deployment and logical restore checked |
| Dependency audit | Six unresolved findings: three high, three moderate |

Container smoke mounts current built artifacts read-only into the existing Node22 image, with user1000, no capabilities, network disabled and private tmpfs state. It does not rebuild an application image, deploy full Compose or validate production storage/network identity. Build output and smoke evidence are retained.

The [security review](phase7/security-review.md) covers database permissions, API/service authentication boundaries, dependency findings, public-data logging, secret isolation, DoS limits, shutdown/outage and backup consistency. Its independent signer threat model and typed request contract are **design only**; no signer was implemented or connected. [Remaining funded blockers](phase7/remaining-funded-trading-blockers.md) include dependency remediation, external review, independent providers, actual custody/signature settlement, production database operations, distributed emergency control and separate explicit funded authorization.

All required implementation/report/artifact categories are supplied through the [Phase 7 index](phase7/README.md). Acceptance remains partial where production validation, fresh eligible paper entry, multi-hour soak and historical causal attribution lack evidence. Unsupported variants and mandatory unknown/stale signals continue failing closed.
