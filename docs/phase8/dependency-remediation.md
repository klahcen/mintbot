# Phase 8 dependency remediation

Recorded 2026-11-10 against the actual workspace lockfile. Audit is a dependency-path signal, not a count of demonstrated application exploits.

| Audit | High | Moderate | Total |
|---|---:|---:|---:|
| Before | 3 | 3 | 6 |
| After | 3 | 0 | 3 |

Raw results: [before](dependency-audit-before.json), [after](dependency-audit-after.json), [install transcript](dependency-install.log), [resolved tree](dependency-tree-after.log), [complete changed lock entries and hashes](dependency-change-manifest.json). No advisory is ignored, muted or reclassified. `npm audit` still fails the security gate because three high findings remain.

## Accepted change and compatibility boundary

The root override pins `jayson` to **5.0.0**, replacing the previous nested uuid override. Installed web3.js **1.99.0**, SPL-token **0.4.15**, all other direct dependencies, market parsers, quotes and unsigned builders retain their existing versions and source. The lock changes only Jayson and removal of its now-unused eyes, stream-json, stream-chain, uuid and optional nested utf-8-validate packages; no application module was patched. The previous uuid override is unnecessary because Jayson 5 removes that dependency. Registry tarball integrity is in the lock and [independent package metadata](jayson-package-reference.json).

This is a deliberate major-version override outside web3's declared `^4.1.1` range, with compatibility assessed for the **actual imported submodule**. It is not a claim that every Jayson 4 consumer can migrate without changes. Web3 imports `jayson/lib/client/browser`, passes request text through fetch, and consumes its ordinary JSON response callback. Inspection of the old/new published files found the same callback, request, batch, replacer/reviver and JSON.parse contract; the substantive browser change replaces uuid with the internal crypto-backed ID generator. Web3 passes no custom generator, so this path needs `globalThis.crypto.randomUUID` or `getRandomValues`, provided by this repository's Node >=20.19 runtime. The actual Node 20.19.5 test invokes that generator through `Connection` rather than stubbing it.

Jayson 5 also changes TCP/TLS framing to delimiter-separated JSON and removes the stream-json dependency. Mintbot does not import those transports or run a Jayson server; those APIs are outside the accepted compatibility boundary. The upstream [v5 release](https://github.com/tedeh/jayson/releases/tag/v5.0.0), [browser client source](https://github.com/tedeh/jayson/blob/v5.0.0/lib/client/browser/index.js), and [documented TCP delimiter contract](https://github.com/tedeh/jayson/blob/v5.0.0/README.md#clienttcp) support this review. Future use of a Jayson TCP/TLS/server API requires a separate compatibility review.

The eliminated moderate chain was `web3 → jayson4.3 → stream-json1.9.1`. The three stream-json advisories cover [quadratic nested path filters](https://github.com/advisories/GHSA-528h-pc64-c93x), [quadratic JSONC comments](https://github.com/advisories/GHSA-hqr4-qq8f-hg3x) and [Assembler prototype injection](https://github.com/advisories/GHSA-mjw6-4jj6-33hc). Mintbot's web3 browser client uses native JSON.parse, not those affected streaming parser paths; removing the vulnerable package still reduces the installed attack surface. Merely overriding stream-json to 3.6 would break the old CommonJS subpath API. Pinning old Jayson 4.1.3 or downgrading web3 to disguise the transitive finding was rejected in favor of testing the narrow, current browser path.

## Behavior evidence

[Focused transcript](dependency-behavior-tests.log): **56 passed, zero failed/skipped**, including two new dependency compatibility tests and the existing market, restriction, quote, eight unsigned builder and four captured mainnet accounting cases.

- A real local HTTP server serves the actual web3 `Connection`: finalized getBalance parameters and unique JSON-RPC IDs, getMultipleAccountsInfo base64 bytes/lamports, provider errors and malformed JSON rejection all pass. No external network is used by this test.
- The imported Jayson browser client preserves batch replies. An adversarial `__proto__` JSON key remains an own data property without replacing the parsed object's prototype or polluting Object.prototype.
- Existing recorded market tests preserve token decimals and integer amount conversion, mint authority handling, Token-2022 nontransferable rejection, frozen custody rejection, reserve/quote validation and all venue builder bytes under the retained SDKs.
- Recorded simulation regression tests deserialize actual unsigned mainnet messages, confirm all signatures remain zero, recompute message digests and reconcile token/native effects. This is replay compatibility evidence, not a fresh mainnet execution claim.

Root Phase 8 validation separately records the complete suite, typecheck and production build after integration. This dependency task did not rebuild a running application or touch live-mode controls.

## Remaining high finding and release impact

The remaining three reported paths represent **one underlying unpatched advisory**: `SPL-token → @solana/buffer-layout-utils → bigint-buffer1.1.5`, [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg). Upstream reports a native toBigIntLE buffer overflow and has no patched version. SPL-token 0.4.15 remains the latest installed/current published legacy SDK. npm's proposed SPL-token **0.1.8 downgrade** would remove modern mint/TLV/account parsing and Token-2022 contracts; it is incompatible and was not applied. Replacing web3 with the current unrelated v3 API is likewise outside this focused correction.

The local bigint native addon exists. This work does not assume that the optional pure-JS fallback is active or that fixed-width callers eliminate the native advisory. Current buffer-layout-utils conversions operate on fixed-width decoded blobs, and application market accounts are size/owner/discriminator checked before those parsers. That limits the reviewed exposure; it is not a remediation or proof that every SDK path is safe. No exploit buffer is executed as part of validation.

A safe follow-up requires an independently reviewed pure-JS conversion replacement or compatible upstream removal, exact endianness/width/overflow/zero-length semantics tests, Token-2022/parser/serialization regression coverage, reproducible packaging and a maintained patch policy. An unreviewed local package with a renamed version would hide an advisory without establishing safety, so none was introduced here. **The remaining high advisory continues to block funded production release.**

The install transcript also records an existing `cookie@2.0.1` Node >=22 engine warning under local Node 20.19.5. That package and its lock entry predate this change and remain unchanged. It is not one of the six security advisories and is not silently resolved here; runtime upgrades must be validated in the deployment build/smoke workflow. Audit counts alone do not constitute production readiness.

Final 2026-11-11 audit: [raw current audit](dependency-audit-final-2026-11-11.json) retains three high / zero moderate findings. [Final validation environment](final-validation-environment.json) records the runtime used for final tests/build and short checks; earlier focused transcripts retain their own environment. No dependency installation or version change was made during finalization.
