# Phase 13 engineering report

**Full phase acceptance remains unmet.** The delivered pipeline identifies zero signatures at the incoming transport boundary and refuses invalid research identities. Current protocol, coverage/provider and genuine paper-lifecycle blockers remain explicit. Signing, broadcasting and spending remain disabled.

| Acceptance gate | Result | Evidence-backed assessment |
|---|---|---|
| Zero-identity origin | **PASS** | Byte-exact incoming envelopes and linked admission evidence; remote internal cause remains unknown. |
| Invalid-identity admission | **PASS** | Research rejects zero, malformed and wrong-width signatures; strict diagnostic profile rejects ambiguous/version/mapping payloads. |
| 1,800-second stable monitoring | **PASS** | One supervisor: 1800.000344 monotonic seconds; wall discrepancy 0.656 ms. |
| Continuous required coverage | **FAIL** | Current gaps {'unrecoverable': 3, 'recovered': 1}; quarantines 752; invalid identities 69. |
| Current Pump/PumpSwap variants | **PARTIAL** | Both observed variants remain blocked. Reviewed diagnostic semantics do not complete financial compatibility. |
| Raydium/Meteora creation detection | **PARTIAL** | Raydium: 1 actual selected creation verified after the run, excluded from entries. Meteora legacy detection is validated offline; current delivery/new initializer coverage remains incomplete. |
| Independent providers | **PARTIAL** | Unavailable: public endpoints are not an authenticated independently operated pair; different account banks remain unknown. |
| Genuine current paper entry/exit | **FAIL** | 0 entries / 0 exits. Historical unsigned public-inventory diagnostics are excluded. |
| Tests/build/security checks | **PASS** | 323/323 TypeScript tests, five Python clock tests; clean Node22 install/build/typecheck, container and PostgreSQL checks; audit capture retained. |
| Funded execution disabled | **PASS** | No signing, submission, funding or spending authorized or introduced. |

The exact [Phase 12 starting source](phase13/source-at-start-sha256.json), [source archive](phase13/source-at-start.tar.gz), [prior evidence manifest](phase13/prior-artifact-sha256.json) and [earlier root documents](phase13/prior-root-docs/docs/phase12-engineering-report.md) preserve the baseline. No original test, deployment pin, reviewed financial layout or dependency lock was changed. Current source and loaded compiled modules are checked by the [delivery verifier](../scripts/phase13-final-validation.py).

The first 120-second identity diagnostic captured 16,833 notifications and two exact zero-signature envelopes. Its raw bytes, parsed field, normalized signature, stable key and fsynced refusal are linked by SHA-256. The new primary run supplies 69 further byte-exact zero proofs. This establishes incoming remote-payload origin for these samples, not the remote server's internal reason or the missing historical Phase 12 envelopes. There was no signature fallback to remove. [Root-cause report](zero-signature-root-cause.md).

The existing shared supervisor, risk/market services, simulation gate, WAL and paper ledger remain in use. Changes add bounded sanitized wire diagnostics, strict JSON-RPC envelope handling in the explicit diagnostic profile, canonical 64-byte signature checks at research admission, and a bounded single-reader verification schedule. HTTP 429 retries honor cooldown and stop at evidence deadlines; finality, ownership, schema, provider, coverage and freshness requirements remain mandatory. Creation hints retain wire provenance between regular samples and remain hints until finalized verification.

The primary run measured 1800.000344 monotonic seconds, received 275,760 notifications, selected 30 receipts and verified 22 creations during monitoring. Fully ACKed time was 1778.861819 seconds, distinct from connected time 1789.034800 and disconnected time 10.965544. Final gaps: {'unrecoverable': 3, 'recovered': 1}; current quarantines: 752. Preflights, diagnostic and owner probes are excluded from that duration. [Monitoring](stable-monitoring-validation.md), [coverage/providers](independent-provider-and-coverage.md).

| Venue | Notifications | Creation hints | Selected | Invalid identities |
|---|---:|---:|---:|---:|
| pump | 268353 | 709 | 29 | 65 |
| pumpswap | 2235 | 0 | 0 | 0 |
| raydium-cpmm | 5172 | 1 | 1 | 4 |
| meteora-dlmm | 0 | 0 | 0 | 0 |

Current Pump and the observed reversed PumpSwap route remain disabled. A current selected Raydium creation is verified after the run; Meteora's retained legacy fixture remains valid offline but its current historical reread is unavailable. Public discovery API HTTP 403 and unsupported initializers are recorded rather than inferred away. [Protocols](current-protocol-compatibility.md), [creation validation](raydium-meteora-creation-validation.md).

All selected outcomes are accounted for, with **0 paper entries and 0 exits**. No historical public inventory is treated as a fresh position. [Execution evidence](end-to-end-paper-evidence.md). The delivered image also passes shared-owner refusal and authenticated sticky stop. Existing crash/restart and PostgreSQL recovery checks remain in the complete suite. [Performance/security](performance-and-security.md), [funded blockers](remaining-funded-trading-blockers.md), [commands and immutable artifacts](phase13/README.md).
