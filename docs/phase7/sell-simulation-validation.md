# Actual unsigned sell simulation validation

Measured 2026-11-10, finalized public mainnet RPC. These are actual `simulateTransaction` results using public token-holder inventory, complete zero-signature v0 messages, `sigVerify:false`, `replaceRecentBlockhash:false`, current block/rent/deployment evidence and the existing pinned builders/wire validator. No signatures, authorizations, funds, balances or fills were manufactured. The official [Solana simulation contract](https://solana.com/docs/rpc/http/simulatetransaction) explicitly permits unsigned simulation when signature verification is disabled; this confers no spending authority.

| Venue | Sell input atoms | Quote / observed output lamports | Minimum output | CU consumed | Total network fee | Capture |
|---|---:|---:|---:|---:|---:|---|
| pump | 352965749 | 9750 / 9750 | 9652 | 57,010 | 6000 | [sells-retry.json](sells-retry.json) |
| pumpswap | 1890443439 | 41332 / 41332 | 40918 | 95,490 | 6000 | [sells-inventory.json](sells-inventory.json) |
| raydium-cpmm | 50 | 597 / 597 | 591 | 45,802 | 6000 | [sells-raydium.json](sells-raydium.json) |
| meteora-dlmm | 236266614 | 1076925 / 1076925 | 1066155 | 50,871 | 6000 | [sells-inventory.json](sells-inventory.json) |

All four have exact token debit, zero quote-output difference and zero unexplained native difference when recomputed by the current accounting code. The captured total fee is 6,000 lamports, including a configured 1,000-lamport priority fee from the 1,000,000 CU limit / 1,000 micro-lamport price; actual CU consumption is separately measured. This is not an optimized CU budget claim. Raydium's tiny 50-atom USDC inventory produces only 597 lamports before a 6,000-lamport network fee: sell feasibility is **not economic eligibility**. No mandatory risk rule was weakened to call this an opportunity.

## Inventory and account provenance

The diagnostic discovers public holders using bounded largest-account queries, reviewed captured inventory, at most four recent public transaction lookups and, where needed, a bounded mint-filtered token-account enumeration. Discovered addresses are hints only. Current finalized account reads verify mint, token-program owner, on-curve owner, canonical ATA, initialized/unrestricted account, native fee/rent balance and positive inventory before construction. Each venue attempts at most two holders, taking at most the recorded buy-output amount and half the actually observed inventory. Current final construction reparses and requotes its own bank. Historical/inspection provenance is retained; none becomes a fresh launch identity.

No payer top-up, test-token minting or fake post-buy balance is performed. A sell uses inventory that actually exists for a public account, with no ability or permission to sign for that account. The wrapped-SOL path only closes a newly created temporary ATA to its original public payer; pre-existing WSOL remains custody. Full required account bytes, source/provider/slot, packet, account-management instructions, minOut, fee/rent caps, actual logs/errors/pre-post effects and CU are retained. `evidence-summary.json` indexes immutable captures by SHA-256 and recomputes their accounting offline; it does not renew clocks.

## Fees and exact accounting

The returned native/token balance arrays establish actual network fee and owner effects. Pump recipient deltas are 47 protocol + 30 creator + 47 buyback = **124 lamports**, equal to the pinned quote fee. PumpSwap observed named recipient WSOL deltas are 195 protocol + 126 creator + 195 buyback = **516 atoms**; the quote total is 525, with the retained LP component still model evidence. Raydium/DLMM complete LP/protocol fee decomposition is not independently established by requested account states. Those fees remain pinned-account model estimates with exact aggregate owner-output comparison; no invented actual fee split is claimed.

`simulationAccounting` now checks sell-side native effects for both temporary and existing WSOL. Native-output sells reconcile output minus returned fee and persistent rent; existing-WSOL sells require no unexplained native debit/refund and validate WSOL proceeds. Tests reject a one-lamport unexplained native change and missing token effects. The separate exact economics module covers fees/asset denomination, failed-transaction network charges, rent refunds, partial cost basis and dust with deterministic tests; these are not actual landed failed transactions.

## Failures retained

Initial discovery received HTTP 429 for all four largest-account queries. Other attempts retained read timeouts, recent transaction version RPC -32015, expired/unsupported deployment evidence, and tiny-amount insufficient executable liquidity. The successful Pump retry and larger-but-still-owned Raydium amount are separate artifacts; failures were not overwritten. The captures show three earlier sell successes across one run/retry and the final separate Raydium success. No provider agreement or broad variant coverage is inferred.

## Bounded fresh monitoring

The explicit Phase 7 monitor ran **90 seconds**, observing **7,561 notifications**, selecting **six Pump CreateV2 candidates**, verifying **five creations**, recording **five durable paper decisions**, and creating **zero trades**. It retained one verification rejection (`Pump instruction/event mismatch`), four market-read/unsupported-state rejections (`Curve identity, supply or decimals mismatch`), and one candidate with concentration/liquidity failures. That candidate has three overlapping reasons: concentration >20%, strategy liquidity, exact liquidity threshold. These are reason counts, not three different rejected opportunities. Raw evidence includes one RPC error.

The `SimulationGatedPaper` wrapper leaves the default server/dashboard unchanged and is opt-in in `phase7-mainnet.ts`. Initial mandatory risk failures are recorded through the existing paper engine before simulation. An eligible candidate must have real public inventory for its linked sell amount, pass actual buy **and** sell simulations plus exact accounting, then pass original risk/freshness/strategy checks again. Missing evidence records a durable rejection; no synthesized post-buy inventory is used. No candidate in this run reached that simulation gate, so **fresh receipt → buy+sell simulation → eligible paper entry remains unproven**. Historical sell diagnostics do not fill that gap.

The durable paper ledger and ingestion WAL were reopened/checked after the bounded run. `mainnet-bounded/evidence.json` retains every candidate, verification issue, decision, actual receipts/monotonic latency, queues and counters; `evidence-summary.json` groups verification and paper rejections. Five paper decisions plus one verification rejection account for all six candidates. A multi-hour mainnet soak was not performed; this short sample is not production uptime or a competitive launch-latency result.

## Reproduce

```sh
npm run validate:sell-simulation -- --run --output docs/phase7/new-sells.json
npm run validate:phase7-mainnet -- --run --seconds 90 --max-candidates 6 --output docs/phase7/new-monitor
node --import tsx scripts/phase7-evidence-summary.ts
```

New sell output paths are mandatory; existing captures are refused. A current public holder, pool or reviewed deployment can change or cease being usable. Source quote expiry remains 1,500 ms; preparation and deployment evidence retain five-second bounds. Default endpoints can reject/rate-limit. `SOLANA_RPC_URL`/`SOLANA_WS_URL` may select read-only providers; no private keys are accepted. Discovery inventory is explicitly incomplete and cannot establish owner concentration. Actual sell success remains limited to the named layouts/routes/contexts, not all variants of those brands.
