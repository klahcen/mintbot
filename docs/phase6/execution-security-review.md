# Phase 6 execution security review

Reviewed implementation: `src/simulation`, the diagnostic tools, SQL migration and tests. This is an internal source review, not an independent audit or funded-release approval.

| Boundary | Implemented control | Remaining limit |
|---|---|---|
| Signing/submission | No signer imports, zero signatures, read-only RPC method allowlist, no signed/submitted SQL states | Existing disconnected legacy execution primitives remain; Phase 6 does not authorize using them |
| Wire policy | Decode actual v0 bytes; exact instruction bytes/metas/programs, payer, destination, spend, minOut, fees, rent, blockhash and digest | No ALTs, multiple payers, arbitrary remaining accounts or unsupported variants |
| Evidence | Fresh finalized single bank, account digests, adapter reparse, integer requote, deployment pins and account owners | One mainnet provider; no cryptographic account proofs or reproducible deployed-binary equivalence |
| Account custody | Canonical ATAs/PDAs; restrict token extensions/delegates/freeze; no closure of pre-existing WSOL | New volume-account initialization, transfer hooks and unknown account layouts reject |
| Paper approval | Successful simulation, authoritative balance/fee effects, mandatory risk, conservative quote minOut, current safety/strategy checks | No mainnet qualifying paper entry was observed; bridge integration uses UNIT evidence |
| Financial intent | Separate SQL transactions; unique tuple, wallet+strategy capacity, owner lease/fence, immutable identity, atomic audit | Budgets are research reservations; actual funded account settlement is absent |
| Crash uncertainty | Retained holds, higher fence, explicit manual review/cancel; no blind retry after ambiguous commit | Future submitted intents cannot reuse this cancellation rule without signature reconciliation |
| Resource bounds | Packet/response/payload limits, RPC/SQL timeouts, 16 pending / two workers, explicit refusal counters | No sustained public-feed SLO or distributed emergency-stop proof |

Tests mutate spend, minimum output, payer, programs, priority fees, signatures and extra instructions. They also exercise stale evidence/blockhash, account/decimal/reserve changes, missing ownership, capacity races, stale fencing, worker death and database immediate restart. Raw results are retained; passing tests do not eliminate the remaining trust boundaries.

RPC error output omits endpoint credentials. Fixture files contain public chain data and public payer addresses only. A successful `sigVerify:false` result is not proof of payer authorization. The diagnostic CLI creates no funded transfer and does not hold a private key. Live mode remains rejected; no new server route exposes construction or approval.

Operational deployment still needs least-privileged database roles, authenticated review authorization, secure transport, durable storage/backup restore tests, bounded audit retention, independent review, dependency remediation and cross-instance emergency control. Database owners can bypass application controls. Existing dependency advisories have not been resolved by introducing a new runtime SDK; reference SDKs are isolated outside the repository.
