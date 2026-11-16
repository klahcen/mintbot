# Phase 9 RPC comparison

Configured service brands are Solana public RPC and Allnodes PublicNode. PublicNode publishes its service at [publicnode.com](https://www.publicnode.com/); this does not establish who operates the other endpoint or prove independent underlying infrastructure. Operating independence remains **unknown**, and the paper agreement gate remains fail closed.

The policy assessment status is **unknown** with eligibility **False**. [provider-validation.json](phase9/provider-validation.json) retains attributed observations, failures and reasons. [provider-method-evidence.json](phase9/provider-method-evidence.json) separately retains current per-method availability/results for one original finalized launch identity, preserving failures rather than collapsing them into a configured label.

| Provider | Method | Observation | Elapsed ms |
|---|---|---|---|
| solana-public | getGenesisHash | result recorded; 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d | 869.440 |
| solana-public | getSlot | result recorded; 467949133 | 136.405 |
| solana-public | getSignatureStatuses | result recorded; {'context': {'apiVersion': '4.4.0', 'slot': 467949134}, 'value': [{'confirmationStatus': 'finalized' | 172.362 |
| solana-public | getMultipleAccounts | finalized account bank 467949134 | 135.911 |
| publicnode | getGenesisHash | result recorded; 5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d | 606.829 |
| publicnode | getSlot | result recorded; 467949131 | 132.226 |
| publicnode | getSignatureStatuses | result recorded; {'context': {'apiVersion': '4.4.1', 'slot': 467949133}, 'value': [{'confirmationStatus': 'finalized' | 297.817 |
| publicnode | getMultipleAccounts | finalized account bank 467949132 | 116.802 |

Exact account-bank agreement: **unknown**; exact account bytes equal at that bank: **unknown**. Different finalized banks do not establish state agreement. Genesis identity, slot lag, signature finalization and missing account checks remain separate requirements. Failover can restore availability, not agreement or complete history. Existing provider tests cover chain mismatch, same-bank conflict/quarantine, lag, failure isolation and unknown operator identity. No new independently operated provider pair, exact quote-bank authorization or independent recovery completeness is claimed.
