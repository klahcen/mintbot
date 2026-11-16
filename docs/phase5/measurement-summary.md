# Phase 5 measurement summary

Generated from retained artifacts. Node v20.19.5; 11th Gen Intel(R) Core(TM) i5-1145G7 @ 2.60GHz. Three interleaved/randomized repetitions; medians below. Values from different phases/hardware-load windows must not be directly compared.

| Workload | Before /s | After /s | Change | Before p50/p95/p99 ms | After p50/p95/p99 ms |
|---|---:|---:|---:|---|---|
| concurrent-history-live | 3824.4 | 3348.3 | -12.4% | 137.07 / 254.91 / 263.51 | 167.81 / 300.41 / 311.61 |
| durable-burst-200 | 779.7 | 821.7 | +5.4% | 130.33 / 214.26 / 216.74 | 116.42 / 204.79 / 211.13 |
| repeated-mint-10000 | 2120.0 | 2232.6 | +5.3% | 1918.49 / 4177.05 / 4461.13 | 1708.04 / 4020.85 / 4277.06 |
| slow-unavailable-rpc | 1443.7 | 1436.3 | -0.5% | 308.66 / 584.28 / 668.85 | 312.88 / 583.77 / 668.93 |
| sustained-stream | 2881.0 | 2949.5 | +2.4% | 14.63 / 23.48 / 25.48 | 12.02 / 16.53 / 18.06 |
| unique-mints-10000 | 1204.7 | 1186.8 | -1.5% | 3578.88 / 7653.63 / 8075.16 | 3645.38 / 7768.94 / 8188.78 |

All 36 ingestion jobs completed their intended populations with zero logical duplicate processing or refused offers and passing recorded integrity checks. Slow-RPC faults are injected, not mainnet outcomes. Quantiles are medians of per-run quantiles, not pooled quantiles. Full individual samples, CPU, queue, GC, memory and provider error counters are in `regression-benchmark.json`.

| Warm 200-row review workload | Before reviews/s | After reviews/s | Change | Before Store p50/p95/p99 ms | After Store p50/p95/p99 ms |
|---|---:|---:|---:|---|---|
| in-memory | 95.03 | 687.61 | +623.6% | 10.22 / 13.86 / 15.69 | 1.32 / 2.58 / 2.86 |
| file + directory fsync | 42.66 | 64.23 | +50.5% | 22.55 / 29.36 / 43.98 | 15.76 / 19.60 / 20.20 |

Each market job performs 100 rejected recorded-state reviews with 200 preloaded rows. Zero fills. This isolates review-history clone/validation and serialization/fsync cost; it excludes real RPC and production arrival distributions.

## First bounded mainnet run

90 seconds; 10669 confirmed notifications; 6 selected candidates; 2 verified creations; 2 durable reviews; 0 paper trades.

| Stage | Samples | p50 ms | p95 ms | p99 ms |
|---|---:|---:|---:|---:|
| market.transaction_verification_ms | 6 | 231.666 | 293.608 | 293.608 |
| market.queue_backlog_age_ms | 2 | 0.028 | 0.028 | 0.028 |
| market.state_retrieval_ms | 2 | 595.437 | 595.437 | 595.437 |
| market.quote_computation_ms | 2 | 0.253 | 0.253 | 0.253 |
| market.risk_evaluation_ms | 2 | 0.291 | 0.291 | 0.291 |
| market.strategy_decision_ms | 1 | 0.532 | 0.532 | 0.532 |
| market.receipt_to_decision_ms | 2 | 1417.549 | 1417.549 | 1417.549 |

No real-mainnet paper-execution latency exists because no entry passed. Small-sample p95/p99 figures follow the existing bounded histogram estimator and do not characterize production tails. Verification latency measures individual RPC/proof calls, while receipt-to-finalized-proof age also includes preparation, scheduling and polling; neither is exact chain finalization time.

Pinned liquid-state SDK reference: 16 quote comparisons; 16 exact output/fee matches. Largest DLMM reference traverses 3 bins.

Final-source follow-up: 60 seconds, 8549 notifications, 6 candidates, 2 verified creations, 2 reviews, 0 trades. See `mainnet-final/evidence.json` for complete rejection and RPC details.

## Sustained paper unit replay

Measured 60.21 seconds, 333 buy/full-sell cycles, 333 duplicate reviews suppressed, 6 durable reloads, 34 stale exits refused, 0 final open positions; exact ledger reconciliation passed. Peak sampled RSS 208.55 MiB. Event-loop p95/p99 19.96/25.15 ms. This is explicit UNIT safety/fee replay, not real mainnet fills or provider endurance.
