# Phase 4 engineering report

Measured on 2026-11-06, v20.19.5, 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz. Live trading remains disabled. No signing, funded transaction, application/container rebuild or deployment was performed.

## Outcome and acceptance status

Implemented a separate opt-in account-state paper path, four restricted read-only adapters, integer quotes/accounting, evidence-status risk gating, fresh-quote exits and stage telemetry. **142 tests pass, including all 94 original tests; backend and dashboard type checks pass.** All 17 pre-existing files under `tests/` are byte-for-byte unchanged. Existing dashboard, replay, WAL/recovery and API safety controls are preserved.

**Full Phase 4 acceptance is not claimed.** Real-chain Pump and PumpSwap reserve quotes were validated; Raydium and DLMM captures demonstrate unavailable routes rather than successful two-sided executable markets. Complete creator/beneficial-owner history, all protocol/token variants, viable finalized five-second launch entries, actual swap simulation and an accepted fresh real-chain paper opportunity remain unverified or unsupported. Unsupported/unknown mandatory evidence fails closed. No real-chain paper fills occurred.

## Audit and implementation

The audit found selected finalized creation decoders and durable staged ingestion already working. Verified discoveries had no priced market path. `Engine.ingest`, marks and exits used synthetic prices, a fixed fee and deterministic slippage. The Phase 4 implementation adds to those modules rather than replacing them:

- `src/market/accounts.ts`, `pump.ts`, `pools.ts`, `dlmm-quote.ts`: strict account owners/layouts, custody and decimal checks, dynamic fee evidence, bounded integer quotes.
- `src/market/rpc.ts`: explicit read-only RPC allowlist, finalized/minimum context, deadlines and byte/account bounds, complete bounded owner enumeration, deployment-header checks and sourced fee estimates.
- `src/market/risk.ts`: verified/unknown/stale/failed evidence; mandatory safety, identity, freshness, buy/sell, impact and positive net exit economics.
- `src/market/paper.ts`, `service.ts`: existing Store/Engine controls and strategy rules with a separate exact ledger, minimum-output fills, new quote retrieval for full exits, failure circuit and bounded evidence history.
- Existing monitor strategy now awaits verified-launch evaluation before raw persistence/WAL completion. Creation provider/commitment/block time and transient monotonic receipt timing are propagated; existing stable IDs and WAL algorithms remain unchanged.
- Only the market Store opts into file/directory fsync and a single-writer lease. Synthetic persistence defaults remain unchanged. An uncertain published durable Store refuses subsequent writes until restart.
- Existing engine rejects synthetic operations on a market ledger/position. Global stop/kill stops market paper. New authenticated market controls do not enable live mode. The dashboard portfolio continues to show the synthetic account; market evidence/portfolio are available through authenticated APIs.

Implementation details, source pins, exact supported variants, API usage and the architecture diagram are in [the Phase 4 contract](phase4/README.md).

## Real-chain and upstream reference evidence

Fixtures are later finalized snapshots of historical creations, not launch-time reconstructions. Raw bytes, provider, capture time, context slot and account owners are retained under `docs/phase4/fixtures`; checksums accompany the report. Quote outputs below are integer atoms/lamports, not spot-price substitutions.

| Reference check | Input | Buy output atoms | Sell output lamports | Result |
| --- | ---: | ---: | ---: | --- |
| Pump SDK 4.3.1 | 10000 lamports | 29339561 | 9750 | Exact match to independent official SDK |
| PumpSwap SDK 2.2.0 | 1000000 lamports | 42355954415 | 975210 | Exact match to independent official SDK |

The reference sell uses the full buy output; actual paper fills and their sell feasibility use the conservative minimum buy output. Pump has 41424 real reserve lamports despite approximately 346.416 SOL virtual reserves. PumpSwap has 2908960632 real WSOL lamports and 17584080040 virtual quote units. Virtual balances affect pricing but are excluded from liquidity. The captured Raydium pool has one spendable WSOL lamport; its sell quote is rejected. Captured DLMM bins have no usable two-sided inventory; custody spot price is never substituted.

Pump and PumpSwap reference packages were pinned and installed only under `/tmp`, with scripts disabled. Their versions/integrities and outputs are retained. The Meteora repository declares a package version unavailable on npm during validation; its retained pinned BN helpers were executed independently instead. All 16 deterministic fee/direction/traversal vectors match. Positive Raydium creator-fee and Meteora traversal tests use explicitly synthetic unit inventory, not fabricated chain fixtures.

Fee/layout sources: [official Pump schemas](https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22), [Pump SDK](https://www.npmjs.com/package/@pump-fun/pump-sdk/v/4.3.1), [PumpSwap SDK](https://www.npmjs.com/package/@pump-fun/pump-swap-sdk/v/2.2.0), [Raydium calculator and fee source](https://github.com/raydium-io/raydium-cp-swap/tree/3d69122790e97cd6aff24e8ba95940793773f58c/programs/cp-swap/src/curve), and [Meteora SDK helpers](https://github.com/MeteoraAg/dlmm-sdk/tree/af36dd53ab180783ccecda306926189a4700953c/ts-client/src/dlmm/helpers). Upstream references/license attribution are in `phase4/sources/NOTICE.md`.

## Current native RPC validation

The native Node single-batch probe returned **read-success**, 25 accounts, context slot 466174917, elapsed **776.068 ms**. This is one diagnostic request, not a network latency distribution or an SLO.

The bounded follow-up re-verified historical creation proofs and retrieved current market state using the actual Node readers. It attempted no paper entries and never changed historical origin or block timestamps:

| Venue | Current native read-only result |
| --- | --- |
| pump | Current state and both quotes obtained; market slot 466181454; entry rejected by mandatory evidence/freshness |
| pumpswap | Truncated or incompatible invocation history |
| raydium-cpmm | Insufficient executable liquidity; market slot 466181465; entry rejected by mandatory evidence/freshness |
| meteora-dlmm | Insufficient liquidity or unsupported fees |

Market transport recorded 27 calls and 1 errors. These counters cover MarketRpc methods; creation-verifier underlying HTTP reads are outside that counter. Full verification timing includes its transaction/account reads. Diagnostic sample counts are small and include failures:

| Diagnostic stage | Samples | p50 ms | p95 ms | p99 ms | max ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| market.transaction_verification_ms | 4 | 964.948 | 1070.523 | 1070.523 | 1101.458 |
| market.state_retrieval_ms | 3 | 444.529 | 444.529 | 444.529 | 1579.681 |
| market.quote_computation_ms | 2 | 0.365 | 0.365 | 0.365 | 0.840 |
| market.risk_evaluation_ms | 2 | 0.506 | 0.506 | 0.506 | 0.841 |

The first live fee check exposed an invalid representative message using the System Program as payer; the RPC rejected program index zero. The corrected unsigned one-signature message uses a distinct public-only address. A regression test deserializes and checks that message; the initial diagnostic is retained separately. No transaction was signed or submitted.

## Comparable Phase 3 → Phase 4 regression benchmark

Three fixed-seed randomized repetitions per scenario, same offers/completions and paper workload, same dependency installation and host, real worker WAL on both sides for the disk scenario. Baseline source and checksums were preserved before edits. The market mode is off for this comparison. Values are medians of per-run measurements; quantiles use the existing floor((n−1)p) convention. Batch-burst percentiles include queueing behind the complete offered batch. They are not a production event-latency SLO.

| Scenario | Before completed/s | After completed/s | Change | Before p50/p95/p99 ms | After p50/p95/p99 ms |
| --- | ---: | ---: | ---: | --- | --- |
| unique-mints-10000 | 449.4 | 454.3 | +1.1% | 9347.22 / 20480.92 / 21662.83 | 9254.42 / 20087.82 / 21336.52 |
| repeated-mint-10000 | 699.7 | 732.9 | +4.7% | 5475.63 / 12806.55 / 13683.82 | 4928.04 / 12285.70 / 13063.08 |
| durable-burst-200 | 282.6 | 314.9 | +11.4% | 308.99 / 619.70 / 640.86 | 294.69 / 532.60 / 547.57 |
| sustained-stream | 1282.3 | 1470.2 | +14.7% | 195.99 / 306.15 / 313.34 | 121.42 / 198.33 / 204.40 |
| concurrent-history-live | 1415.8 | 1288.9 | -9.0% | 384.46 / 714.23 / 739.57 | 436.70 / 785.92 / 813.65 |
| slow-unavailable-rpc | 1046.2 | 981.4 | -6.2% | 428.51 / 820.04 / 925.48 | 467.74 / 865.75 / 983.71 |

**Regressions are retained:** concurrent-history/live throughput and slow/unavailable-provider throughput declined in this measurement. Positive changes in other rows are observations, not proven improvements caused by Phase 4. Three shared-process runs do not establish statistical confidence; GC, filesystem and scheduling variability remain. No latency improvement is claimed without these measurements.

| After workload integrity | Completed per run | Admission refusals | Duplicate logical processing | Injected RPC errors |
| --- | ---: | ---: | ---: | ---: |
| repeated-mint-10000 | 10000/10000/10000 | 0/0/0 | 0/0/0 | 0/0/0 |
| concurrent-history-live | 1100/1100/1100 | 0/0/0 | 0/0/0 | 0/0/0 |
| sustained-stream | 1000/1000/1000 | 0/0/0 | 0/0/0 | 0/0/0 |
| unique-mints-10000 | 10000/10000/10000 | 0/0/0 | 0/0/0 | 0/0/0 |
| slow-unavailable-rpc | 1000/1000/1000 | 0/0/0 | 0/0/0 | 56/56/56 |
| durable-burst-200 | 200/200/200 | 0/0/0 | 0/0/0 | 0/0/0 |

All admitted regression events completed without duplicate logical processing or silent loss. Explicit queue refusals/errors are reported above. Slow-provider errors are deterministic injected faults, not measured mainnet failures. Raw metrics also retain per-stage histograms, pending age, queue peaks, CPU, memory, event-loop delay, GC and journal integrity.

## New market workloads: no pre-Phase-4 equivalent

There is no before value for market enrichment because that feature did not exist. Offline replay repeats **one actual recorded market snapshot per venue** 100 times in each of three runs. It includes strict parsing, quote/risk checks, cold Store construction and fail-closed review; it excludes network and durable disk publication. These are repeated-snapshot evaluation rates, not distinct live launches/second. State-retrieval histograms include layout decoding and in-process fixture reads, including rejected states.

| Venue | Median evaluations/s | State p50/p95/p99 ms | Successful state reads / buy quotes / sell quotes per run |
| --- | ---: | --- | --- |
| pump | 61.40 | 2.891 / 4.395 / 4.961 | 100 / 100 / 100 |
| pumpswap | 55.80 | 7.055 / 10.764 / 11.191 | 100 / 100 / 100 |
| raydium-cpmm | 71.90 | 4.716 / 7.785 / 8.541 | 100 / 100 / 0 |
| meteora-dlmm | 66.93 | 10.417 / 14.166 / 16.508 | 0 / 0 / 0 |

| Offline stage, median of three run quantiles | Venue | p50 ms | p95 ms | p99 ms |
| --- | --- | ---: | ---: | ---: |
| market.transaction_verification_cpu_ms | pump | 9.025 | 13.535 | 17.046 |
| market.quote_computation_ms | pump | 0.024 | 0.044 | 0.063 |
| market.risk_evaluation_ms | pump | 0.073 | 0.118 | 0.139 |
| market.strategy_decision_ms | pump | 0.030 | 0.052 | 0.061 |
| market.transaction_verification_cpu_ms | pumpswap | 6.166 | 9.403 | 10.694 |
| market.quote_computation_ms | pumpswap | 0.058 | 0.101 | 0.120 |
| market.risk_evaluation_ms | pumpswap | 0.080 | 0.129 | 0.157 |
| market.strategy_decision_ms | pumpswap | 0.030 | 0.049 | 0.062 |
| market.transaction_verification_cpu_ms | raydium-cpmm | 4.811 | 7.308 | 8.754 |
| market.quote_computation_ms | raydium-cpmm | 0.082 | 0.128 | 0.170 |
| market.risk_evaluation_ms | raydium-cpmm | 0.133 | 0.191 | 0.222 |
| market.transaction_verification_cpu_ms | meteora-dlmm | 3.757 | 5.593 | 6.422 |

Explicit unit-only eligibility stubs produced 100 buys and 100 sells. Their synchronous paper-mutation histogram has 200 samples, p50 **0.192 ms**, p95 **0.389 ms**, p99 **0.550 ms**. This excludes persistence, network and real safety eligibility; it is not a successful mainnet-paper throughput claim.

The bounded direct-service burst offered 64, admitted 32, explicitly refused 32, and detected 8 subsequent duplicates. Peak pending was 32, peak workers 2; backlog age at service start p50/p95/p99 **60.758/221.149/243.027 ms**. All admitted reviews completed; no real-market fills occurred. This microharness does not attach a WAL to its 32 refused calls; production ingestion retains/retries ownership through its existing WAL. Bounded review-history cloning is visible overhead, especially for large bin evidence; no optimization claim is made.

## Validation and remaining funded-trading blockers

- `before-tests.log`: original 94/94; `after-tests.log`: expanded passing suite; `typecheck.log`: backend noEmit and dashboard type checks. Existing tests are unmodified.
- New coverage includes stale quotes, changed reserves, missing accounts, wrong decimals/owners, unsupported revisions/deployments, timeouts, provider conflicts, empty liquidity, frozen custody, transfer restrictions, holder reconciliation, unavailable/failed sells, exact fees and accounting, durable reload dedupe, bounded burst, historical/restart rejection, API auth and global kill behavior. Existing reconnect/recovery/WAL crash tests continue to pass.
- MODE=live is still rejected. No signer or funded route is wired. Actual protocol instruction construction, transaction simulation, authorized signing, submission, outcome reconciliation, MEV/landing behavior and an independent security review remain blockers.
- Quote-supported variants are deliberately narrow. Positive liquid real-chain CPMM/DLMM two-sided quotes need additional fixtures/validation. DLMM limit orders, unbounded bin traversal, activation variants, exotic quote currencies and transfer-affecting Token-2022 extensions remain unsupported.
- Fee/rent/CU values are sourced estimates: one-signature representative base fee, recent p75 priority rate at assumed 200k CU, assumed 182-byte new-account rent conservatively expensed. Actual swap CU/account creation and rent refunds are not simulated. Paper trades do not alter the real pool or model competing orders and failed transactions.
- Deferred market-entry rescheduling is not implemented: entry delay is evaluated once, and a candidate whose delay has not elapsed is rejected. Positive-volume or momentum strategies require unavailable history and fail closed. The original synthetic delayed-entry scheduler is preserved.
- Unknown creator history, common beneficial ownership, cross-provider quorum and historical liquidity changes are not asserted verified. Complete token-account owner enumeration is bounded and may be unavailable or fail supply reconciliation; mandatory checks then block entry.
- Finalization plus a five-second/8-slot launch policy can exclude all fast-launch entries. No accepted fresh real-chain opportunity, WebSocket-to-market-to-fill live run, funded execution, production SLO or long-duration market-mode soak is demonstrated.
- Default synthetic engine/Store and dashboard are preserved; the new ledger uses exact strings/bigints but displays numeric SOL/token values through existing state contracts. JSON review history is bounded at 200, not an indefinite execution audit database. WAL dedupe/coverage remains finite under its existing documented retention policy.

## Reproduction artifacts

- [Operating contract and commands](phase4/README.md)
- `phase4/before-source.tar.gz`, `before-source-sha256.json`, `final-source-sha256.json`, `evidence-sha256.json`
- `phase4/regression-benchmark.json` and `market-benchmark.json`: raw per-run values and counters
- `phase4/pump-sdk-reference.json`, `pumpswap-sdk-reference.json`, `dlmm-reference-vectors.json`: independent reference results
- `phase4/native-rpc-probe.json`, `live-readonly-validation.json`, raw current/captured fixtures and initial diagnostic
- Source harnesses: `scripts/phase4-regression-benchmark.ts`, `phase4-market-benchmark.ts`, `phase4-reference-vectors.ts`, `phase4-live-validation.ts`, `phase4-report.py`
