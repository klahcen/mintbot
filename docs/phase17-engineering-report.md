# Phase 17 — Real-market paper trading validation

## 1. Executive summary

**Real-market automatic trading remains externally blocked. Genuine current-chain paper entries/exits observed in this phase: 0 / 0. No P&L or profitable performance is claimed.**

Phase 17 obtained actual current finalized HTTP/account/deployment evidence, bounded WebSocket delivery observations and real signed legacy/v0/v1 transaction payloads. This advances the evidence beyond Phase 16's local-only validation. It does **not** establish independently operated authenticated providers, complete event coverage, an approved coverage epoch or an eligible memecoin.

Four local defects were corrected: provider agreement did not bind the second market snapshot prepared for an entry; expired deployment evidence was not rejected on entry; nonfinite quote clocks could evade comparisons; and dashboard readiness/marks could look current with missing approvals or between polls. Execution controls were tightened, not relaxed.

| Evidence class | Result |
|---|---|
| Implemented | Prepared-bank agreement, deployment/clock checks, dashboard freshness/readiness, bounded read-only diagnostic tools and signed-wire inspection |
| Locally tested | Existing and new automated controls; final release results below |
| Observed real chain data | Two mainnet HTTP services, primary four-venue delivery, current deployment headers, retained-pool quotes and real signed payloads |
| Independently verified authority | **Unmet**: no independently reviewed operator/upstream attribution or coverage approval supplied. Local cryptographic verification is not operator authorization. |
| Externally blocked | Secondary WebSocket, provider attribution/entitlement/quota evidence, equal-bank agreement, coverage/epoch review, current supported deployments/eligible subjects and complete v1 semantics |

Target strategy remains **0.10 SOL, +90% TP, −5% SL, maximum five positions**. `MODE=paper`, the legacy execution fence, unsigned simulation requirements, risk limits, finalized commitment and historical-origin restrictions remain intact. No private key was requested or accessed. No signing, funded broadcasting, submission or paper-ledger mutation occurred in the diagnostic tools.

## 2. Files modified

[Source file manifest](phase17/files-modified.json):

| File | Change |
|---|---|
| `src/simulation/paper-gate.ts` | Recheck configured provider/coverage agreement on the actual prepared fill bank before calling the original atomic paper review |
| `src/market/risk.ts` | Reject stale/future/nonfinite deployment timestamps when present; reject nonfinite executable quote clocks and invalid state slots |
| `src/market/paper.ts` | Reject nonfinite exit deployment timestamps |
| `frontend/src/research.tsx` | Require explicit coverage/provider/epoch evidence for ready labels, separate eligible positions, expire marks on a browser clock |
| `src/research/validation-probe.ts` | Bounded allowlisted HTTP reads, bounded finalized WebSocket subscription controls and non-authorizing account-bank comparison |
| `src/research/signed-wire-inspection.ts` | Verification-only signed-payload inspection; always returns `executionEligible:false` |
| `scripts/phase17-market-validation.ts` | Explicit opt-in current provider/deployment/retained-subject inspection; no engine or ledger integration |
| `scripts/phase17-history-controls.ts` | Selected original gap-anchor and retained-v0 reads; never resolves coverage |
| `tests/phase17-validation.test.ts` | Fourteen additional regression tests |

This report and new artifacts live under `docs/phase17*`. `docs/phase17/deployment-header-probe.mjs` reproduces the small finalized loader-header read. Existing reports, fixtures, protocol/deployment pins, strategy configuration, dependency manifests, tests and stored trading records were preserved; final hash verification is below.

## 3. Implemented changes and limits

The entry gate previously compared providers on the initial market state, then prepared construction using another finalized bank and committed that second state. Agreement is now required again at the prepared-state commit boundary. The original paper review still rechecks quote age, risk, fees, strategy and its stop fence after that asynchronous work. A verified callback arriving after quote expiration cannot commit a fill.

Entry risk now rejects expired/future/nonfinite observed deployment timestamps, matching the exit boundary. The existing generic engine's timestamp-less unit-stub contract is preserved; production deployment readers provide timestamps. Quote validation rejects NaN/Infinity clocks, invalid slots and nonfinalized state. No freshness interval was widened.

The dashboard explicitly distinguishes synthetic replay, verified real-market paper monitoring, eligible paper positions, blocked/stale evidence, provider health and funded execution disabled. Missing required approval rows cannot establish readiness. A local browser timer expires displayed P&L after the existing 1,500 ms quote lifetime even while an HTTP request is pending. Entry cost remains distinct from executable exit marks. Dashboard labels grant no execution authority.

The new transports deny non-allowlisted methods before making a request, enforce request/response/time/count bounds, refuse redirects and retain numeric HTTP/RPC errors without remote error text. Diagnostic outputs identify providers as `primary`/`secondary`; endpoint credentials and private URLs are not retained. There is no endpoint synthesis or secondary WebSocket fallback.

Existing bounded trade/review history and WAL policies remain unchanged. A new continuous append-only trading audit archive was not introduced; operator retention requirements remain part of release readiness.

## 4. RPC provider validation

Authoritative final probe: [captured results](phase17/current-probe-final/provider-validation.json), [configuration presence](phase17/current-probe-final/configuration.json), [tested probe source hashes](phase17/final-probe-source-sha256.json). Final observation completed **2026-11-15 17:37:56 UTC**. These values describe that bounded observation, not ongoing provider health.

| Check | Primary | Secondary | Meaning/limit |
|---|---|---|---|
| HTTP connectivity | 13/13 allowlisted diagnostic reads succeeded | 13/13 succeeded | Accepted reads; no authentication/entitlement proof |
| Chain | Mainnet genesis matched | Mainnet genesis matched | Identifies reported chain, not operator independence |
| Finalized head read | Slot 469815931 | Slot 469815930 | Explicit finalized requests; no complete-slot/event proof |
| Program account bank | 469815933 | 469815932 | Payload hashes matched but banks differed: **agreement unknown** |
| WebSocket | Connected, four ACKs, one pong, 813 valid-format signature notifications over 12 seconds | **Missing configuration** | Delivery only; no end-to-end creation verification/completeness claim |
| Per-venue deliveries | Pump 397; PumpSwap 370; Raydium 6; Meteora 40 | No configured connection | Counts are notifications, not distinct launches or opportunities |
| HTTP 429 / transport errors | None in this probe | None in this probe | No quota, sustained-throughput or future reliability certification |
| Reported first available block slot | 0 | 469131016 | Provider claim; does not guarantee full transaction archive at every slot |
| Authenticated independent service review | **Unknown** | **Unknown** | `RESEARCH_PROVIDERS_PATH` absent; operator/upstream/entitlement evidence not supplied |

Each provider also performed 18 bounded market-account/holder calls and five deployment reads in the final probe. Holder reads retain the existing complete-enumeration bounds. No stress test, unbounded retry or long-duration trading monitor was run.

Historical controls are separately retained in [history-controls.json](phase17/history-controls.json). Both providers returned the original gap anchor at slot **469404771**, whose transaction failed with `InstructionError [0, Custom 12]`. Its availability does not repair the gap or make it a successful creation. Primary returned the original v0 control at **465015705**; secondary returned `null` for both encodings. This is a concrete historical-availability limitation for that selected subject, not proof about all slots or the cause of its absence.

## 5. Transaction-version compatibility

Real JSON and base64 signed transactions were fetched with `commitment:finalized` and `maxSupportedTransactionVersion:1`. The installed maintained SDK is already capable of reading v1; no dependency upgrade or whitelist change was necessary. Solana's [migration guidance](https://solana.com/upgrades/larger-transaction-sizes) distinguishes v1 message configuration and total priority-fee fields from older ComputeBudget handling; the [RPC contract](https://solana.com/docs/rpc/http/gettransaction) defines the requested encodings/version field.

The inspection helper verifies canonical/bounded raw encoding, SDK decoding, all Ed25519 signatures using Node's verification-only crypto API, requested signature identity, raw/JSON slot and version agreement, signer/account-header bounds, static account keys, blockhash, top-level instruction indices/accounts/data, balance-array completeness and v1 config correspondence/resource/fee sanity. JSON field order is not semantic identity. It never builds or signs a transaction.

| Format | Real evidence obtained | Result |
|---|---|---|
| Legacy | Secondary current-history selection | Signed payload, signatures and top-level reconstruction matched |
| v0 | Primary current selection and retained original v0 control | Matched; lookup-table provenance remains a separate requirement where applicable |
| v1 | Current-history sample in the earlier probe and a shared retained historical control from both providers | Matched signed payload and configuration; shared control's exact signed-byte SHA-256 matched across services |
| Unknown variants | Malformed/unknown cases exercised locally | Rejected; never approved |

The final shared v1 control is slot **469514659**, signed-wire SHA-256 **761e596a947edbab434ec85eb122953135934dc22fb50a53dabf85193b6a8e2c**. Observed configuration: 600,000 compute-unit limit, 8,388,608 loaded-account-data limit, 10,001 lamports total priority fee and null heap override. Two matching services still do not establish independently reviewed operators.

[Separate corrected inspection](phase17/signed-wire-inspection.json) retains the earlier sample's signed-payload results without overwriting its original diagnostic output. The initial helper incorrectly compared header JSON property order; semantic field comparison fixed that diagnostic defect. Regression tests include signature, account, instruction, config, metadata and version tampering.

**v1 creation execution remains blocked by `VerifiedReadRpc.verify`.** Complete inner-instruction invocation provenance, venue instruction semantics, account/lookup provenance and version-specific economics have not been independently validated end to end. The helper always returns `executionEligible:false`; it is not wired into an approval path. Legacy/v0 runtime behavior and the SDK inspector's existing max-v0 refusal contract remain unchanged.

## 6. Venue-by-venue eligibility

[Current raw loader headers](phase17/deployment-headers.json) retain both providers' finalized account bytes and comparisons with the reviewed pins. ProgramData pointers and loader structures matched; deployments differ where shown. Header matching is not ELF/semantic equivalence proof.

| Venue | Reviewed → observed deployment slot | Current retained-subject inspection | Execution eligibility |
|---|---|---|---|
| Pump.fun | 458921440 → **469811025**, both providers | Adapter rejects **Unsupported Pump global version** | **Blocked: unreviewed deployment and unsupported account variant** |
| PumpSwap | 458921517 → **469811067**, both providers | Supported inspected orientation quotes 0.10 SOL; real quote reserve ~2.067 SOL; holder concentration unknown | **Blocked: unreviewed deployment, liquidity below 20 SOL and incomplete holder evidence** |
| Raydium CPMM | 463522946 → 463522946 | Retained pool's mint and freeze authorities remain enabled; reserve ~0.511 SOL; buy/sell impacts 1,654/1,410 bps | **Blocked: mandatory authority checks, liquidity/impact and incomplete holder evidence** |
| Meteora DLMM | 423977638 → 423977638 | Retained pool quotes both directions; reserve ~77.509 SOL; impacts 101/101 bps; mint authority enabled and concentration unknown | **Blocked: mandatory authority and holder evidence** |
| External fee program | 456132171 → 456132171 | Reviewed loader header matched | Header match alone does not approve any trade |

The quoted subjects are explicitly retained historical identities/current account inspections. They are **not newly detected eligible memecoins**. PumpSwap/Raydium/Meteora account-state buy/sell estimates show adapter diagnostic reachability only; they are not successful serialized buy/sell transaction simulations. The production 500 bps impact bound, token authorities/extensions, orientations, holders, real liquidity, fees and deployment checks remain enforced. No blocked variant or new pin was approved.

## 7. Coverage policy and independent evidence

[Read-only coverage review](phase17/coverage-review.json) records hashes of six retained history snapshots and seven retained epoch records. Snapshots overlap and must not be summed as distinct incidents. The original Phase 11 history still contains:

- Unrecoverable Pump interval **469404738–469437712**.
- Three exhausted recovery attempts and 357 known refusals in that gap record.
- **79 quarantined** observations in its retained journal snapshot.

All seven inspected epoch records still report review **`unmet`**. No epoch was created, history deleted, quarantine retried/cleared or recovery budget reset. A 12-second notification probe and a successful anchor read cannot resolve a historical interval.

`epochCoverage` deliberately returns unknown without independent review, even for a clean local current window. There is presently no vetted signed-approval consumption path that an operator can enable by editing an `approved` string. A named independent policy authority, evidence-bound review procedure and separately reviewed implementation of that contract are required before any relaxation. No such approval mechanism was invented here.

## 8. Actual automatic paper workflow observed

**Entries: 0. Exits: 0. Opened positions: 0. Realized P&L: not observed/claimed.**

The diagnostic scripts do not import `MarketService`, open a paper store or invoke entry/exit methods. Current signatures were selected from bounded finalized history, not relabeled as live launch receipts. The identified provider, epoch, deployment and token-risk blockers prevent proceeding to the complete workflow. Consequently, no long-duration entry/exit demonstration or unsigned venue simulation was forced.

Automatic TP/SL, duplicate-event/restart preservation, stale quotes, fee accounting and the five-position cap continue to be tested locally. Such tests do not count toward current-chain entries/exits.

## 9. Automated release validation

Final [release results](phase17/validation-summary.json): **357/357 TypeScript tests passed** (all 343 prior tests plus 14 new regressions), **5/5 Python clock tests**, backend/frontend typechecks and production build passed, and **zero dependency-audit advisories**. [Commands/exit codes](phase17/final-validation/clean-validation.json), [full test log](phase17/final-validation/clean-tests.log), [tested source hashes](phase17/tested-source-sha256.json).

All existing tests remain unchanged, and tested source matches the workspace. [Preservation verification](phase17/preservation-check.json) confirms **4,080 existing protected data/docs/tests/config/environment/dependency files unchanged**. The isolated validator copies the two database-summary output paths so existing tests cannot overwrite retained root reports. [Credential scan](phase17/credential-redaction-check.json) found no exact configured sensitive values in the new artifacts; endpoint/error handling additionally avoids publishing private URLs or remote error messages.

The 14 added regressions cover transport write-method denial, numeric-error redaction, failed/delayed/wrong-identity RPC, request quotas, provider-bank disagreement, missing/quiet/stale/reconnected feeds, missing epoch review, stale/invalid deployment evidence and quote clocks, prepared-bank agreement, delayed agreement/expired quotes, real signed legacy/v0/v1 inspection and malformed/tampered evidence, the unchanged v1 execution fence, and dashboard approval/mark expiry. Existing suites continue covering insufficient liquidity, disabled venues/live execution, TP/SL, duplicate events, restart recovery, authentication and durable persistence.

The first full run passed 357 tests, five Python clock tests and dependency audit, but typecheck/build exposed test-only HTTP-listener overload and JSX-import resolution errors. Those were corrected rather than ignored. The first network probe also hit BigInt serialization before publication; its failure record and configuration evidence were retained. Later probes use the repository's decimal-string evidence conversion. No old report was rewritten to hide these failures.

## 10. Remaining blockers and concrete operator actions

| Blocker | Classification | Concrete next action |
|---|---|---|
| Secondary WebSocket absent | Missing configuration | Supply `SOLANA_SECONDARY_WS_URL` for the reviewed secondary service; validate per-venue ACK, identity, receipt, reconnect and sustained-delivery evidence |
| No provider attribution config/review | Missing configuration + missing independent evidence | Supply `RESEARCH_PROVIDERS_PATH` using the existing provider ID/endpoint/operator name/HTTPS attribution shape, backed by independently reviewed operator/upstream and authenticated service records; use secret management for actual URLs |
| Quotas/entitlement/archive scope unverified | External infrastructure limitation + missing evidence | Obtain subscription/read quotas, rate-limit terms and transaction-retention commitments; address the secondary's selected v0 archive miss before relying on it for older recovery |
| Account banks differ | Missing independent evidence / infrastructure capability | Establish a supported common-bank snapshot method; retain exact account sets and conflicts. Matching payload hashes at different slots cannot satisfy the gate. |
| Historical gaps/quarantine and epoch review unmet | Missing independent evidence | Independently review exact retained incident/evidence hashes and policy authority; implement/validate an approved consumption procedure separately. No new run can erase these blockers. |
| Pump/PumpSwap current upgrades and Pump Global variant | Unsupported protocol variant | Independently review current deployed code, layouts, fees, token modes, serialized policies and simulations before proposing reviewed pins/variant support |
| No fresh risk-eligible candidate; inspected controls fail token/liquidity/holder rules | Missing independent evidence of an eligible launch; affirmative risk failures on inspected subjects | Obtain genuinely fresh supported launches and complete current safety evidence; do not use these diagnostic subjects as opportunities |
| v1 execution semantics still unproven | Missing independent evidence + unsupported execution variant | Finish complete raw/config/account/inner-instruction/venue/economic validation and independent review; keep the existing v1 execution refusal until then |
| Initial-bank-only agreement, stale deployment acceptance, invalid clocks, dashboard freshness | Code defects | **Fixed and covered by new regressions**; these fixes do not grant external approval |

After the external prerequisites in [the existing operator contract](external-prerequisites.md) are satisfied, use a fresh, exclusively owned research output directory and preserve the sticky-stop/host-clock/WAL controls. Demonstrate a bounded eligible **0.10 SOL paper buy**, fresh full-position quotes and an automatic TP/SL or independently eligible exit, retaining complete source, quote, fees, slippage, reason and P&L evidence. Until then, the execution fence stays in place.
