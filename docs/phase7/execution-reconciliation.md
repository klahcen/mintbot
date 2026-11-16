# Phase 7 execution reconciliation and integer economics

This is an offline model for recovery decisions. It has no signer, RPC transport, broadcaster, wallet access, or connection to the application's execution path. `SIMULATED_SUBMISSION_ATTEMPTED` means a deterministic injected event. It is never an actual broadcast, and no model state authorizes spending.

## Original identity and uncertainty

`src/simulation/reconciliation.ts` replays a bounded event history against an immutable intent ID, original packet digest, recorded public signature, and last-valid block height. Only one simulated attempt is permitted. A replacement packet, even with an unchanged intent ID, is rejected; a second attempt after timeout, expiry, failure, confirmation, rollback, restart, or provider conflict is also rejected. The model deliberately offers no automatic retry or second-spend API.

The supplied public fixture is `docs/phase3/fixtures/pump-creation.json`. Its recorded transaction/signature anchors identity; it is a creation transaction, not a newly submitted swap. Because that fixture contains parsed transaction JSON, the replay artifact explicitly labels its digest as SHA-256 of that recorded representation. It does not claim that digest is the transaction's original serialized wire bytes. Block heights, status responses, provider identities and rollback outcomes in the replay are injected. These are not independent actual provider observations.

| Injected observation | Model result | Spending consequence |
| --- | --- | --- |
| Submission attempted | `SIMULATED_SUBMISSION_ATTEMPTED` | Original attempt consumed |
| RPC timeout / missing status | `UNKNOWN` | Remain uncertain; no second attempt |
| Process restart during uncertainty | Rebuild from original identity/history | Preserve consumed attempt |
| Confirmed success | `CONFIRMED` | Continue observing original identity |
| Finalized success | `FINALIZED` | Retain original outcome evidence |
| Finalized execution error | `EXECUTION_FAILED` | Fee accounting remains necessary |
| Injected later root excludes confirmed slot | `ROLLED_BACK` | Uncertain original outcome; no new spend |
| Block height exceeds last-valid height | `EXPIRED_UNRESOLVED` | Cannot infer the transaction never landed |
| Providers disagree | `PROVIDER_CONFLICT` | Manual reconciliation; later agreement cannot automatically reset it |
| Finalized outcome subsequently contradicts evidence | `PROVIDER_CONFLICT` | Fail closed |

A missing status does not establish that a transaction was never executed. Blockhash expiry alone also does not establish nonexecution. Nonfinalized execution errors remain unknown because a fork can disappear. Contradictory evidence after finality is surfaced instead of silently replacing an earlier conclusion. Repeated provider IDs cannot masquerade as two independent sources. The model preserves whether each round has one or multiple distinct provider labels; distinct labels in injected tests are not proof of operational independence.

Snapshots serialize the original identity and events, then recompute derived state on restore. A SHA-256 envelope detects accidental corruption; it is not authentication against a malicious writer. The pure model does not implement durable storage. Production PostgreSQL ownership/recovery is a separate subsystem, documented in [database reliability](database-reliability.md). An ingestion WAL completion is not an input to this model and cannot authorize execution.

## Exact economic reconciliation

`src/simulation/economics.ts` compares exact signed integer owner-balance postings against authoritative pre/post balances. Amounts are decimal integer strings converted to `bigint`; floating-point token/UI amounts are rejected. Assets must be unique, observed, and explicitly named. Any unexplained difference, including one atom, makes the result inconsistent.

Supported posting purposes are swap principal, pool fees, platform fees, base fees, priority fees, ATA rent, rent refunds, wrap/unwrap conversions and explicitly identified rounding. Native fees and rent must be denominated in SOL lamports. Wrap/unwrap postings must balance SOL and WSOL in equal integer units with the correct debit/credit direction. Failed atomic transaction accounting permits network charges; surviving principal transfers, pool/platform charges or ATA rent are rejected. Missing authoritative balances remain unknown/inconsistent.

Postings describe owner balance effects and must not count the same fee twice. For example, if quoted net principal already includes a pool fee, that fee cannot also be subtracted as a separate owner debit. The module does not invent a pool/platform fee decomposition when the captured response does not independently provide one.

The four real Phase 6 unsigned buy simulation captures are replayed in economic tests. Their payer SOL changes, actual returned total network fees, validated configured priority fee, persistent ATA rent, exact quote output, and actual initial token holdings reconcile with zero differences. Raydium's captured user output account already held 100 token atoms; the test retains that inventory instead of treating its post-balance as the swap output. Temporary WSOL rent is excluded from persistent rent because creation and closure refund it in the same transaction. These comparisons reuse historical read-only simulation evidence; they are not new current quotes or realized trades.

Pool/platform fee splits, failed-transaction charges, rent refunds and wrap/unwrap edge cases have deterministic injected tests. That coverage is not a claim of actual mainnet failure receipts or independently observed fee-recipient distributions. Current sell simulation accounting belongs to [sell simulation validation](sell-simulation-validation.md), where actual observations and blockers must remain explicit.

`disposePosition` allocates integer cost basis using floor division for a partial disposal. The final disposal absorbs all remaining cost basis so repeated one-atom exits cannot lose the division remainder. It retains exact remaining quantity, remaining cost, and realized net PnL, including negative PnL and values larger than JavaScript's safe integer range. Net proceeds must already include the known execution/network costs; this helper neither values dust at an invented price nor executes an exit.

## Reproduction and evidence

```sh
npx tsx --test tests/execution-reconciliation.test.ts tests/execution-economics.test.ts
npx tsx scripts/phase7-reconciliation-replay.ts
```

The focused run passes 14 tests: six lifecycle scenarios and eight economic tests, including four recorded protocol simulation comparisons. `docs/phase7/reconciliation-replay.json` preserves ten model states, their histories, original recorded signature, source fixture SHA-256 and explicit offline labels. `docs/phase7/reconciliation-tests.log` captures the focused test output. Snapshot restore is a deterministic restart model; real process/database crashes and fencing require the separate PostgreSQL tests.

Remaining production work includes an independently authorized signer, canonical wire-packet persistence, independent authenticated provider identities, actual signed-transaction status reconciliation, manual operational resolution and reserve settlement. None is connected in this phase.
