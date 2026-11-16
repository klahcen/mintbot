# PumpSwap variant validation — Phase 12

**Observed SOL-base/non-native-quote variant remains disabled.** Its signed reserve semantics are now documented, but complete variant validation is unmet.

The original 287-byte Pool records virtual quote reserves `-8859839`, protocol fees `8859839` and creator fees `0`. The signed offset exactly negates retained fees. [Contract review](phase12/pumpswap-contract-review.json) and [finalized diagnostic](phase12/pumpswap-contract.json) preserve the original/current field correspondence and relationships. The original quote-vault balance at the identical historical bank is unavailable, so effective historical liquidity is not reconstructed.

The pinned official [negative-reserve specification](https://raw.githubusercontent.com/pump-fun/pump-public-docs/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/NEGATIVE_VIRTUAL_QUOTE_RESERVES.md) defines a signed i128 offset. Pricing uses integer `quoteVaultAtoms + virtualQuoteAtoms`; retained creator/protocol fees lower the offset while they remain in custody. The [fee-adjustment document](phase12/official/pump-fun-pump-public-docs-docs-VIRTUAL_QUOTE_RESERVES_FEE_ADJUSTMENT.md) explains the inverse changes on fee retention and sweeping. Raw vault balance includes liabilities and cannot alone represent liquidity. No clamping, unsigned reinterpretation or inferred extra reserve is used.

The current reread found zero offset and zero retained fees. That does not identify the intervening transaction. The SDK comparison on the observed subject has zero supply, so its market-cap equality is degenerate and is explicitly excluded from successful quote validation.

Missing approval evidence includes nondegenerate integer quotes for both directions with reversed SOL orientation, independent variant-specific wires, complete current token/fee custody relationships and actual unsigned simulations with reconciled effects. Matching the existing PumpSwap deployment pin does not establish compatibility for every account layout and route.

The separate [buy](phase12/current-buy-simulations.json) and [sell](phase12/current-sell-simulations.json) diagnostics succeed on an already supported SOL-quote pool. Its sell consumed 44,603,481,251 token atoms, returned 944,267 lamports before a 6,000-lamport fee, and reconciled exactly. This different subject cannot approve the SOL-base variant, create inventory or count as a fresh paper position.
