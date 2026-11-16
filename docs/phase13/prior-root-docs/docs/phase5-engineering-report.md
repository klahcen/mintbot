# Phase 5 engineering report

Phase 5 adds explicit finalized paper research policies, observation lifecycle provenance, bounded account coalescing/priority scheduling, durable review-history optimization, liquid CPMM/DLMM quote fixtures and exit/restart validation. **Live trading remains disabled. No qualifying mainnet paper entry was manufactured.** The captured verified creations reached durable reviews and failed actual safety/strategy checks. This is research validation with remaining execution blockers, not funded-trading readiness.

## Repository audit and preservation

The audit began with the Phase 4 engineering report, README/contracts, 142-test baseline, monitoring/verification, market adapters, exact paper ledger, Store, WAL, queue scheduling and server safety controls. The baseline passed 142/142. It was copied before edits into `/tmp/mintbot-phase5-before`; the source archive and hash manifests permit reproduction. This workspace has no `.git` metadata, so file hashes replace a git diff.

The original synthetic engine, dashboard, telemetry, journal workers, protocol creation whitelist and wallet/execution utilities were preserved. No app/container rebuild, wallet signing, funded submission or deployment occurred. Production dependencies and lockfile were preserved; reference SDKs were installed outside the workspace. Source changes are listed in `phase5/source-change-summary.json`.

## Finality and freshness findings

The existing WebSocket subscriber requests **confirmed**, while `VerifiedReadRpc.verify` requests **finalized** transactions and accounts. The Phase 4 policy combines a five-second receipt/block-time limit and eight-slot lag with finalized creation proof. This combination has no guaranteed viable launch window. Solana defines confirmed and finalized differently; notification receipt cannot establish finalization. See [official RPC commitment definitions](https://solana.com/docs/rpc) and [confirmation guidance](https://solana.com/developers/cookbook/transactions/confirmation).

The first live run demonstrates the distinction more precisely than a nominal slot-duration calculation. Two verified creations reached market state with event-to-bank lags of **23 and 85 slots** and block ages of **6,151 and 19,705 ms**. Finalized verification completed **1,850 and 807 ms after receipt** respectively. These are observation-to-response durations, not the chain's confirmation-to-finalization interval: the public notification stream can deliver transactions already old enough to be finalized when queried. Block time has second resolution and wall-clock comparison depends on host/provider clock accuracy. One provider and six selected candidates cannot establish finality distributions or competitive timing.

The strict default remains 5,000 ms / 8 slots. An explicitly named `finalized-paper-research` profile permits 60,000 ms / 160 slots, requires finalized proof, rejects historical/resumed entry, and preserves every safety, quote-age, fee-age, capital and strategy check. Reviews and service snapshots record the complete profile. The server's bounded finality wait is 12 seconds by default and 50 seconds under this research profile, with 2-second polling and 5-second per-request transport timeouts; a final in-flight request can overrun the wait deadline by its timeout. WAL retries never reset receipt time or make resumed work live.

The lifecycle persists `DETECTED → PROVISIONAL → VERIFIED → ELIGIBLE → PAPER_EXECUTED`, recording commitment, provider, wall time and age at each transition. Missing earlier receipts are explicitly unobserved. Notification-level provenance links to exact decoded instruction identity. Rollback/provider identity conflicts invalidate observations. Eligibility and fill transitions publish atomically with the exact paper debit and position. No API allows an operator to promote a provisional receipt into a finalized proof.

Confirmed preparation can fetch transaction candidate keys without waiting for finalization. The bounded experiment exercises this read-only method; it never returns an eligible launch and its confirmed evidence cannot satisfy finalized market risk. Server preparation records only notification provenance; eager confirmed market retrieval is deliberately not enabled. The experiment does not establish a latency improvement from this extra RPC.

## Real mainnet paper validation

The first bounded run used current confirmed Pump notifications, strict pinned finalized creation validation, current finalized market accounts, complete bounded owner enumeration, actual integer buy/sell estimates and a dedicated file/directory-fsynced paper ledger. The original strategy's 20-SOL liquidity threshold and other settings were retained. Only the entry-age research profile was explicitly selected.

In 90 seconds it received **10,669 notifications**, selected **six** CreateV2 candidates, verified **two** and committed **two rejected paper reviews**. Four candidates failed strict validation: one truncated binary layout and three instruction/event mismatches. Those failures are retained; they were not loosened to increase success counts.

- `5fuT35qYpjwvtrBjfLVaqBVsSc1TLZqe7sK95RtajCBSZpM7Zcta1iKiCUg8hfYbNZ5hiB8jycJYQXqEyWgXYusF`: mandatory circulating-owner concentration above 20%, strategy liquidity and exact liquidity threshold.
- `3M4aezFx8THz2uvFREbLPGehUrk27i7Vn5VjgZc9K15gnUQ3oSH5e3hSbQnbDvg3ReNQR47A3m6UAi4JXwBk6sfn`: concentration above 20%, unavailable sell route, unknown/excessive impact and nonpositive/unknown net sell economics.

No qualifying token was observed, so **zero actual observed-data paper fills** occurred. The original WAL, complete captures, review evidence, integer ledger and stopped reload check are in [mainnet/evidence.json](phase5/mainnet/evidence.json). A final-source follow-up is recorded separately in the [measurement summary](phase5/measurement-summary.md); it does not overwrite the first capture. Synthetic unit safety assertions were never supplied to these experiments.

## Liquid market fixtures and quote review

The new account-only inspection API has a distinct subject type without a creation signature, creation commitment or launch freshness. Paper review rejects inspection subjects, including untyped runtime callers. Discovering an old liquid pool does not create a launch proof.

- **Raydium CPMM**: real finalized SOL/USDC pool `7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny`, obtained from the [official SDK example](https://github.com/raydium-io/raydium-sdk-V2-demo/blob/master/src/cpmm/swap.ts). Captured pool/config/mints/vaults/Clock validate orientation, decimals, custody, fee buckets and current quote output. Reference: `@raydium-io/raydium-sdk-v2@0.2.84-alpha`.
- **Meteora DLMM**: real finalized pool `EDonP8DgRNR2xX59587WzD83cS2x4YYUjPdKvLa9hqQL`, obtained through bounded filtered account discovery ranked by observed volatility-update time. Captured pair, actual adjacent bin arrays, mints, custody and Clock validate an eight-decimal base token and native SOL quote. Reference: `@meteora-ag/dlmm@1.9.14`.

All **16** retained buy/sell reference cases match exact integer output and total fees. Larger DLMM cases traverse two and three bins. Version, tarball integrity, reference entry digest, input/output/fee and traversal counts are in [quote-reference.json](phase5/quote-reference.json). Account bytes remain unchanged in replay; process clocks are reset only to run offline pure math. This does not make historical state current.

DLMM review adds explicit native-SOL orientation reversal and reviewed pair types 0/3 and bin array versions 2/3. The pinned SDK's `isSupportLimitOrder` determines whether order fields are meaningful or reused legacy reward state. Liquidity-mining pairs do not interpret legacy reward bytes as orders. The reviewed permissionless-v2 type does not use permissioned/custom activation logic; the official activation method reference and SDK enums document that distinction. Actual order inventory, permissioned/custom activation and unknown variants remain unsupported. The positive DLMM fixture covers SOL as token Y. A positive SOL-as-X quote fixture and independent transaction simulation remain absent; the model’s orientation branch is not a separate verified market variant claim. Creation decoder coverage is unchanged. Earlier liquid order-bearing/invalid-vault probes remain rejected in the raw artifacts.

No independent deployed-program transaction simulation was achieved. SDK arithmetic and retained protocol-source review are evidence of quote calculation agreement, not swap simulation, atomic account availability, CU measurement or a guarantee of execution. Actual signed/unsigned route simulation remains an execution release gate. The older Meteora discovery host and some Raydium API requests returned 403/404; a broad DLMM response exceeded the 4-MiB cap and was canceled. A subsequent filtered scan was bounded and successful. The [current official Meteora API overview](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/api-reference/overview.mdx) identifies the newer Data API host; that host also returned 403 in this environment.

## Performance and reliability

Independent account discovery and external fee/deployment reads now overlap. Account retrieval permits four active requests and 32 admitted tasks; exact-key concurrent requests coalesce. A 64-key, 200-ms, provider/slot-aware discovery cache retains original timestamps. Final adapter evidence batches bypass completed cached results; holder lists, fees, deployment authorization, failures and quotes are never cached. This preserves conflict checks and prevents a cache hit from renewing freshness.

Market scheduling retains capacity 32 and concurrency two. Queued exits precede live entries; every ninth priority dispatch services the oldest task to bound starvation. No accepted task is evicted and all refusals remain explicit. Existing WAL acknowledgement/completion and weighted ingestion live/history lanes are preserved.

Store profiling targets repeated cloning and validation of 200 bounded market review rows. Validated plain rows are deeply frozen and shared by trusted paper mutations; active exact balances/positions/lifecycle remain isolated. File and directory fsync and uncertain-publication blocking are unchanged. Mutation-isolation and restart tests cover the optimization.

[Measured before/after tables](phase5/measurement-summary.md) and raw artifacts contain p50/p95/p99, throughput, queues, errors, CPU, memory and integrity checks. The same harness, source baseline, offered populations and durability were used on each side. Three repetitions are diagnostics, not statistical proof or production SLOs.

The mixed live/history result remains **12.4% slower** than the Phase 4 source baseline; slow-RPC is **0.5% slower**. Mixed-run Store validation and strategy p95 vary alongside CPU/throughput; the ranges overlap and do not establish a single cause. Full verification remains bounded but still performs complete transaction/account validation; this essential work was not replaced with log-label trust or an unvalidated shortcut. The benchmark replays finalized proofs separately, while the live artifact measures actual verification/RPC calls.

The separate warm-history Store benchmark measures **50.5% higher durable-review throughput** and **623.6% higher in-memory throughput**, comparing 200 retained rows and 100 rejected reviews per job. This is workload-specific evidence of the history optimization, not an end-to-end ingestion or mainnet execution improvement. Serialization/fsync continue to dominate much of the durable path. Performance regressions remain explicit blockers.

## Automatic exits and accounting

New deterministic recorded-state unit tests drive take-profit, stop-loss, trailing-stop and liquidity-drop decisions with fresh integer account-state sell estimates. They reconcile conservative minOut, pool fees already embedded in proceeds, modeled network costs, original exact cost basis and realized lamports. Automatic trades retain their actual rule name. Excessive/negative impact, stale quotes, unavailable routes, restricted tokens and expired fees retain positions. The entry cost includes modeled network/rent; exit cost excludes new ATA rent. No fee is deducted twice from token output.

The sustained paper soak is separate, explicitly UNIT replay with safety/fee overrides; it tests durable entry/exit, stale refusal, duplicate suppression, restart stop and exact ledger conservation. It measured 60.21 seconds, 333 buy/full-sell cycles, 333 suppressed duplicate reviews, six stopped durable reloads and 34 stale exits refused; no positions remained and exact ledger conservation passed. Detailed timings and counts appear in the summary. It is not a mainnet strategy-return result or a provider endurance test. Stop-loss, trailing-stop and emergency selling remain conditional on current executable-state liquidity; no execution guarantee is claimed.

## Verification and security review

The complete suite passes **168/168**: all 142 original tests plus 26 new cases, zero skipped. Backend and dashboard typechecks pass. No application build was run. Baseline/new logs and original-test hash preservation are retained.

New coverage includes actual recorded creation-to-review replay, processed/confirmed/finalized transitions, rollback/identity conflicts, unknown owner evidence under research policy, expiry, bounded concurrent reads, aged cache/outage handling, two-sided real pool math, unsupported types, exact cost basis, automatic exits and concurrent duplicate restart behavior. Original WAL crash/reconnect tests remain intact. Live experiments preserve missing evidence and errors rather than replacing them with stubs.

Security review found no new signer/submission capability or weakened startup/auth controls. Account inspection cannot enter paper trading; mandatory safety unknowns still reject, immutable cache clocks cannot refresh evidence, final account retrieval remains uncached, live mode remains rejected and reference SDK dependencies are isolated from runtime. Provider attribution on multi-provider notification receipts remains explicitly unattributed; finalized proof/account provider provenance is retained. Loader-slot pins do not prove ELF identity or semantic equivalence. Complete holders remain bounded to 20 accounts, not a largest-account shortcut or beneficial-owner claim.

The [future execution architecture](phase5/execution-readiness.md) specifies protocol builders, isolated authorization, integer spending/minOut, actual simulation/CU/fees, durable intents, fenced ownership, original-signature reconciliation, actual balances, shutdown and uncertain recovery. It is a design deliverable only. [Remaining funded blockers](phase5/funded-trading-blockers.md) remain prerequisites for any separately authorized live work.
