# Validation record — 2026-11-03

This records the initial delivery. Subsequent instrumentation, source-only checks, and the expanded 50-test suite are recorded in [the Phase 1 latency report](phase1-latency-report.md).

The result is a functional local paper prototype with separately bounded read-only chain integrations. This record does not validate funded trading or all requested production capabilities; see [phase status](phase-status.md).

| Check | Observed result | Practical scope |
| --- | --- | --- |
| `npm test` | **34 passed, 0 failed** | Strategy/risk, concurrency, partial-sale accounting, mandatory unknown evidence, stale prices, delayed rechecks, timed exits, fee failures/circuit breaker, wallet encryption regression, submission/confirmation mocks, chain decoding, historical replay, HTTP auth and restart |
| `npm run build` | Passed | Strict backend TypeScript compilation and React/Vite production bundle |
| `npm run typecheck` | Passed before final additions; final additions compile in `npm run build` | Root and dashboard TypeScript |
| `docker build -t mintbot:local .` | Passed | Clean lockfile install and production build using Node 22; non-root runtime |
| `python3 scripts/container-smoke.py` | Passed | Isolated Compose app + PostgreSQL; static dashboard/security header, auth rejection, synthetic buy/TP, actual database audit row, restart retaining stopped kill latch; temporary resources removed |
| SDK public RPC read | Passed | Captured finalized mainnet swap retrieved with actual patched web3/Jayson client; fee, slot, version and CPI inventory matched fixture |
| Public program account inspection | Passed | All four registry addresses executable at captured finalized slot; not an IDL/bytecode compatibility attestation |
| Synthetic simulation | Completed | [Paper replay output](paper-replay-result.json); generated buy/sell accounting, not real executions |
| Synthetic local benchmark | Completed, 1,000 events | [Recorded histogram](benchmark-result.json); in-memory cloning/validation/decisions, mostly rejects after position cap; no RPC, disk, signing or landing measurement |
| Dependency audit | **6 affected packages: 3 high, 3 moderate** | [Raw report](dependency-audit.json), underlying legacy bigint/Jayson-stream dependency issues; unresolved and documented in security review |
| Browser visual/interactivity QA | Not performed | No browser-control/preview tool available; frontend compilation and HTTP serving checked, not screenshots or rendered responsiveness |
| Real WebSocket soak/load test | Not performed | Fake-socket reconnect/dedupe tests do not establish public-provider reliability or current event-layout coverage |
| Devnet/funded mainnet swaps, Jito | Not performed | No funds, signing service, swap route or Jito submission enabled |
| Telegram delivery | Not performed | Optional adapter compiled; no bot credentials or destination used during validation |

The benchmark run recorded approximately **3.01 ms p50, 5.38 ms p95 and 6.20 ms p99** on Node 20.19.5/Linux for its precisely stated synthetic workload. These are one local run, not an SLO or Solana execution benchmark. Host tests ran under Node 20.19.5; the container build/runtime smoke used Node 22.

## Corrections prompted by verification

- Wallet round-trip testing found that clearing the temporary decrypted buffer also cleared bytes retained by the returned keypair. A dedicated copy fixes the aliasing; the regression now passes.
- Clean Docker install exposed an npm 11/npm 10 optional peer lockfile mismatch. Regenerating the lockfile with the container's npm resolved it; Docker's clean `npm ci` passes.
- Expanded typechecking/tests caught missing telemetry initialization and optional-result narrowing during scheduler work. Both were corrected before the final passing run.
- Source review tightened startup/commit schemas, ingress validation, replay identifiers, audit-failure reporting, bounded histories and mandatory safety signals.
- Vulnerable static middleware was removed; exact known build-asset routes are served directly. A scoped patched UUID override preserves the RPC client's used API. Remaining legacy SDK advisories are not concealed or automatically forced through incompatible upgrades.

## Reproduce container smoke

```sh
docker build -t mintbot:local .
python3 scripts/container-smoke.py
```

The script generates ephemeral credentials in memory, uses a random Compose project/loopback port, and cleans up only its own containers and volumes. Do not substitute a production Compose project or state volume.


## Performance Phase 2 — 2026-11-03

The final source suite passes 72 tests, including the original 50. Backend/tests/scripts and frontend type checks pass with no emitted application build. Focused logs, baseline source archive/manifests, checkpoint comparisons, final comparable replay JSON, runtime-workload adapter ablation and decoder cold/hot measurements are in [docs/phase2](phase2/README.md). The [engineering report](phase2-engineering-report.md) includes the observed durable throughput regression and finite recovery/deduplication limits. No application/frontend/Docker build, deployment, live RPC performance test or funded trade was performed for Phase 2. The initial extended test run had a cold API startup timeout under parallel tsx load; lazy monitor import and a four-file test concurrency bound resolved it without changing the original readiness deadline or assertions.


## Performance Phase 3 — 2026-11-06

The expanded suite passes 94 tests, including the unchanged original 72 tests; backend/tests/scripts and frontend type checks pass. Worker fsync ownership, checksums, bounded acknowledgements, SIGKILL replay, injected ENOSPC, fair scheduling, freshness, fork conflicts, four finalized protocol fixtures and exclusive raw rotation/retention are covered. Final performance runs were sequential with tests stopped; three randomized equal-population repetitions and raw CPU/memory/event-loop measurements are recorded. A separate 30-second durable observation-only soak completed all 6,020 offers once. A bounded public Python collector observed 500 actual notifications and measured a reconnect/read-only RPC sample; the Node public RPC probe timed out, so end-to-end mainnet Node verification is not claimed. No application/dashboard/container rebuild, deployment, signing permission or funded trade was performed. See [the engineering report](phase3-engineering-report.md), [durability contract](phase3/wal-durability.md) and [exact protocol coverage](phase3/protocol-coverage.md).
