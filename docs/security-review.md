# Security review of the implemented prototype

Reviewed 2026-11-03 by source inspection of `src/{risk,engine,wallet,execution,server,store,chain,telemetry}.ts`. This is an engineering review, not an independent audit or approval for funded trading. See the test run output for verification status; source inspection alone does not establish runtime protection.

## Scope and trust boundaries

The HTTP server runs **paper mode only** and refuses other `MODE` values. It does not load a trading key or invoke `RpcExecutor`. Public chain observations are kept separate from executable launches: The pinned Pump decoder verifies event schema, invocation attribution and curve PDA; `decodeLaunch()` throws an explicit unsupported-protocol error for other venues. A program log is not treated as evidence of verified liquidity, an authorized swap or a safe token.

The main trust boundaries are:

| Boundary | Implemented behavior | Remaining limit |
|---|---|---|
| Browser/operator → API | Bearer token, minimum configured token length, timing-safe equality; API origin check; body limit | Token possession grants all API operations. No roles, rate limiting, separate administrative credential, TLS or user authentication service |
| API → local state | Serialized clone/mutate/persist transactions, temporary file and rename | One process only; no distributed lock, fsync durability guarantee or redundant journal |
| RPC → observation/scanner | Program registry, notification shape checks, bounded deduplication/reconnects, mint owner checks | RPC can be stale, incomplete or misleading; no independent quorum or reconnect backfill |
| Strategy → paper execution | Spending/reserve/position limits and synthetic execution model | Synthetic liquidity and sellability assertions are fixtures, not economic evidence |
| Wallet utility → signer | scrypt-derived AES-256-GCM encryption; random salt/IV; authenticated decrypt; public-key consistency | Library utility only. No KMS/HSM, authorized swap policy, isolated signer process or integrated wallet lifecycle |
| Executor → chain | Preflight, original-signature persistence, bounded status reconciliation | Library only; persistent journal/ownership implementation, automated crash recovery and full swap validation required |
| Alert queue → Telegram | Server-generated messages, bounded message length and network timeout | Optional external disclosure of symbols/activity; not guaranteed delivery or durable exactly-once messaging |

`API_TOKEN` is a high-value control secret. The API state response contains portfolio and strategy data but no configured wallet-secret field. Default logging redacts Authorization and Cookie headers; this does not prove arbitrary future log messages cannot disclose secrets. TLS is required before traffic crosses an untrusted network. Keep the default localhost binding for development.

## Concrete findings and limits

The six entries marked corrected below were rechecked in the final source. Test execution results are recorded separately; a source-level correction is not a claim of independent audit coverage.

1. **Corrected: persisted-state validation.** Startup now parses the complete `StateSchema`, including strategies, positions, trades and bounded histories. Invalid persisted data fails startup. Structural validation does not prove economic consistency across balances and trades; retain backups and reconcile restored state.
2. **Corrected: synthetic replay IDs after restart.** Replay numbering now derives the maximum synthetic ID from retained `seen` entries rather than the capped launch-list length. This is adequate for the single-writer fixture workflow; distributed replay still needs durable execution ownership.
3. **Corrected: audit failure response.** PostgreSQL remains separate from the committed JSON transaction, but an insert failure now logs an error and returns the paper result with `auditPersisted:false`. No configured database also returns `auditPersisted:true`, meaning no requested insert failed, not that a database copy exists. The sink is not a transactional outbox and does not retry failed inserts automatically.
4. **Corrected: bounded buy history.** Both buy and sell paths now retain at most 1,000 trade records. This controls growth but means dashboard history is not a complete durable audit ledger.
5. **Timers never refresh market evidence.** Exit evaluation occurs on `mark()` and a one-second scheduler; time exits can use a still-fresh stored price, while stale evidence prevents execution. Stale prices block exits, and absent liquidity blocks simulated selling. A stop-loss cannot guarantee a realizable execution price.
6. **Stop and kill suspend automation.** Automatic sells require running and not killed. Kill also blocks manual selling. These controls freeze paper behavior; they do not liquidate positions. A future live system needs a separately authorized emergency-exit workflow, with explicit routing and spend limits.
7. **Corrected: mandatory token requirements.** Authority, transfer-restriction and sell-simulation checks now independently reject present/unknown/failed requirements before the additive threshold is considered. This depends on the truth and freshness of supplied evidence; a boolean fixture is not an independently performed simulation.
8. **Corrected: launch ingress validation.** `ingest()` now parses `LaunchSchema`, rejecting invalid field shapes and nonfinite numeric values. Parsing does not authenticate evidence provenance or prove that the price/liquidity values reflect executable markets. Read-only Pump discoveries are separate from paper entries; no decoded discovery is automatically executable.
9. **Live recovery is incomplete by design.** Existing prepared/submitted/unresolved execution records are returned rather than automatically resumed by `execute()`. Operators must reconcile the original signature; do not build a fresh swap after a timeout. Multiple workers need a durable unique execution key and exclusive ownership. Expired-but-unobserved is not proof of failure.
10. **Transaction construction is not transaction authorization.** `buildTransaction()` signs caller-provided instructions. Compute-budget shape validation does not enforce maximum SOL cost, destination, program allowlist, mint, minimum output, transfer restrictions, account ownership or instruction intent. Do not expose this primitive through HTTP or to untrusted plugins.

The UTC daily-spend bucket should be documented as UTC, independent of browser timezone. Changing clocks or restoring old state can affect counters; real spending authorization needs a durable ledger and trusted time policy.

## Economic and scanner limits

Paper execution uses a fixed synthetic network cost and a deterministic portion of configured slippage. It does not measure venue fees, failed-transaction costs, transfer taxes, actual pool depth, routing, chain landing time or sandwich losses. Its P&L is useful for checking accounting logic and controls, not for predicting profitability.

Mint scanning reports authorities, extension identifiers and largest token-account concentration. It explicitly leaves creator history, liquidity, extension configuration, beneficial ownership and sell simulation unknown. A pool vault can dominate account concentration, and mint/holder snapshots can be from different slots. None of these signals establishes that a token is safe or sellable.

## Requirements before a live implementation

- Version-pinned, fixture-tested protocol decoding and swap adapters, verified account/program ownership and fresh route/price/liquidity evidence.
- Separate signer authorization for exact intended instructions, total spend/fee limits, wallet reserve and minimum output; protected key provisioning and recovery.
- Durable execution journal, single-writer ownership, reconciled balance deltas, conflict prevention and recovery from crashes at each submission boundary.
- Independent mandatory risk requirements, stale-data handling, clock policy, fresh-price integration and authorized emergency exit.
- Mainnet read-only captures and transaction replay tests, then controlled funded validation with explicit operator configuration. Devnet and synthetic tests cannot establish mainnet launch integration.
- Dependency/security scanning, authenticated deployment, TLS, restricted filesystem permissions, backup restoration drills and an external review of any funded release.

No funded execution should be enabled merely by removing the paper-mode guard.

## Validation-driven corrections and dependency review

The wallet round-trip test caught shared-memory aliasing: `Keypair.fromSecretKey()` retained the decrypted buffer that the utility subsequently cleared. Decryption now copies into a dedicated `Uint8Array` before clearing temporary plaintext. The regression test verifies public identity after cleanup, wrong-passphrase rejection and identity mismatch. JavaScript copies and GC still prevent guarantees of complete key-memory erasure.

The vulnerable static-serving plugin was removed; the server now registers only exact build asset URLs discovered at startup and never maps arbitrary request paths to filesystem paths. API authentication is based on the matched route, including percent-encoded route spellings. Security response headers are applied globally.

The legacy Solana v1/SPL SDK dependency tree retains advisories in `bigint-buffer` (high, no upstream patched release) and `stream-json` via Jayson (moderate); npm reports dependent packages as affected too. A narrow Jayson-only uuid 11.1.1 override preserves its used CommonJS `v4()` API and removes that advisory. Do not apply `npm audit fix --force`: its proposed SPL downgrade and SDK major migration are incompatible with the current integrations. Fixed-width mint layout decoding reduces apparent reachability of the native bigint issue, and this application does not use Jayson stream filters/Assembler, but these are not proofs of safety. Migrate to a supported modern Solana SDK before funded release; see [official web3 maintenance guidance](https://github.com/solana-foundation/solana-web3.js/blob/maintenance/v1.x/README.md), [bigint advisory](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) and [uuid patch](https://github.com/uuidjs/uuid/releases/tag/v11.1.1).
