# Mintbot

Phase 15: **PARTIAL / EXTERNALLY BLOCKED; acceptance unmet**. Operator-provided authenticated independent RPC services and epoch authority are absent. The reader audit records incomplete version-1 validation; no fresh research run or paper lifecycle was attempted. Genuine paper entries/exits: **0/0**; funded execution remains disabled. Preservation failed for two older database summaries during validation; details are in the report. [Phase15 report](docs/phase15-engineering-report.md), [external gate matrix](docs/external-gate-assessment.md), [reproducible evidence](docs/phase15/README.md).

Phase 14: **partial delivery; independent infrastructure and epoch authority remain externally blocked**. Adds per-venue delivery gating. Fresh Meteora controls reproduce 27,100 Solana public notifications versus zero PublicNode; five invalid zero identities remain barred from eligibility. Supported PumpSwap two-sided diagnostics succeed, while current version-1 transaction samples remain unsupported. Genuine paper entries/exits remain 0/0; funded execution stays disabled. [Phase14 report](docs/phase14-engineering-report.md), [evidence](docs/phase14/README.md), [operator prerequisites](docs/external-prerequisites.md).

Historical baseline — Phase 13: **full current-chain paper acceptance remains unmet**. The final suite passes 323/323 tests plus five Python clock tests. Incoming remote zero signatures are proven and refused. The single primary supervisor measured 1800.000 seconds; continuous required coverage remains unmet. Current observed protocol variants and independent provider/epoch approval remain blocked; paper entries/exits are 0/0. [Engineering report](docs/phase13-engineering-report.md), [evidence and commands](docs/phase13/README.md), [funded blockers](docs/remaining-funded-trading-blockers.md).



An original Solana monitoring and paper-trading research platform, with a React dashboard and a Node.js/TypeScript backend. **This is a tested paper prototype, not a production-ready funded sniper. Live mode is rejected at startup.** No private trading keys are needed to run it.

## Start

Requires Node 22 LTS (Node 20.19 was used for the initial local tests), npm and optional Docker.

```sh
npm ci
cp .env.example .env
# Put a random API_TOKEN of at least 32 characters in .env:
openssl rand -hex 32
npm run build
node --env-file=.env dist/src/server.js
```

Open http://localhost:3001. Enter your API token using **API access** in the sidebar; it remains in browser memory. Start paper mode, then use **Replay launch** to generate an explicitly synthetic event. No external token-price feed or real trades are implied by replay activity. Fresh price marks can be supplied using the paper API described in the operations guide; stale positions deliberately cannot be sold at an invented current price.

For development, load `.env` with `node --env-file=.env --import tsx src/server.ts`; run `npm --prefix frontend run dev` separately. Vite proxies `/api` to port 3001.

```sh
npm test
npm run typecheck
npm run benchmark
npm run replay
```

The `dev`, `monitor`, `replay` and `benchmark` npm scripts inherit environment variables; they do not load `.env` automatically. Use shell environment or `node --env-file=.env --import tsx scripts/monitor.ts` as needed.

## What works

- Evidence-based five-platform comparison and public mainnet transaction analysis, with primary-source citations and captured fixtures.
- WebSocket program observations for verified Pump.fun, PumpSwap, Raydium CPMM and Meteora DLMM addresses; bounded reconnects, duplicate filtering and slot tracking.
- Strict pinned Pump CreateEvent log decoding, plus finalized transaction/account verification for selected Pump, PumpSwap, Raydium CPMM and Meteora DLMM creation variants. Other layouts remain unsupported; see the [coverage matrix](docs/phase3/protocol-coverage.md).
- SPL/Token-2022 mint authority, extension and token-account concentration inspection, with missing evidence explicitly reported.
- Paper launch/pool/momentum/delayed-entry filters; mandatory token requirements, spending/reserve/position limits, circuit breaker and kill switch.
- Paper TP/SL/trailing/time/liquidity exits, partial/manual sales and net synthetic fee/slippage accounting. Exit evaluation and delayed entries run on a one-second scheduler and on explicit marks; execution still requires fresh prices.
- Authenticated dashboard, settings, positions, history, alerts and synthetic replay; optional read-only on-chain discoveries are shown separately as unscreened and unpriced.
- Atomic local snapshots, optional PostgreSQL event audit, encrypted-wallet and RPC-execution library primitives, optional configured Telegram alerts, Docker Compose and tests.

## Read-only chain access

Set `SOLANA_RPC_URL` and `SOLANA_WS_URL`. Monitoring is opt-in: `MONITOR_PROGRAMS=pump,pumpswap,raydium-cpmm,meteora-dlmm`. The API server persists raw observations to `data/observations.jsonl`; decoded discoveries remain separate from synthetic replay. An additional opt-in account-state quote and safety pipeline can evaluate finalized creations in a separate real-market paper ledger; its supported variants, strict freshness gates and limitations are documented below. Public endpoints can reject/rate-limit WebSocket traffic. Monitoring now uses bounded staged ingestion, a durable work journal, and bounded read-only reconnect backfill. Coverage gaps remain explicit when history or configured budgets are insufficient. Optional `SOLANA_SECONDARY_WS_URL` shares deduplication with the primary provider. See the [Phase 2 ingestion contract](docs/phase2/README.md).

```sh
node --env-file=.env --import tsx scripts/monitor.ts
node --env-file=.env --import tsx scripts/monitor.ts mint MINT_ADDRESS
node --env-file=.env --import tsx scripts/monitor.ts transaction SIGNATURE
```

The monitor is mainnet-oriented. Devnet does not validate mainnet-only launch programs.

## Deployment

Set `API_TOKEN` and `POSTGRES_PASSWORD` in `.env` (use a URL-safe password for the connection URI). Then:

```sh
docker compose up --build -d
docker compose logs -f app
```

The app is exposed on localhost:3001. PostgreSQL is internal. Redis is an optional future-queue profile and is not used by this single-process runtime. Do not run two app processes against one JSON state path. Hosting targets the supplied local/Docker backend; this repository is not published as a Sites-hosted trading service.

## Phase 8 research visibility and readiness

The dashboard now has an authenticated, read-only **Research** tab for actual observations, rejections, simulation/paper evidence, provider/WAL health, research intents, latency and readiness. Configure `RESEARCH_STATUS_PATH` to a generated snapshot; synthetic replay remains separate. **266 tests pass**; typecheck, build and isolated container smoke pass.

The15-minute mainnet process recorded 57,518 notifications and eight paper rejections, with no trades. Its public WebSocket exhausted the reconnect budget after409 seconds, so continuous coverage failed. Three moderate dependency findings were removed; three high findings remain. Production/funded release stays blocked and live mode remains disabled. See the [Phase 8 report](docs/phase8-engineering-report.md) and [reproduction guide](docs/phase8/README.md).

## Phase 7 reliability and sell validation

Actual unsigned sell simulations now succeed for four restricted routes. A persistent PostgreSQL fault suite, offline uncertainty replay, exact economic reconciliation and an opt-in buy/sell simulation gate are added. **241 tests pass**, typecheck/build/container smoke pass, and live mode remains disabled. The bounded mainnet monitor created zero paper trades. Performance reruns diagnose batching sensitivity without claiming a speedup; production readiness and six dependency findings remain open. See the [Phase 7 engineering report](docs/phase7-engineering-report.md) and [reproduction guide](docs/phase7/README.md).

## Phase 6 unsigned simulation

Four pinned read-only swap builders, actual unsigned mainnet buy simulations, a separate transactional intent ledger and an opt-in simulation-to-paper bridge are available. Live mode remains disabled. **209 tests pass**; SDK buy/sell serialization matches in all eight cases. No qualifying mainnet paper entry or funded trade was created. Measured regressions remain unresolved: mixed ingestion −7.0%, durable burst −36.0%, sustained stream −2.9%. See the [Phase 6 engineering report](docs/phase6-engineering-report.md) and [validation/reproduction guide](docs/phase6/README.md) for evidence and limits.

## Documentation

- [Competitor evidence matrix](docs/competitor-research.md)
- [Protocol and mainnet transaction analysis](docs/protocol-analysis.md)
- [Architecture, contracts and tradeoffs](docs/architecture.md)
- [Security review and dependency limits](docs/security-review.md)
- [Operations and API examples](docs/operations.md)
- [Phase status and roadmap](docs/phase-status.md)
- [Validation record](docs/validation.md)
- [Phase 1 latency audit and before/after measurements](docs/phase1-latency-report.md)
- [Latency metric definitions and replay instructions](docs/latency/README.md)
- [Phase 2 engineering report and measured regressions](docs/phase2-engineering-report.md)
- [Bounded ingestion architecture, recovery and reproduction](docs/phase2/README.md)
- [Phase 3 durability, fairness and protocol evidence report](docs/phase3-engineering-report.md)
- [Phase 3 WAL design and operations](docs/phase3/README.md)
- [Verified protocol coverage matrix](docs/phase3/protocol-coverage.md)

## Latency instrumentation and offline replay

The paper pipeline now records monotonic stage timings for ingestion, transport/protocol decoding, both dedupe layers, risk evaluation, strategy decisions, paper mutation attempts, and Store queue/commit work. Authenticated `GET /api/metrics` exposes bounded histograms, counters and queue gauges; `/api/state` retains its existing latency field and adds telemetry. Live execution remains disabled.

```sh
npm run benchmark -- --events 1000 --runs 3 --output /tmp/mintbot-benchmark.json
npm run replay -- --benchmark --events 1000 --runs 3
```

The offline replay reports p50/p95/p99, completion throughput, duplicates, drops, queue depth and injected RPC errors across sequential, duplicate-burst and overload/reconnect workloads. These are local fixture measurements; they do not establish chain latency or an optimization. See the [measured before/after report](docs/phase1-latency-report.md) and [metric contract](docs/latency/README.md). No application rebuild is required to run these source tools.

## Scope still required for funded trading

Verified swap and remaining launch/pool adapters; executable price/liquidity feeds and actual sell simulation; creator/history analysis; isolated signer authorization and funded-wallet lifecycle; durable funded-execution ownership and cross-ledger crash reconciliation; actual fee/balance reconciliation; Jito routing; provider-verified recovery coverage beyond the bounded ingestion backfill; real market-data integration for scheduled exits; controlled validation and independent security review. No claimed first-block performance, guaranteed sellability or profitability.

## Phase 2 ingestion and recovery (historical scope)

The existing paper engine now shares validated immutable history rows across trusted transactions while preserving full validation for generic mutations. The monitor uses bounded decode, enrichment, serialized strategy and persistence stages, with excess admitted work held in a bounded WAL. Stable program-address/signature identities cover provider overlap, reconnect and history; finite dedupe horizons explicitly reject older uncertain inputs. Only the pinned Pump launch decoder is implemented; the other registered programs remain observation-only. Chain discoveries remain unpriced and cannot enter paper positions automatically.

Authenticated `GET /api/ingestion` exposes queue, journal, provider and gap status; `POST /api/ingestion/recover` requests bounded read-only recovery. Existing API fields and dashboard flows are preserved. The report distinguishes refused admissions, deferred work, recovered events and remaining fixture losses; faster processing is not a claim of complete chain coverage.

```sh
npm run benchmark:ingestion -- --output /tmp/mintbot-ingestion.json
npm run benchmark:decoder
```

These source commands require no application rebuild. See the [engineering report](docs/phase2-engineering-report.md) for before/after results, including durability costs, and the [reproduction guide](docs/phase2/README.md) for all comparison variants. Live mode remains rejected at startup.


## Phase 3 durable ingestion and verified discovery

File-backed monitoring now uses a bounded worker-owned WAL with group commit. Accepted durable ownership and completion responses follow file/directory fsync; checksum validation, crash replay and failure injection are tested. Weighted live/restart/history scheduling keeps a share for fresh work and eventual service for old work. Freshness metadata distinguishes actual receipt time, event slot, sampled head and historical origin; verified paper inputs fail closed without the required freshness evidence.

Raw audit files rotate with bounded archive retention and persistent deletion/coverage metadata. Authenticated ingestion status adds pending peak/age, WAL and disk usage, writer failures, queue/disk alerts and read-only verified discoveries. Supported protocol variants require full successful transaction attribution and compatible account evidence; an observation alone is not a verified launch. No decoded discovery automatically enters paper trading.

```sh
npm run benchmark:journal
npm run benchmark:phase3 -- --runs 3
# Optional explicit public read-only network experiment:
python3 scripts/mainnet-readonly.py --run --public --seconds 15 --max-observations 500
```

Use the [Phase 3 report](docs/phase3-engineering-report.md) for actual measured improvements and regressions, and the [source reproduction guide](docs/phase3/README.md) for baseline extraction, randomized comparisons and optional Python requirements. Existing compiled deployments were not rebuilt or replaced. Live execution remains disabled.

## Phase 4 real-market paper research

`REAL_MARKET_PAPER=true` enables a separate stopped-by-default paper ledger and authenticated `/api/market-paper/*` APIs. Read-only Pump.fun, PumpSwap, Raydium CPMM and bounded Meteora DLMM adapters retrieve pinned account evidence and calculate integer buy/sell quote estimates. Missing safety evidence, stale quotes, unsupported variants and unavailable sell routes fail closed. Synthetic replay and its dashboard portfolio retain their existing behavior.

Use the [Phase 4 operating contract and supported variants](docs/phase4/README.md) and [engineering report with measured results and incomplete acceptance criteria](docs/phase4-engineering-report.md). Account-state quotes are not transaction simulations. No real-chain paper entry or viable five-second finalized launch strategy is claimed; live trading remains disabled.

## Phase 5 validation

The [Phase 5 report](docs/phase5-engineering-report.md) records current mainnet creation-to-paper **rejections**, positive liquid Raydium CPMM/Meteora DLMM fixtures with exact pinned SDK quote comparisons, lifecycle commitments, named paper research policies, measured performance and automatic exit/restart tests. No qualifying observed opportunity was substituted with synthetic safety evidence, and live trading remains disabled.

The strict finalized entry profile remains the default. The explicit `finalized-paper-research` profile admits older entries while retaining mandatory safety and current quote checks; it is not a fast-launch performance claim. See the [operating contract](docs/phase5/README.md), [measurement tables](docs/phase5/measurement-summary.md), [future execution design](docs/phase5/execution-readiness.md) and [remaining funded blockers](docs/phase5/funded-trading-blockers.md). Synthetic replay, dashboard and existing storage remain available.

## Phase 9 read-only reliability and validation

The [Phase 9 report](docs/phase9-engineering-report.md) records the bounded WebSocket supervisor, finalized recovery checkpoints, exact diagnosis of all eight Phase 8 market failures, and the native bigint dependency migration. The opt-in research CLI journals delivered notifications and denies paper admission during stale receipts or unresolved coverage. Existing server/dashboard/paper contracts remain in place; live mode stays disabled.

The [extended experiment report](docs/long-duration-mainnet-report.md) distinguishes transport-open time, actual receipts and incomplete chain coverage. Check its final/interim status before quoting results; missing final evidence is reported as interrupted unless an active run is explicitly asserted. Unsupported protocol variants remain disabled; configured provider brands do not establish independence. A clean dependency audit and historical simulation regressions do not establish a funded release or a qualifying current launch entry/exit. Reproduction and raw evidence are in [docs/phase9](docs/phase9/README.md).

The November 13–14 validation adds immediate controller wakeup on terminal supervision, terminal handling for observation failures, distinct subscription acknowledgement checks, redacted JSON-RPC diagnostics, and detection of wall/monotonic clock discontinuities. All 288 tests pass, including the original 266. Current validation artifacts are retained in [the November 13 directory](docs/phase9/revalidation-2026-11-13/). Read-only helper commands accept separate output paths to preserve earlier evidence.

The finalized attempt captured 421,018 notifications and 34 market reviews, including six parsed states and four paired account-state quotes. No paper trade qualified. Host clock discontinuity interrupted the attempt: monitored duration was 57 minutes 45 seconds across about 19.8 wall hours. The two-hour monitored target remains unmet; the unobserved interval is excluded from transport and coverage claims.

The November 14 finalized loader refresh observed Pump.fun deployment slot 469055660 versus reviewed slot 458921440. The existing pin check rejects that deployment; no new Pump variant or pin was enabled. PumpSwap, Raydium CPMM and Meteora DLMM still matched their reviewed loader pins in that capture. See [protocol evidence and restrictions](docs/verified-protocol-extensions.md).

## Phase 10 operational research validation

The [Phase 10 report](docs/phase10-engineering-report.md) records the current Pump ProgramData/ELF capture, unchanged deployment block, rejected 1096-byte Global, exact Phase9 quarantine/refusal accounting, and the explicit supervised research deployment. Normal server monitoring remains a separate legacy path; [integration differences](docs/phase10/integration-difference.md) identify the exact loaded versions.

```sh
npm run research:monitor -- --run --seconds 7200 --output docs/phase10/new-run-directory
# Explicit sidecar/profile; ordinary Compose behavior remains unchanged:
RESEARCH_RUN_NAME=unique-new-run docker compose -f compose.yaml -f compose.research.yaml --profile research up
```

Each bounded run requires a new directory/name, retains old WAL/coverage and does not automatically restart. The Research tab reads the sidecar snapshot through the existing authenticated API. Review retries preserve original identity/time, reopen coverage and never grant paper eligibility. [Evidence and reproduction](docs/phase10/README.md) distinguish the final monitoring window, its calibrations, actual provider limitations, SDK fixtures and zero qualifying paper fills. All mandatory risk gates remain; live trading is disabled.

Final Phase10 validation passes 299 tests (all original 288 retained), backend/frontend typecheck, production build, fresh Node22 two-stage Docker checks, PostgreSQL fault tests and isolated SDK comparisons; the dependency audit records zero findings. The bounded container exited normally after 7,200.0003 monotonic seconds, receiving 898,515 notifications and sampling 105 candidates: 69 market rejections and 36 strict creation-verification rejections. Paper entries/exits are zero. Transport-open time is 7,020.9673 seconds, fully acknowledged time 7,004.9421 seconds, and disconnected time 179.0331 seconds. The gap remains unrecoverable, with 79 quarantines retained and no active pending work. Duration met; continuous-coverage acceptance, current Pump compatibility, independent-provider agreement and genuine paper entry/exit remain unmet. Current burst regression signals are disclosed without a causal attribution or speedup claim. See the [final validation summary](docs/phase10/validation-summary.json).


## Phase 11 — multi-venue current-chain research

The [Phase 11 report](docs/phase11-engineering-report.md) records the shared four-venue supervisor, explicit per-venue candidate sampling, program/signature provenance matching, retained coverage epochs, WAL-bound operator retry authority, shared decision-owner fencing and authenticated sticky global-stop integration. The explicit research Compose overlay disables legacy/server market decisions and exposes only the existing authenticated research projection. Normal server defaults remain separate.

All original 299 tests remain; the complete suite currently passes 307 tests. Current Pump deployment and the nonzero Global tail stay blocked. Current alternate-venue diagnostics and successful unsigned route simulations are separate from fresh opportunity safety or paper fills. The final report distinguishes actual monitoring duration, unresolved coverage, provider/policy authorization, zero fills and remaining release blockers. Live signing, broadcasting and spending remain disabled.

Final Phase11 evidence records 307 passing tests, zero audit advisories, 61,636 notifications across all four venues, seven sampled candidates and two verified creations. There are zero paper entries/exits. The 1,800-second monitoring target was not met: clock-discontinuity detection stopped the controller after 584.319388 monotonic seconds across 7,854.626 wall seconds; the 7,270.307-second discrepancy is excluded. All four current coverage gaps remain unrecoverable, with one current quarantine and all 79 historical quarantines retained. The separate authenticated stop/owner probe passes and contributes no time to the primary run. Current Pump compatibility, provider/epoch authorization and end-to-end fresh paper trading remain unmet. See the [final evidence summary](docs/phase11/validation-summary.json).

The final exit-fence propagation fix is exercised by a separate compiled Node22 release probe and covered by the 307-test suite. The primary monitoring snapshot predates that two-module correction; hashes preserve the exact distinction. Neither short control probe is added to the primary monitoring duration.

## Cloud deployment (Phase 19)

The separate [Ubuntu 24.04 cloud runbook](docs/cloud-deployment.md) prepares persistent paper-only hosting, HTTPS or SSH tunnel access, encrypted backups and host monitoring. See the [engineering report](docs/phase19-engineering-report.md) for actual local validation and external blockers. Research remains opt-in and bounded; funded execution remains disabled.
