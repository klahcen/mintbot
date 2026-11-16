# Unsigned swap builders

The new subsystem is in `src/simulation`. It does not import the signed `RpcExecutor`, wallet vaults, signing methods or submission routes. Its packet format is unsigned v0 with one public payer, zero signatures, no lookup tables and a 1,232-byte cap. Unknown variants fail closed. Source runs through `tsx`; no application or container rebuild was performed.

## Pinned contracts

| Venue | Supported instruction | Source/reference | Bounds |
|---|---|---|---|
| Pump native bonding curve | `buy_exact_sol_in`, `sell` | Pump public IDL commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`; `@pump-fun/pump-sdk@4.3.1` | Native SOL, existing creator/user/global volume state, supported metadata-only token extensions; no Mayhem/cashback/holder rewards/completion/custom modes |
| PumpSwap | `buy_exact_quote_in`, `sell` | Same public-docs pin; `@pump-fun/pump-swap-sdk@2.2.0` | Native SOL quote, known pool/global/fee layouts, nonzero creator, pre-existing volume and fee custody; unsupported modes remain disabled |
| Raydium CPMM | `swap_base_input` | Source commit `3d69122790e97cd6aff24e8ba95940793773f58c`; SDK `0.2.84-alpha` | Reviewed 637-byte pool / 236-byte config, canonical vault/config/observation relationships and fee directions |
| Meteora DLMM | `swap2` | Source commit `af36dd53ab180783ccecda306926189a4700953c`; SDK `1.9.14` | Existing bounded account/fee model, three verified adjacent bin arrays, internal bitmap range, no limit-order inventory, unsupported activation/token-hook cases disabled |

The corresponding primary sources are [Pump public docs](https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22), [Raydium exact-in swap](https://github.com/raydium-io/raydium-cp-swap/blob/3d69122790e97cd6aff24e8ba95940793773f58c/programs/cp-swap/src/instructions/swap_base_input.rs) and [Meteora SDK](https://github.com/MeteoraAg/dlmm-sdk/tree/af36dd53ab180783ccecda306926189a4700953c). Deployment-loader slots are checked against the existing pins; ELF hashes, reproducible builds and source-to-binary equivalence remain unverified.

## Construction evidence

The builder checks the quote's clocks, digest, provider, amounts and slot. It checks the supplied bank against every original account digest, reparses the adapter from that bank, recalculates the integer quote and rejects changed reserves/decimals. Mint/token programs and unsupported extensions retain the original checks. PDAs and custody are derived from parsed state, not caller account lists. Fresh deployment evidence is required for each protocol and, where applicable, the fee program.

Auxiliary public accounts are discovered first. Final market, user and fee custody come from one finalized `getMultipleAccounts` response of at most 32 accounts. Missing requested keys reject. Holder membership is enumerated once; the final bank reparses all balances and reconciles total supply. New/missing positive holders cannot silently become verified concentration. Failed/over-bound enumeration remains unknown. This ordering avoids repeating an expensive holder query after the final quote bank has already begun aging.

Pump and PumpSwap instructions include the reviewed remaining curve/pool-v2 and buyback accounts, not just the short core IDL list. Recipients are selected from on-chain global lists. Native system recipients are supported; Pump's reviewed 208-byte Fee Program `BuybackVault` variant requires its exact discriminator, nonzero authority, zero reserved tail and reviewed owner. Unknown recipient layouts reject. SPL fee ATAs must match their expected mint/authority and supported token program. Creator/global/user PDAs and required existing volume-account owners are checked. Optional program-created volume-account initialization is deliberately unsupported.

## Account management and limits

Buy input and minimum output are positive u64 values. The independent authorization includes a minimum output and maximum input, public payer/destination owner, strategy revision, rent/network/priority caps, CU limit, CU price and expiry. Native and wrapped SOL remain integer lamports/token atoms.

An absent base ATA is created idempotently for buys. Sells require an existing owned, initialized, unrestricted base account with enough tokens. An existing owned wrapped-SOL ATA can be used without closing its pre-existing custody. If absent, the transaction creates it, transfers exact native input for a buy, syncs native balance and closes that newly created account to the same payer after the swap. No pre-existing wrapped-SOL account is closed. RPC rent quotes cover the supported legacy/metadata-only ATA sizes. Unknown sizes/extensions reject.

`validateUnsigned` decompiles the actual message. It checks payer, signatures, all effective writable/signer privileges, exact account ordering, allowed programs, discriminator/data length/flags, exact spending/minOut, account-management bytes, compute instructions, rent/fee limits and blockhash. A plan is a frozen process-local capability; JSON/deserialized intent data cannot be promoted into a fresh executable plan. The message digest must match after inspection. Lookup tables, multiple payers/signers and extra instructions are unsupported.

## Independent comparisons

`builder-reference.json` records **eight exact matches**: buy and sell for all four venues, including instruction data and ordered account metas. Reference packages run outside the workspace, with version, npm integrity and entry-file SHA-256 retained. The reference fixtures use actual recorded market bytes plus explicitly UNIT user/auxiliary execution accounts; they prove serialization agreement, not those accounts' real-chain availability. Actual successful buy simulations are documented separately. No actual sell simulation or funded execution is inferred from a serialization match.
