# Phase 8 multi-provider validation

`src/research/providers.ts` provides a separate read-only research consistency layer. `ProviderConsistency.inspect()` accepts two or three configured providers, optional creation signature/account keys, minimum finalized slot, and bounded slot lag. It returns `verified`, `unknown`, or `failed`; `eligible` describes this comparison alone, and **`liveAuthorized` is always false**. This result is not a substitute for launch verification, deployment pins, mint/risk checks, simulation, custody or a strategy decision.

Each inspection issues at most four allowlisted reads per provider, in parallel: genesis hash, finalized slot, optional transaction status, optional finalized accounts. Native transport has a five-second timeout and four-MiB response bound. There is no automatic retry. `readAvailable()` separately tries at most two providers by default, skips quarantined providers, and returns `agreement: unknown`, `eligible: false` even when a fallback succeeds. Availability does not establish corroboration.

Distinct hostnames never prove independent operation. Operator name and HTTPS attribution must be supplied explicitly and differ. Configuration attribution itself is trusted research configuration, not a cryptographic infrastructure attestation. Endpoints sharing one origin cannot count twice. Public evidence exports host and configured identity without endpoint credentials.

Finalized slots must satisfy the requested event floor; lag exceeding the configured bound leaves comparison unknown. Finalized regression and wrong genesis quarantine the observed provider. Account data is compared only at **identical finalized bank slots**; differing bank slots remain unknown even if byte digests agree. A matching digest at different slots is not proof of identical-bank agreement. Missing accounts and missing/nonfinalized transaction statuses remain unknown. Conflicting finalized transaction slot/error or conflicting account state at the same bank fails closed and quarantines both sources. A finalized transaction error fails closed without blaming honest providers for agreeing about a failed transaction.

The checker records unobserved slot intervals between polls as gaps, explicitly distinguished from proven lost events. Quarantine release requires reviewer identity and reason, records the review, and forces the next observation through the same checks. Session resolution records are bounded at 1,000. The checker is process-local: consumers must export quarantine/review/gap evidence to their durable research journal. Durable multi-instance quarantine coordination and independent infrastructure procurement remain deployment work.

## Current mainnet sample

[Raw observations](provider-validation.json), [command output](provider-validation.log), command:

```sh
npx tsx scripts/phase8-provider-validation.ts --run
```

On 2026-11-10 at 16:53:32 UTC, the public Solana endpoint returned finalized slot **467794838**; PublicNode returned **467794836**. Both returned the exact mainnet genesis hash. The System Program account digests agreed, but account-bank slots were **467794838** and **467794837**. The result is **unknown, eligible false**. This is a two-service public endpoint observation, not verified independent infrastructure agreement. It samples a static system account, not a moving pool, and does not validate transaction-status agreement on a real launch. Those cases are covered by deterministic tests, not by this sample.

The public cluster service is documented by [Solana](https://solana.com/docs/references/clusters); PublicNode's Solana endpoint is documented by [Allnodes](https://help.allnodes.com/en/articles/17001591-solana-gun-rpc). These service attributions do not establish underlying physical failure-domain independence. The diagnostic intentionally withholds an independently reviewed operator attribution for the public Solana endpoint.

`provider-validation-initial.json/log` retain an invalid initial harness run: an accidentally truncated expected genesis constant caused false wrong-chain flags. The constant was corrected to the full hash returned by both sources before the current capture. Those initial flags are **not provider-fault evidence**.

## Verification

Nine deterministic provider tests cover positive same-bank agreement, unknown operator identity, bank mismatch, same-bank conflict, manual review, finalized status conflict, unavailable status, bounded failover, unavailable provider, identical transaction failures, missing accounts, chain mismatch, finalized regression, poll gaps, immutable configuration and bounded resolution records. [Provider test transcript](provider-tests.log). Actual production disagreement, service failover and persistent multi-instance quarantine are unmeasured. No provider comparison grants spending authority.
