# Public protocol evidence and transaction analysis

Research date: 2026-11-03. These are documented facts, one observed public transaction, and explicit integration limits. No reference platform's private APIs, wallets, signing service or source code were accessed.

## Verified protocol registry

| Protocol covered by monitoring | Mainnet program | Primary evidence |
| --- | --- | --- |
| Pump bonding curve | `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` | [Pump public program documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md) |
| PumpSwap | `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA` | [PumpSwap public program documentation](https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md) |
| Raydium CPMM | `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C` | [Raydium canonical program registry](https://github.com/raydium-io/raydium-docs-v1/blob/main/reference/program-addresses.mdx) |
| Meteora DLMM | `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` | [Meteora developer documentation](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/index.mdx) |

The registry is a configurable input, with syntactic and duplicate checks. Documentation provenance does not attest deployed bytecode or validate arbitrary replacement entries. Mainnet monitoring covers these four program variants, not every Raydium or Meteora product. Live trading must pin and audit deployed program versions, IDLs and expected account constraints separately. Pump documents bonding-curve graduation into PumpSwap; that does not imply identical instruction or event formats. Meteora directs public integrations to its published IDL and official SDK. A previous Raydium documentation URL returned 404 during research; the official repository supplied the listed address.

A public finalized `getMultipleAccounts` read at slot 464980404 found all four registry addresses executable and owned by the upgradeable BPF loader. The ordered response is preserved in [the account snapshot](fixtures/mainnet-program-accounts.json), matching table order. This verifies deployment presence at that slot, not program-data hashes, upgrade authorities or bytecode compatibility with the pinned event schema.

## Read-only public transaction observation

Public endpoint: `https://api.mainnet-beta.solana.com`. Methods used: `getSignaturesForAddress` for the verified PumpSwap address, then `getTransaction` with `encoding: jsonParsed`, `commitment: finalized`, `maxSupportedTransactionVersion: 0`. The original JSON-RPC response is preserved in [the historical fixture](fixtures/mainnet-pumpswap-transaction.json).

Signature: [`3BSZFWih51SjtCUEtJD7fxFdSuyBbTV1Du1ZV7k2pgwX3SGBF6q5n3kiRezb5tSbBNWkEADoaudzfvXQjKMaQsBF`](https://explorer.solana.com/tx/3BSZFWih51SjtCUEtJD7fxFdSuyBbTV1Du1ZV7k2pgwX3SGBF6q5n3kiRezb5tSbBNWkEADoaudzfvXQjKMaQsBF)

| Observed field | Value |
| --- | --- |
| Slot | 464978495 |
| Transaction format | v0 |
| Finalized error | null |
| Network fee charged | 7,000 lamports |
| Requested CU limit | 200,000 |
| CU price | 10,000 micro-lamports per CU |
| Consumed CUs | 57,286 |
| Requested priority fee | ceil(200,000 × 10,000 / 1,000,000) = 2,000 lamports |
| Top-level application program | `2iCw1tmwdomXBv5mwr2uGzU4GQifsvWKB4RgAfw6Ttd1` (identity unverified) |
| Inner programs | PumpSwap, SPL Token, Token-2022 |

The two ComputeBudget instructions decode from `Fj2Eoy` (tag 2, u32 limit) and `3GAG5eogvTjV` (tag 3, u64 price). Priority fee is based on requested resources, not consumed CUs, as described in [Solana's compute-budget documentation](https://solana.com/docs/core/fees/compute-budget). The 7,000-lamport fee is consistent with 5,000 base plus 2,000 priority; platform fees and token transfer fees cannot be inferred from that fee field alone. The transaction's inner instructions and balance changes must be examined for those costs. No associated-token-account creation was observed in its instruction inventory. Absence in this transaction is not evidence that another route skips account creation.

Observed path: compute configuration → unclassified application instruction → PumpSwap CPI → token-program transfers. This is evidence of composability, not attribution to any particular trading bot. An application router, wallet integration, aggregator or independent trading client could produce such a path. The transaction includes both token programs, so assuming all tokens use the legacy SPL Token layout is unsafe.

The sample was fetched already finalized. It provides no submission timestamp, initial observation timestamp, confirmation duration, latency benchmark, market quality assessment, bot profitability or guarantee of repeatable execution. One transaction does not establish a distribution or permit meaningful route-performance comparisons. Additional publicly identified direct swaps and route samples remain future work.

## Implemented contracts and failure behavior

`SolanaMonitor` makes one documented `logsSubscribe` mention filter per configured program. It maps server subscription IDs, records slots, bounds in-memory deduplication and caps total reconnect attempts with exponential delay. Its callback reports program observations, including failed transactions, for persistence by the caller. Old socket generations cannot emit after restart. It does not backfill disconnect gaps or survive process restart on its own; production operation needs durable checkpoints and signature backfill before decisions resume. Bounded memory means old signatures may reappear after eviction. A confirmed observation can also be rolled back. The replay fixture is finalized.

`inspectTransaction` fetches finalized legacy/v0 transactions and inventories top-level and inner programs, parsed instruction types, token balances and supported compute-budget instructions. Missing transaction data fails explicitly. Program attribution and protocol instructions require additional verified adapters. The current web3.js v1 integration advertises maximum transaction version 0, so newer transaction versions fail through RPC; [Solana's current JSON structures](https://solana.com/docs/rpc/json-structures) describe newer resource configuration that this implementation does not claim to decode.

`decodeLaunch` implements the exact Pump `CreateEvent` schema from [official IDL commit 639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/idl/pump.json). The extracted schema is preserved in [the IDL fragment](fixtures/pump-create-idl-fragment.json). It bounds Borsh strings, validates UTF-8 and booleans, requires a complete invocation stack attributed to Pump itself, verifies the bonding-curve PDA and token program, and rejects failed observations, unexpected fields and incompatible layouts. It ignores event-shaped data emitted by other programs, including nested CPI spoof attempts. Older Pump schemas require separately pinned decoders; no field-offset guessing occurs. Current decoder fixtures are synthetic protocol-format examples, not independently observed mainnet create transactions. A historical mainnet CreateEvent fixture remains required before claiming deployed launch integration validation. Every other venue raises `UnsupportedProtocolError`. Swap builders remain unimplemented; reserves in events are protocol data and do not substitute for verified current executable liquidity. Autonomous protocol launch trading remains disabled.

`scanMint` uses the official SPL Token SDK to validate account ownership and initialization, decode supply/decimals/mint/freeze authorities, enumerate Token-2022 extension types and obtain largest token-account concentration. BigInt arithmetic preserves supply precision. Extension types are flags for further evaluation, not a blanket declaration that an extension is malicious. The [official extension overview](https://solana.com/docs/tokens/extensions) and [non-transferable specification](https://solana.com/docs/tokens/extensions/non-transferrable-tokens) explain why hook programs, transfer fees, default states and permanent delegates require deeper policy checks.

Limitations are returned as explicit unknowns: pool liquidity and its ownership, beneficial wallet concentration, creator history, suspicious activity, extension configuration and sellability. A pool vault can be the largest account without representing one investor; a whale can split holdings. Different RPC reads need not share one slot. Mint/freeze revocation cannot prove safety or future liquidity. Sell simulation must use an actual supported route, wallet/token accounts, current reserves and exact transaction; it cannot be replaced by a mint-only check. Unknown evidence must remain ineligible for live trading under the safety policy.

## Jito investigation

[Jito's official transaction documentation](https://docs.jito.wtf/lowlatencytxnsend/) describes transaction forwarding and bundle APIs, separate tips and priority fees, and status lookup. Its sendTransaction route skips RPC preflight; callers need a separate simulation. Bundle submission acknowledges receipt and is not proof of inclusion; verify both bundle status and individual transaction outcome. This project does not submit to Jito or claim measured performance for that route. A future integration needs authenticated configuration if applicable, fresh tip-account discovery, budget enforcement, idempotent reconciliation and protection against signing arbitrary account transfers. Never infer first-block execution or global front-running protection from submission routing.

## Validation scope

Unit tests cover official binary compute-budget data, program validation, WebSocket mapping/deduplication/slot handling/shutdown, bounded disconnect recovery, transaction inventory and mint layout decoding. The saved public mainnet transaction supports deterministic historical replay without network dependence. Mock tests prove client behavior, not availability of an external service. No devnet execution test was performed and no devnet result is claimed to validate mainnet launches.

Validation performed: root `npm exec tsc -- --noEmit` passed; `npx tsx --test tests/chain.test.ts` passed all nine tests. The tsx CLI initially encountered a sandbox IPC socket restriction; the approved rerun outside the sandbox completed successfully.
