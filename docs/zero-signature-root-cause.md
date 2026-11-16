# Zero-signature root cause — Phase 13

**PASS at the local transport boundary: captured zero identities are already present in incoming provider notification data.** Their remote emission mechanism remains unknown. Phase 12 retained normalized observations, so its unavailable raw envelopes cannot be retrospectively verified.

| Stage | Result |
|---|---|
| Raw WebSocket bytes | Sanitized bounded base64 envelopes retain original SHA-256/length and an explicit byte-exact flag. Two probe samples and 69 primary-run samples are byte-exact zero proofs. |
| Provider notification | JSON-RPC `params.result.value.signature` contains 64 base58 `1` characters, encoding 64 zero bytes. |
| Subscription normalization | Acknowledged subscription IDs bind to the registered program; unbound mappings in the strict profile fail and open recovery gaps. |
| ProgramObservation | `signature: value.signature` copies the field; no empty/default/generated signature is inserted. |
| Signature extraction | Canonical base58 width and all-zero checks operate without replacing the input. |
| Stable identity | The existing key is verified program address plus original signature. Cross-program signatures remain distinct. |
| WAL admission | Invalid identities create a fsynced gap/refusal; no pending/completed ownership or anchor is created. The audit records the returned refusal after that boundary. |

[Probe analysis](phase13/identity-probe-analysis.json), [primary analysis](phase13/identity-mainnet-analysis.json) and their `wire-identity.jsonl` files preserve the joins. Redacted or truncated envelopes are excluded from byte-exact proof. The corpus is bounded; retention and dropped-record counts are explicit. No endpoint path, request credential or authorization header is captured. Local hashes provide tamper evidence, not external notarization.

The strict diagnostic profile rejects unsupported JSON-RPC versions and duplicate object keys, including escaped spellings, before normalization. Missing/non-string identities cannot become observations. Research admission also refuses invalid alphabet/width identities. Invalid strict-profile observations cannot advance the monitor's slot head. Existing generic journal fixture behavior remains compatible; this is an explicit research admission policy.

Tests cover byte-exact wire→observation→durable refusal/restart, missing/malformed/versioned payloads, ambiguous keys, same-program duplicates/conflicts, cross-program identity scope, unbound subscriptions, sanitizer limits and creation-wire capture. [Tests](../tests/phase13-wire-identity.test.ts). Changed payloads still do not prove chain forks or provider culpability. No signature is manufactured, substituted or refreshed.
