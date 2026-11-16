# Phase 5 operating contract

Live execution stays disabled. The original dashboard and synthetic replay remain available. Real-market paper trading uses its own ledger, fresh account-state estimates and all mandatory safety gates. See the [engineering report](../phase5-engineering-report.md), [execution design](execution-readiness.md) and [remaining blockers](funded-trading-blockers.md).

The repository retains all 142 Phase 4 tests. New tests and recorded mainnet evidence are separate. No app or container rebuild was performed.

## Entry policies

| Explicit profile | Receipt and block-time age | Receipt/head and event/market lag | Required creation commitment | Historical/restart entry |
|---|---:|---:|---|---|
| `strict-finalized` (default) | 5,000 ms | 8 slots | finalized | rejected |
| `finalized-paper-research` (opt in) | 60,000 ms | 160 slots | finalized | rejected |

Quote state still expires after **1,500 ms** by monotonic and wall clocks. Fee evidence still expires after 5,000 ms. Both profiles require authority checks, supported transfer behavior, complete reconciled owner concentration, liquidity, buy and sell routes, impact limits, reviewed deployment headers and existing strategy/capital controls. A research profile permits older entries and therefore loses fast-launch relevance; it never changes unknown safety evidence into verified evidence.

For an existing source deployment, set `REAL_MARKET_PAPER=true`, a separate `MARKET_PAPER_STATE_PATH`, and optionally `MARKET_RESEARCH_POLICY=finalized-paper-research`. Start the backend with the existing source command. The paper ledger loads stopped. Use the existing authenticated market-paper controls to start it. Synthetic start controls remain separate. Compose does not forward these opt-in variables; no container was rebuilt or deployment changed.

## Lifecycle and evidence

`DETECTED → PROVISIONAL → VERIFIED → ELIGIBLE → PAPER_EXECUTED`

Notification records are provisional; they do not prove creation or finalization. WebSocket notifications currently request `confirmed`. Strict transaction/account validation produces `VERIFIED` only from finalized RPC evidence. Every transition records its actual observed commitment, source, receipt age and time. A late first observation records earlier commitments as **unobserved**, rather than inventing processed/confirmed timings. Each decoded instruction has its original stable identity; notification-level provenance is linked by program/signature. Conflicting identities, slot changes or commitment regressions invalidate observations. Eligibility and paper execution occur in the same durable Store transaction as the position and exact ledger debit.

Server preparation records the notification only. The bounded experiment additionally fetches the confirmed transaction and candidate account keys using `VerifiedReadRpc.provisional`; this API never returns a `VerifiedLaunch`, account-state authorization or execution eligibility. Prepared keys are useful for planning reads; finalized mutable accounts must still be fetched and validated. The extra confirmed read has overhead and is not enabled as a latency optimization in the server.

Risk review signals contain age/observation time, commitment and basis where known. Unknown observations retain unknown age. Network cost evidence is explicitly mixed: a finalized base-fee context, recent prioritization sample and modeled CU/rent assumptions. Loader deployment headers are separate observations, not ELF/semantic proofs. Full raw market account digests, state slots and provider provenance remain attached.

## Scheduling and caching

Market admission remains 32 tasks with two workers. Queued exits have priority, then live entries, then other work; every ninth priority dispatch serves the oldest queued task. No task is evicted. Rejection causes explicit backpressure. Existing WAL ownership and ingestion live/history lanes remain intact.

A provider-local account reader permits four active account requests and at most 32 active/queued requests. Exact-key in-flight reads coalesce. A bounded 64-key discovery cache lasts at most 200 ms, checks minimum bank slot and both clocks, and retains the original observation times. Each adapter's final evidence batch explicitly bypasses completed cached snapshots. Holder membership, fees, deployment claims, quotes and failures are not cached. Returned batches are isolated clones. Independent fee/deployment retrieval and market discovery overlap; final account consistency is still checked.

Validated plain review rows are deeply frozen and shared between trusted paper transactions. Positions, strategies, exact balances and lifecycle histories are cloned. General Store transactions retain full isolation. File and directory fsync and uncertain-publication blocking are unchanged.

## Supported liquid examples

Account-only `PoolMarketAdapter.inspect` returns a separately typed inspection subject with **no creation signature, commitment claim or freshness**. Paper review rejects it. It exists for protocol quote validation and never supplies a launch opportunity.

- Raydium CPMM: `7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny`, SOL/USDC, legacy token accounts and reviewed config/pool layouts.
- Meteora DLMM: `EDonP8DgRNR2xX59587WzD83cS2x4YYUjPdKvLa9hqQL`, permissionless-v2 pair, liquidity-mining fee behavior, supported token programs and actual adjacent bin arrays.

DLMM accepts reviewed pair types 0/3, bin array versions 2/3, either native-SOL orientation, and the existing bounded full-fill model. Permissioned/custom activation cases and unknown versions fail closed. Limit-order inventory remains unsupported. The pinned `isSupportLimitOrder` function determines whether bytes represent orders or legacy reward state; liquidity-mining reward bytes are not treated as orders. Creation decoder coverage remains the original pinned instruction variants; supporting account inspection does not add new creation instructions.

## Reproduction

```sh
npm test
npm run typecheck
# After restoring the archived baseline to /tmp/mintbot-phase5-before and linking node_modules:
npm run benchmark:phase5
npm run benchmark:market-phase5
npm run benchmark:paper-soak -- --seconds 60
# Uses a new dedicated output directory; existing ledgers are refused:
npm run validate:mainnet-paper -- --run --seconds 90 --max-candidates 6 --output docs/phase5/new-run
```

The mainnet script observes only Pump CreateV2 candidates, caps selected candidates and verification waiting, writes a dedicated WAL/fsynced ledger and stops before reload. It never assigns fresh timestamps to historical discoveries. No qualifying entry in the recorded run means zero paper fills, with specific blockers preserved.

`npm run validate:liquid-fixtures` refreshes the two account-only fixtures with current finalized RPC reads. This can change snapshot values; preserve old artifacts before recapturing. SDK references install **outside** the workspace:

```sh
npm install --prefix /tmp/mintbot-phase5-reference --no-audit --no-fund \
  @raydium-io/raydium-sdk-v2@0.2.84-alpha @meteora-ag/dlmm@1.9.14
npm run validate:phase5-quotes
```

Versions, tarball integrity and entry-file digests are retained in `quote-reference.json`. Only pure SDK calculations are invoked. SDK packages are not production dependencies and the repository lockfile was preserved. References use recorded account bytes and the chain Clock timestamp; replay process clocks are reset solely to run offline arithmetic. This is not current market evidence or a transaction simulation.
