# Future execution architecture — design only

No new live signer, swap submission endpoint or funded transaction route is implemented. Startup still rejects live mode. Existing disconnected execution/wallet utilities do not meet this design merely because they exist.

## Ownership and authorization

A future, separately authorized executor consumes a finalized, eligible opportunity plus current account/quote evidence. Durable execution intent is distinct from ingestion ownership and the paper ledger. One executor owns a fenced lease for each intent. A unique constraint covers opportunity instruction identity + strategy revision + side + position generation. Atomic intent creation and limit reservations precede instruction construction. WAL completion never authorizes spending.

The intent stores raw integer input, denomination, token programs and decimals, minimum output, allowed fees/rent, quote digest, provider/bank/commitment, policy version, expiry, account metas, allowed program versions and withdrawal destination. Neither a log label nor an API-provided JSON safety assertion can authorize it. Revalidate current authorities, transfer configuration, liquidity, sell feasibility and quote age before simulation and again before signing. An upgrade or changed route invalidates the intent.

A signer runs in an isolated process/service with explicit operator authorization and no dashboard access to secrets. Authorize only reviewed exact program IDs, instruction discriminators, writable accounts, fee payer, token destinations and public wallet identity. Enforce integer per-intent/daily/position limits, minimum SOL reserve and fee caps there independently. Secrets belong in a reviewed KMS/HSM or equivalent protected custody boundary; API bearer access alone must not grant signing. Rotation, revocation, network isolation and audit retention require operational review.

## Venue builders

Each builder is versioned against reviewed IDL/source, deployed ELF identity and real simulation fixtures. It must decode its output for an independent policy check.

| Venue | Builder contract and remaining checks |
|---|---|
| Pump | Reviewed exact-in/out bonding-curve instruction, native/quote mint variant, fee recipients and creator vault, token-account creation, completion/migration boundaries and fee-tier crossing |
| PumpSwap | Reviewed pool swap variant, actual reserves versus virtual pricing, fee recipients/buckets, canonical creator authority, required global/fee accounts |
| Raydium CPMM | Exact-in swap, vault authority, ordered input/output token programs, current trade/creator fee direction, transfer behavior and mint decimals |
| Meteora DLMM | Exact-in supported swap revision, direction, active/bin-array/bitmap coverage, dynamic fee state, complete-fill/minOut, rewards versus order modes and activation permissions |

Account-state arithmetic is only an estimate. Build the **actual intended message** with its real accounts, ATA/wrapped SOL operations, compute budget and priority policy. Run read-only RPC `simulateTransaction` with the intended unsigned message and appropriate signature verification disabled until authorization; inspect program errors/logs, token balances, missing accounts and CU use. Simulation must not be described as landing or a guaranteed fill. Public dummy-payer simulations that fail for missing balances do not validate an executable route.

CU limits should derive from successful actual-route simulations plus a bounded reviewed margin; do not use the current representative 200k-CU fee estimate as measured usage. Enforce a total priority-fee cap in lamports, integer micro-lamports/CU and compute-limit bounds. Sample recent priority fees for the actual writable set, retaining source and age. Recompute network cost, ATA rent and wrapped SOL liabilities. Apply minimum output in the protocol instruction itself, not only an off-chain comparison.

## Durable intent state machine

`RESERVED → BUILT → SIMULATED → AUTHORIZED → SIGNED → SUBMISSION_ATTEMPTED → LANDED → CONFIRMED → FINALIZED → RECONCILED`

Explicit alternatives: `REJECTED`, `EXPIRED_UNSUBMITTED`, `FAILED_ON_CHAIN`, `UNCERTAIN`, `ROLLED_BACK`, `MANUAL_REVIEW`. Persist every transition and evidence atomically. Store exact serialized bytes, original signature, recent blockhash/last-valid block height and fencing token durably **before any network submission**. Construction, submission acknowledgment, landing observation, confirmation and finalization are distinct facts; none implies another.

A submission timeout enters `UNCERTAIN`; it must never create a replacement signed spend automatically. Query original-signature status, block height, transaction and actual balances through independent providers as required by policy. Retransmitting identical signed bytes preserves identity but still requires an unexpired blockhash and reserved limits. Replacement after provable expiry/non-execution is a new explicitly linked authorized intent; a provider `null` response alone is insufficient proof. Reconcile the original signature before releasing reserved funds. Persist all uncertainty across crashes.

Forks/provider conflicts freeze reconciliation and prohibit duplicate spending. A confirmed-but-rolled-back landing is never finalized. Track reserved, provisional and finalized balance effects separately; only authoritative outcomes release reservations or establish positions. A process lease and idempotent database constraints prevent two instances owning the same spend after restart.

## Economic reconciliation and emergency controls

Use actual pre/post SOL and token balances, fees, ATA rent/closures, wrapped SOL, transfer fees and inner instruction effects for cost basis. Separate network fees, protocol fees, slippage and rent; never double-charge a fee already included in token proceeds. Reconcile partial fills, dust and unexpected transfers. Paper quantities/minimum-output assumptions cannot initialize actual funded positions.

An emergency stop first revokes new intents/signing/submission; it does not pretend existing uncertain transactions vanished. Retain monitoring and reconciliation. Emergency liquidation requires separately authorized current quotes and may fail for stale evidence, transfer restrictions, price impact, outages or no liquidity. No stop-loss execution or recovery time is guaranteed. Restarts load stopped and require explicit operator review of unresolved intents.

Release gates include protocol-specific transaction simulation, fault-injected submission/landing/fork tests, durable multi-process ownership, signer threat review, real balance reconciliation, provider incident drills, limit/rent edge cases, deploy/ELF pinning and separately authorized funded testing. None is completed by this phase's read-only experiment.
