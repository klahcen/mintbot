# Verified protocol coverage and provenance

Coverage is **creation metadata for the exact pinned variants below**, not complete platform coverage, executable pricing, swap support or trading permission. Ordinary program-log observations do not qualify. `DecoderRegistry.decodeTransaction` validates successful finalized transaction input, attributed instruction/event data and a compatible later finalized account snapshot. The runtime native reader requests parsed legacy/v0/v1; unknown transaction versions fail closed.

| Program | Verified creation instruction | Instruction discriminator (hex) | Event requirement | Real fixture transaction version | Schema metadata version |
| --- | --- | --- | --- | --- | --- |
| pump | `create_v2` | `d6904cec5f8b31b4` | CreateEvent | 1 | 0.1.0 |
| pumpswap | `create_pool` | `e992d18ecf6840bc` | CreatePoolEvent | 1 | 0.1.0 |
| raydium-cpmm | `initialize` | `afaf6d1f0d989bed` | No creation event in pinned initializer; exact instruction + PoolState required | 0 | Rust source commit (no asserted semantic program version) |
| meteora-dlmm | `initialize_lb_pair` | `2d9aedd2dd0fa65c` | LbPairCreate | legacy | 0.12.0 |

All other initialization variants remain disabled until separately verified with fixtures; the vendored IDLs contain additional instructions and are not a support promise. Existing Pump log-only metadata decoding remains available under its previous strict layout, separately from full transaction/account verification.

## Addresses, schemas and captures

### pump

- Program address: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`.
- [Pinned official schema/source](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/idl/pump.json); commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`.
- [Finalized transaction](fixtures/pump-creation.json): [`3TB3UkCpwxETmbgG5e36sWqURmgPYa1DGkbG5wGKywPVwJwZbMSKsdLZ1Fs9sGbwqA2AbvZMK2kfmKX3hUGcpEM5`](https://explorer.solana.com/tx/3TB3UkCpwxETmbgG5e36sWqURmgPYa1DGkbG5wGKywPVwJwZbMSKsdLZ1Fs9sGbwqA2AbvZMK2kfmKX3hUGcpEM5); slot 465020951.
- [Account evidence](fixtures/pump-accounts.json): finalized context slot 465024467; captured after the transaction, **not a historical account-state snapshot at creation**.

### pumpswap

- Program address: `pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA`.
- [Pinned official schema/source](https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/idl/pump_amm.json); commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`.
- [Finalized transaction](fixtures/pumpswap-creation.json): [`HFpY9yKmATDEtLUMsJwHm7MgdbPCNecxuBa8p5VHkC4AjuJfdK7Ra9qWhJ7XwaEsTe1VW2RunirTLKmJ5A8tQKw`](https://explorer.solana.com/tx/HFpY9yKmATDEtLUMsJwHm7MgdbPCNecxuBa8p5VHkC4AjuJfdK7Ra9qWhJ7XwaEsTe1VW2RunirTLKmJ5A8tQKw); slot 465023570.
- [Account evidence](fixtures/pumpswap-accounts.json): finalized context slot 465024498; captured after the transaction, **not a historical account-state snapshot at creation**.

### raydium-cpmm

- Program address: `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`.
- [Pinned official schema/source](https://github.com/raydium-io/raydium-cp-swap/blob/3d69122790e97cd6aff24e8ba95940793773f58c/programs/cp-swap/src/instructions/initialize.rs); commit `3d69122790e97cd6aff24e8ba95940793773f58c`.
- [Finalized transaction](fixtures/raydium-cpmm-creation.json): [`5HL3QqKSpHGGRgxkos1oyESwRaHA1gBDToFt9jv61v4QvMQPRFUCiHD87TwDXa9C9vBGmzvaWk2at4ogiX5m5EwW`](https://explorer.solana.com/tx/5HL3QqKSpHGGRgxkos1oyESwRaHA1gBDToFt9jv61v4QvMQPRFUCiHD87TwDXa9C9vBGmzvaWk2at4ogiX5m5EwW); slot 465015705.
- [Account evidence](fixtures/raydium-cpmm-accounts.json): finalized context slot 465024527; captured after the transaction, **not a historical account-state snapshot at creation**.

### meteora-dlmm

- Program address: `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`.
- [Pinned official schema/source](https://github.com/MeteoraAg/dlmm-sdk/blob/af36dd53ab180783ccecda306926189a4700953c/idls/dlmm.json); commit `af36dd53ab180783ccecda306926189a4700953c`.
- [Finalized transaction](fixtures/meteora-dlmm-creation.json): [`346CZss3L5WHUMpCykGfKjCCR8TXZGgYuLm11aWESuBVk9S1uiuFjjiWyxSidwaMxVMkbAvNkhkDLAqEzjijK6dW`](https://explorer.solana.com/tx/346CZss3L5WHUMpCykGfKjCCR8TXZGgYuLm11aWESuBVk9S1uiuFjjiWyxSidwaMxVMkbAvNkhkDLAqEzjijK6dW); slot 413583407.
- [Account evidence](fixtures/meteora-dlmm-accounts.json): finalized context slot 465025347; captured after the transaction, **not a historical account-state snapshot at creation**.

## Verification boundaries

- Complete invocation stacks and instruction order are checked; foreign program data, failed transactions, failed nested calls and truncated logs cannot establish a launch. Anchor self-CPI events are attributed to their invoking creation frame. Top-level required signers must sign; CPI signer authorization is enforced by successful runtime execution, so PDAs are not falsely required to be transaction signers. Writable privileges and fixed account addresses are checked.
- Pump and PumpSwap validate exact Borsh argument/event layouts, key relationships and pinned PDA constraints. Pump requires a compatible owned BondingCurve account. PumpSwap requires an owned Pool account with matching immutable account relationships.
- Raydium validates the pinned 24-byte initialize argument payload, sorted mints, pool PDA or signed pool address, authority/vault/LP/oracle PDAs and exact 637-byte PoolState layout with matching key relationships. Its initializer does not emit a creation event, so an event is not invented.
- Meteora validates InitializeLbPair arguments, LbPairCreate event, reserve/oracle PDA constraints and compatible owned LbPair data with matching mints, reserves, oracle and bin step. Optional account sentinels are handled explicitly. Other DLMM initializer variants remain unsupported.
- Full nonzero trailing instruction/event data fails closed. Account allocations may contain zero padding after the pinned fields; nonzero incompatible trailing data is rejected. This compatible-allocation policy does not claim recognition of future program versions.
- The account evidence proves owner/layout/key compatibility when retrieved. It does not recreate initial reserves or prove historical liquidity. Mutable state values are not substituted for the initial event, and no safety, price or sellability assertion is manufactured.

## Deployment/version limits

[Program deployment metadata](fixtures/program-deployments.json) records executable flags, upgradeable-loader ownership, program-data addresses and deployment slots using finalized, bounded data slices. All four programs remain upgradeable. A deployment slot is not a semantic version or ELF hash. The pinned IDL metadata version is also not proof of a deployed binary version. The older Meteora fixture predates the currently observed deployment; its layout is compatible, but its historical binary was not independently archived.

[Solana versioned transaction documentation](https://solana.com/docs/core/transactions/versioned-transactions) and [RPC parsed JSON structures](https://solana.com/docs/rpc/json-structures) describe legacy/v0/v1 responses. The new reader requests `maxSupportedTransactionVersion:1`; no v1 signing or funded construction capability was added to the old SDK primitives.

## Evidence integrity

[Fixture/schema hashes](fixture-schema-sha256.json) identify the files used. Tests cover each real positive fixture and failed status, unknown transaction version, corrupt owner/data, malformed creation payload and incomplete invocation history. A four-fixture corpus is limited evidence; it does not justify claiming every current or historical launch layout is supported.
