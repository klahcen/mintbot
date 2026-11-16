# Raydium/Meteora creation coverage — Phase 12

**Raydium creation identity demonstrated after the run; Meteora creation coverage acceptance remains unmet.** Neither venue has exhaustive creation coverage.

Phase 11 observed 256 Raydium and 13,727 Meteora notifications with zero creation hints. The retained raw subset contains 54 Raydium and 1,570 Meteora records, mostly swaps, routes and liquidity/position operations. Rotation deleted older raw records and all four coverage gaps remain unrecoverable. Zero sampled creations cannot establish zero genuine creations.

The [bounded venue audit](phase12/creation-coverage-final/evidence.json) sampled twelve unique successful receipts per venue. Ten Raydium rereads completed without identifying a creation; two Raydium and all twelve Meteora rereads hit HTTP 429. This is a biased bounded sample with insufficient evidence to estimate creation frequency. Missing receipts, provider availability and unsupported initializers all remain possible explanations.

Existing strict creation support is Raydium `initialize` and Meteora `initialize_lb_pair`. Official source includes Raydium permissioned initialization and the DLMM IDL includes `initialize_lb_pair2`, customizable permissionless variants and permissioned initialization. Bin-array and position initialization are not new pool creations. Additional variants remain disabled without finalized fixtures and strict invocation/account verification; no ordinary swap is promoted.

The final 120-second run received 4,191 Raydium notifications and selected one creation hint, whose initial finalized lookup hit HTTP 429. A [bounded post-run verification](phase12/postrun-creation-verification.json) proved `initialize` at slot 469514659, signature `5JLEAMg7ncqc757LmSKLofhf1KaQTYJaGrevUh1SmHP7UwHp8C8e5LnHFbeQJbBnVK8KeYTef1a43YhdTudrNNKk`, pool `EKamk8mVniFEwFnTRV6D5JfhAXzNpRRd6uDqNw2mt6eg`. The [captured fixture](phase12/raydium-current-creation-fixture.json) preserves the transaction. Its history origin and `executionEligible:false` prevent retroactive entry. Meteora received 7,951 notifications and zero creation hints in that same run, including 55 unverifiable zero identities. Its creation acceptance remains unmet.

Reproduce the read-only bounded audit with a new output directory:

```sh
node --import tsx scripts/phase12-creation-coverage.ts --run --output /tmp/mintbot-creation-coverage-new
```

Commands used for retained captures are indexed in [the evidence guide](phase12/README.md).
