# Phase 18 — Chainstack RPC integration and research infrastructure validation

Date: 2026-11-15. **Research remains paper-only and externally blocked for trading. Genuine current-chain paper entries/exits: 0 / 0.**

## 1. Executive summary

Chainstack is configured in the Research Mode overlay and connected from the research container. Both providers returned healthy mainnet identity and finalized slots. The final paced probe observed matching hashes for four existing program accounts at the same reported finalized bank. This narrow observation does not approve operator independence, historical coverage, a coverage epoch, a market quote or any trade.

A preservation exception occurred during regression validation: the inherited validator ran database tests against retained local **test** clusters, including a test password rotation. The application Compose PostgreSQL service was not used. The final validator isolates those tests in disposable clusters. Earlier retained test-cluster changes cannot be claimed preserved or restored; see section 7.

| Classification | Evidence and limit |
|---|---|
| **CONFIGURED** | Two unique provider IDs, schema and exact ordered HTTP endpoint mappings validated; both WSS variables present; private mount and safety controls validated |
| **CONNECTED** | Both services: HTTP health/mainnet/finalized reads and WSS handshake, four subscription acknowledgements, bounded notifications and normal close |
| **LOCALLY TESTED** | Regression, typecheck, build, audit, container mount and fail-closed startup checks; final results in section 8 |
| **INDEPENDENTLY VERIFIED** | **Not established.** Neither operator/upstream independence nor epoch approval was supplied by an independent authority |
| **EXTERNALLY BLOCKED** | Attribution/review, historical method access/retention, quotas, complete venue delivery/coverage, epoch review and existing market/deployment/version gates |

No research experiment, signing, broadcasting, forced entry/exit, coverage approval or quarantine resolution was performed.

## 2. Files created or modified

Modified:

- `compose.research.yaml`: provider-file environment path and read-only bind; explicit research `REAL_MARKET_PAPER=false`.
- `.dockerignore`: exclude `/private/` from the build context. `.gitignore` already excluded it and remains unchanged.
- `src/research/provider-config.ts` (new): bounded-shape validation, unique IDs/endpoints, ordered primary/secondary mapping, sanitized load failures and transport error formatting. The existing optional no-file fallback remains unattributed; an explicitly configured missing/invalid file fails closed.
- `src/research/providers.ts`: validate configuration before constructing provider state; existing consistency/independence/quarantine rules remain.
- `scripts/phase8-mainnet.ts`, `scripts/phase9-mainnet.ts`: validate both configured endpoints before creating output/ledger; sanitize retained transport errors and numeric error fields.
- `scripts/phase10-mainnet.ts`, `scripts/phase11-mainnet.ts`: validate before output snapshots, epoch files or owner acquisition.
- `src/research/validation-probe.ts`: permit read-only `getHealth`, gracefully close WSS with a bounded termination fallback, cap processed notifications at 100 and ignore messages after completion begins.
- `scripts/phase18-rpc-diagnostics.ts` (new): finite container diagnostics, paced HTTP reads, redacted output, no engine or ledger integration.
- `tests/phase18-providers.test.ts` (new): configuration/mapping, private mount, startup, error redaction, rate limits/timeouts, disconnect/close and notification-cap regressions.
- `scripts/phase18-validation.py` (new): isolated Node 22 installation and report copies, with disposable database test homes and unchanged `HOME`.

This report and sanitized evidence are under `docs/phase18*`. Existing tests, historical evidence, dependency manifests, deployment pins, protocol authorizations, environment and private provider bytes remain unchanged; [preservation details](phase18/preservation-check.json) cover repository files, not database contents.

## 3. Effective Docker Compose checks

`docker compose -f compose.yaml -f compose.research.yaml --profile research config -q` passed. The resolved JSON was inspected in memory without printing environment values. [Configuration checks](phase18/configuration-checks.json) verify:

- Primary/secondary HTTPS and WSS are passed into `research`.
- `RESEARCH_PROVIDERS_PATH=/app/private/research-providers.json` and the exact read-only bind exist.
- `read_only:true`, `restart:"no"`, `MODE:paper`, owner/stop paths, original resource/history mounts and coverage-aware healthcheck remain.
- Both services in the merged overlay explicitly disable `REAL_MARKET_PAPER`; no signer or live authorization was added.

[Container mount checks](phase18/container-mount-checks.json) independently confirm actual read-only root/private mount options and readable JSON as UID/GID 1000. The file's owner is also 1000; no chmod/chown or root override was required. The running ordinary application reports paper mode, no signer variables and an unset `REAL_MARKET_PAPER`, which the existing server treats as disabled. It was not recreated; selecting the overlay makes `false` explicit.

The research production image built successfully. A separate network-disabled container confirmed `/app/private` and `/app/.env` are absent without the runtime bind. The ordinary app/PostgreSQL deployment was not rebuilt or restarted.

## 4. Provider configuration verification

The existing private file is valid JSON with exactly two unique IDs and validated `ResearchProviderConfig` entries. Its first endpoint exactly matches the effective primary HTTP variable, and its second exactly matches the secondary HTTP variable. Both WSS values come from the Compose environment; WSS is not a field in the existing provider JSON interface.

The primary has no operator metadata. The secondary has operator name/HTTPS attribution metadata. No operator name, attribution URL, private endpoint, credential or private file contents are included in published evidence. Successful reads establish connectivity, not the contractual identity, paid entitlement or independent ownership of a service.

The directory remains `0700`, the file remains `0600`, and its original bytes are unchanged.

## 5. HTTP and WebSocket diagnostics

The decisive [final diagnostic](phase18/provider-diagnostics-final.json) ran in a one-off research container with the existing paper command replaced by the read-only diagnostic. Each provider made seven allowlisted HTTP calls, at least 1.1 seconds between starts, with a five-second request deadline, bounded response size and no retries. WSS used at most four finalized log subscriptions/provider, a 12-second window, a 100-notification processing cap and a 500 ms close fallback.

| Observation | Primary | Secondary / Chainstack |
|---|---|---|
| `getHealth` | `ok` | `ok` |
| Mainnet genesis | Matches | Matches |
| Independent finalized slot read | 469827073 | 469827073 |
| Consistency finalized slot | 469827084 | 469827084 |
| `getFirstAvailableBlock` | Reports 0; no completeness inferred | HTTP 403; capability/entitlement unresolved |
| HTTP success/failure | 7 / 0 | 6 / 1 |
| HTTP 429 in final paced pass | 0 | 0 |
| WSS open / pong | Yes / 1 | Yes / 1 |
| Subscription ACKs | 4 / 4 | 4 / 4 |
| Processed notifications | 100 | 100 |
| Close handshake | Code 1000; no forced termination | Code 1000; no forced termination |

Primary receipts: Pump 99, Raydium CPMM 1. Secondary receipts: Pump 8, PumpSwap 78, Meteora DLMM 14. Other venue rows remain unknown within this deliberately short window. The overall WSS status is therefore `unknown` for complete four-venue delivery, despite successful transport. Signature-format counters do not prove cryptographic transaction validity or complete coverage.

The [initial probe](phase18/provider-diagnostics.json) is retained: it observed two secondary HTTP 429 responses and an incomplete consistency read. It also exposed counting of queued messages after close initiation (112/392 counted). The cap defect was corrected and regression-tested; only the final capped results above are used for acceptance. The initial secondary `genesisMatches:false` reflects unavailable combined-read evidence, not an observed wrong-chain hash; the final diagnostic uses `null` for unavailable identity. No remote error text was retained. Zero final rate limits does not establish sustained quota capacity.

## 6. Provider agreement and independence

The existing `ProviderConsistency` inspected the four registry program accounts with finalized commitment. Both responses reported account bank **469827088**, identical digest, and **zero missing accounts**. This is one actual matching-bank observation, not a fabricated comparison of different slots. It does not bind a trading quote/prepared fill bank or establish agreement for pool, token, custody and liquidity accounts.

The assessment remains **`unknown`, `eligible:false`, independence `unknown`, `liveAuthorized:false`**, because distinct operator attribution is missing. Even complete JSON metadata would only be configuration evidence; independent upstream/operator review remains unmet. No approval mechanism or safety rule was weakened.

The temporary consistency instance created no quarantine and recorded no polling gaps. Those observations do not clear any historical incident. `getFirstAvailableBlock` alone cannot establish transaction retention or original-gap recovery; the secondary 403 blocks even that limited capability check. Existing historical archive limitations, gaps, quarantines and epoch review remain unresolved and were not rewritten.

## 7. Security, secrets and preservation

`/private/` is already Git-ignored, and the exact file path was verified against the ignore rule using a temporary Git index outside this workspace. **This checkout has no Git metadata:** actual tracked/untracked status and commit-history exposure cannot be verified. No repository was initialized and no index/history was modified. Check the real repository index before committing; if the file is tracked, stop for separate remediation.

Private data is excluded from Docker context, diagnostic output, exception text and new test fixtures. Reports store generic provider roles, boolean configuration facts, numeric codes, counts, timings, slots and account digests. The [security scan](phase18/security-checks.json) checks new/changed artifacts against configured secrets and endpoint components without publishing the values.

**Regression-harness preservation exception:** initial inherited validation runs used `os.homedir()` defaults in the original database tests. Those tests write retained local Phase 7/8 regression clusters (`~/.local/state/mintbot-phase7-postgres` and `~/.local/state/mintbot-phase8-postgres`); the Phase 8 suite rotates its runtime test credential. Thus retained test records/credentials were affected before the isolation gap was detected. One overlapping run also suffered timing failures; another unisolated run was cancelled. Logs are retained. Previous test-cluster record/password bytes were not restored or reconstructed. No application `DATABASE_URL`, Compose PostgreSQL password, production paper ledger or coverage approval was used by those tests.

The final validator overrides only the `os.homedir()` API inside disposable test processes, inherited by their children, pointing into the temporary validation installation. It leaves `HOME`, original tests, original database helpers and application configuration unchanged. Final database evidence is checked for disposable cluster paths and `reused:false`. This prevents further retained-cluster writes; it does not undo the earlier exception. A read-only [status check](phase18/retained-test-cluster-status.json) found both retained test clusters stopped; no further changes were made to them. Full database preservation therefore cannot be claimed.

## 8. Regression results

**Final isolated serial result: 365/365 TypeScript tests, 5/5 Python clock tests, backend/frontend typecheck and build passed, zero dependency-audit advisories.** All 357 original TypeScript tests and eight additions passed. The production image’s 147 compiled runtime modules match the clean tested build.

Final results and source verification are recorded in [validation summary](phase18/validation-summary.json), [commands and exit codes](phase18/serial-release/clean-validation.json) and [complete test log](phase18/serial-release/clean-tests.log). The final suite uses Node 22, a clean `npm ci`, unchanged original tests, copied mutable database-summary report paths and disposable test databases.

The eight added tests cover malformed/missing configuration, schema/ID/endpoint mismatch, secret-safe errors, private mounts and safety flags, all four entrypoints refusing invalid startup before state creation, HTTP 429/timeouts, graceful and unexpected WSS closes, and the exact notification cap. Existing regressions retain missing-account/operator evidence, wrong-chain/regression/conflict quarantine, different-bank rejection, delayed quotes, coverage refusal and live-execution rejection coverage. No original test was changed to pass.

Intermediate outputs under `regression`, `final-regression`, `release-validation` and `isolated-release` are not the final acceptance result: the first passed 363 tests before the last two regressions were added; overlapping validation encountered short-deadline timing failures, and the later unisolated run was cancelled. The first isolated four-worker run passed 363/365 tests; two local HTTP tests expired at short deadlines. The final isolated serial run uses the same tests and application deadlines; its result is recorded separately.

## 9. Remaining external blockers

1. Independently reviewed primary and secondary operator/upstream identity, service attribution and authorization. Secondary JSON metadata is insufficient.
2. Chainstack historical-method access (HTTP 403), archive/transaction retention and documented read/subscription quotas. Initial 429s show that burst behavior needs explicit service-capacity review.
3. Sustained per-venue delivery and exact historical gap reconciliation; short capped subscriptions and one matching program-account bank cannot prove completeness.
4. Independent coverage-policy/epoch review and its separately reviewed consumption procedure. Existing gaps/quarantines remain evidence, not resettable counters.
5. Existing Phase 16/17 deployment, supported variant, token/liquidity/holder risk, unsigned simulation and v1 semantic blockers; no fresh eligible launch or current-chain lifecycle was demonstrated.
6. Real Git index/history verification and operator review of the retained regression-cluster side effect.

## 10. Exact next safe actions

1. Obtain independent provider/upstream and quota/retention evidence through the existing [operator contract](external-prerequisites.md). Resolve the secondary historical-method 403 with the service operator; do not infer approval from a working health check.
2. In the actual Git checkout, verify `git ls-files -- private/research-providers.json` emits nothing and `git check-ignore private/research-providers.json` succeeds. Stop if tracked; retain restrictive permissions and avoid printing Compose environment output.
3. Use `python3 scripts/phase18-validation.py --output-root <new-evidence-directory> --serial-tests` for future regression runs so database tests remain disposable. Review the retained test-cluster exception separately without automatic password or record restoration.
4. Rebuild `research`, then run the diagnostic only:

   ```bash
   docker compose -f compose.yaml -f compose.research.yaml --profile research config -q
   docker compose -f compose.yaml -f compose.research.yaml --profile research build research
   docker compose -f compose.yaml -f compose.research.yaml --profile research run --rm --no-deps -T --entrypoint node research dist/scripts/phase18-rpc-diagnostics.js --run
   ```

5. Obtain independently reviewed original-gap/coverage evidence and current-window epoch authority; demonstrate agreement on the actual eligible market and prepared quote banks, revalidate deployments, risks and unsigned simulations. Keep blocked opportunities blocked.
6. Only after every prerequisite passes, use a fresh exclusively owned output directory with existing host-clock, sticky-stop, owner and WAL controls for the separately authorized paper lifecycle validation. **No 1,800-second experiment is authorized by connectivity alone.**

Real-money execution remains disabled. No current-chain paper entry or exit is claimed.
