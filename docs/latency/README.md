# Latency instrumentation contract

For the current worker WAL and protocol/freshness boundaries, see [Phase 3](../phase3/README.md). Historical Phase 1/2 harnesses remain unchanged.

This document describes the retained Phase 1 harness and historical runtime. Phase 2 replaces runtime observation admission and Store cloning; see the [current bounded queue and recovery contract](../phase2/README.md) and [measured Phase 2 report](../phase2-engineering-report.md). The original harness intentionally keeps its FIFO and overload policy for comparison.

This phase adds observability to the existing paper prototype. It does not enable live execution, implement missing swap routes, or change strategy/risk settings. See [the measured audit report](../phase1-latency-report.md).

## Run without rebuilding

From the repository root with existing dependencies:

```sh
npm test
node node_modules/typescript/bin/tsc --noEmit
npm run benchmark -- --events 1000 --runs 3 --output docs/latency/local.json
npm run replay -- --benchmark --events 1000 --runs 3
npm run replay
```

`npm run benchmark` is the full offline pipeline replay. `npm run replay -- --benchmark` runs the same harness. Plain `npm run replay` preserves the original two-position simulation and adds telemetry to its JSON response. No command above builds the application, changes a funded wallet, or submits a transaction. Benchmark RPC failures and transport recovery are injected locally; there is no public RPC request in this harness.

The default benchmark runs sequential, dedupe-burst and overload-reconnect scenarios, with three independent repetitions of 1,000 offers each. It first warms up a separate 32-event instance of each scenario. Sequential/default strategy reaches five positions and then rejects further unique entries; only **five paper buy mutation samples per sequential run** are available, not 1,000 executed trades. Full paper sell and timer paths remain covered by the original simulation and regression suite. The benchmark does not change safety settings to manufacture more fills.

## Clock and collection

`Telemetry` uses `node:perf_hooks.performance.now()` for durations. A clock can be injected for deterministic tests. Existing `Date.now()` timestamps remain for UTC budgets, quote freshness, holds and display; they are never subtracted from a monotonic timestamp. Each process/collector has its own time origin. Receipt timestamps attached to `ProgramObservation` are non-enumerable and are not written into JSONL or persisted state.

Histograms retain the most recent 10,000 samples in a ring. `count` is the lifetime observation count; `samples` is the retained count. Quantiles describe the retained window, using the pre-existing `floor((n-1)*p)` convention; `max` is the retained maximum. Missing histograms mean no samples, not a measured zero. Missing counters mean zero occurrences. `snapshot()` retains the previous histogram-shaped API; `report()` adds uptime, counters and gauges. No raw event IDs, tokens, RPC URLs or secrets are metric labels.

`new Telemetry({enabled:false})` disables collection for injected module collectors. Benchmark `--instrumentation off` disables internal collection while keeping the external comparison harness enabled. It is **not** the pre-change implementation and is not a substitute for an archived before run; wrapper/clock overhead can remain. Default runtime collection is enabled. Collectors are in memory and reset at restart; there is no metrics database, external exporter or sampling claim beyond the rolling window.

## Boundaries

| Histogram | Measured boundary |
| --- | --- |
| `monitor.ingestion_ms` | Active WebSocket message handler, including acknowledgement handling and synchronous callback/enqueue; not asynchronous processing |
| `monitor.json_decoding_ms` | Transport JSON parsing |
| `monitor.deduplication_ms` | In-memory signature/program lookup, insertion and bounded eviction |
| `decoding_ms` | Pinned Pump protocol event decoding/validation, including rejected attempts |
| `ingestion.validation_ms` | Paper launch runtime schema parsing |
| `engine.deduplication_ms` | Serialized paper event ID lookup/update |
| `risk_evaluation_ms` | One `assess()` call; existing assignment plus strategy evaluation still assess twice per unique ingestion |
| `strategy_decision_ms` | Complete entry filter decision, including its nested risk assessment |
| `exit_decision_ms` | Automatic exit reason evaluation |
| `paper_execution_ms` | Buy/sell mutation attempt, including failed sell attempts; excludes Store validation and persistence |
| `ingestion_ms` | Paper ingestion call through committed Store result or error, including queue wait |
| `store.queue_wait_ms` | Transaction submission until its callback starts |
| `store.clone_ms`, `store.validation_ms` | State cloning and runtime validation |
| `store.persistence_ms` | Configured JSON serialization/write/rename; absent for an in-memory benchmark |
| `store.transaction_ms` | Full transaction including queue wait and configured persistence |
| `observations.queue_wait_ms` | Persistence queue admission to task start |
| `observations.processing_ms` | Accepted persistence/decode callback work |
| `observations.end_to_end_ms` | Local WebSocket receipt to accepted queue task settlement, including queue wait and monitor handling |
| `rpc.<method>_ms` | Configured RPC method invocation to settlement, including thrown errors |
| `rpc.reconnect_wait_ms` | Scheduled reconnect delay to callback, including event-loop delay |
| `rpc.recovery_ms` | First disconnect to acknowledgements for all subscriptions; excludes deliberate stop/start downtime |
| `wallet.*_ms` | Existing disconnected construction/signing helper durations |

`harness.*` and `replay.*` spans belong to the benchmark's identical external harness, so they are comparable on both source versions. Internal baseline stages are genuinely unavailable and explicitly marked unmeasured. Nested spans overlap and must not be summed. Durations are attempts, not proof of a committed state change. `ingestion.buys_committed` counts successful direct-ingestion buys only; delayed buys and all sells are represented by their attempt spans/counters and the persisted paper trade history. This phase does not fabricate a complete financial ledger from metrics.

## Counts and queue semantics

- `observations.received`, `.duplicates`, `.delivered` count validated log notifications before/after monitor dedupe and delivery to the consumer callback. Delivery is not proof of persistence.
- `monitor.dedupe_evictions` counts entries leaving the finite dedupe window; this is not a dropped input event. Replayed old IDs may be admitted after eviction, preserving previous behavior.
- `engine.duplicates` counts serialized paper dedupe attempts. `ingestion.received/completed/errors` counts input calls and settlement outcomes. Strategy rejection is completed processing, not overload loss.
- `strategy.pending_dropped` counts committed evictions from the existing 200-event delayed-entry list; it is separate from the observation backlog drop count.
- `observations.offered/admitted/completed/errors/dropped` covers the Phase 1 monitor persistence queue (replaced in Phase 2). The Phase 1 server and standalone CLI used a **100 pending tasks** limit. A task rejected at capacity or after close increments dropped. A task that throws increments errors, not dropped; already persisted raw data may still exist.
- Queue `queue_depth` is waiting work, `in_flight` is active work, and `pending` includes both. Each gauge reports current and peak. Immediately submitted work waiting for its first microtask counts as waiting. The Phase 1 Store retained its original unbounded admission policy and exposes `store.queue_depth` / `store.in_flight` rather than introducing new trade drops.
- `rpc.errors` counts thrown HTTP/SDK calls and socket/create/subscription-write/rejection failures. `rpc.calls` covers instrumented SDK method calls; WebSocket subscriptions/messages have separate counters. Missing data, decoder errors, callback failures and budget exhaustion have distinct metrics; do not calculate a universal RPC error rate from mismatched denominators.
- Reconnect gaps are not a known drop count. Phase 1 had no historical backfill; Phase 2 adds bounded recovery with explicit incomplete coverage. Unobserved chain activity remains unknown without provider evidence.

Benchmark summaries reconcile **offered = completed + duplicates + dropped** after drain. Completion throughput excludes duplicate/drop offers; offered rate is separately labeled. The overload scenario uses capacity 64 to exercise loss, while the Phase 1 runtime capacity was 100. Read errors in the replay's independent historical inspection do not become asserted safety evidence for its separately synthetic paper launches.

## Runtime access

Run the TypeScript source backend (`node --env-file=.env --import tsx src/server.ts`) to use the new runtime instrumentation without a build. Existing `dist/` artifacts and any running deployment were not rebuilt or replaced. Authenticated `GET /api/metrics` returns the process collector. `GET /api/state` retains `latencies` and adds `telemetry` without changing persisted `StateSchema`. Monitor CLI emits a final telemetry summary to stderr on shutdown. Phase 2 server and CLI share the bounded staged ingestion service; this harness retains its measured FIFO. The disconnected `RpcExecutor` retains its own collector by default and is still never invoked by the paper HTTP server.

## Reproduce the comparison

The archive contains only original source, strategy and package metadata, with no node_modules or credentials. After installing this repository's unchanged dependencies:

```sh
mkdir -p /tmp/mintbot-latency-baseline
tar -xzf docs/latency/before-source.tar.gz -C /tmp/mintbot-latency-baseline
ln -s "$PWD/node_modules" /tmp/mintbot-latency-baseline/node_modules
npm run benchmark -- --source-root /tmp/mintbot-latency-baseline --events 1000 --runs 3 --output /tmp/mintbot-before.json
npm run benchmark -- --events 1000 --runs 3 --output /tmp/mintbot-after.json
npm run benchmark:compare -- --before /tmp/mintbot-before.json --after /tmp/mintbot-after.json --output /tmp/mintbot-latency-report.md
```

Use an empty temporary baseline directory. Source hashes, harness hash, runtime/CPU metadata, per-run distributions and conservation checks are included in raw JSON. Comparisons refuse mismatched harnesses, event counts, repetition counts or recorded Node/CPU environments. Exact latency values are not deterministic; test assertions concern clock arithmetic, FIFO, counters, bounds and state behavior, never host-dependent latency thresholds.
