"""Generate Phase 13 acceptance reports from a finished single run, never from a progress file."""
from pathlib import Path
import collections
import datetime
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/phase13'


def read(name):
    return json.loads((OUT / name).read_text())


def doc(name, text):
    (ROOT / 'docs' / name).write_text(text.strip() + '\n')


e = read('runtime/mainnet-validated/evidence.json')
assert e.get('endedAt'), 'Final run evidence required'
s, j = e['supervisor'], e['journal']
funnel = read('candidate-outcomes.json')
identity = read('identity-mainnet-analysis.json')
probe = read('identity-probe-analysis.json')
postrun = read('postrun-creation-verification.json')
late_verified = [launch for row in postrun['rows'] for attempt in row['attempts'] for launch in (attempt.get('verified') or [])]
clock = read('timing/during-mainnet-validated/evidence.json')
preflight = read('timing/preflight-1800/evidence.json')
short = read('timing/preflight-300-validated/evidence.json')
entry, exit = funnel['paperEntries'], funnel['paperExits']
log = (OUT / 'delivery-validation/after-tests.log').read_text()
tests = re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)', log, re.S)
assert tests
test_ok = tests[1] == tests[2] and tests[3] == '0'
build = read('clean-delivery-validation/clean-build.json')
audit = json.loads((OUT / 'clean-delivery-validation/audit.log').read_text())
checks_ok = test_ok and all(r['exitCode'] == 0 for r in build['checks']) and audit['metadata']['vulnerabilities']['total'] == 0
duration_ok = (s['elapsedMs'] >= 1800000 and abs(s['clockDiscontinuityMs']) <= 1000
               and s['state'] != 'terminal' and clock['stableForRequestedInterval']
               and clock['containerBoundsPassed'] and preflight['stableForRequestedInterval'])
gaps = dict(collections.Counter(g['status'] for g in j['gaps']))
coverage_ok = (not any(g['status'] != 'recovered' for g in j['gaps']) and j['quarantined'] == 0
               and e['unverifiableIdentities'] == 0 and not e['pipeline']['fatal'] and not j['writerFailure']
               and e['coverageEpoch']['researchPolicyReview'] == 'verified')
gates = [
    ('Zero-identity origin', 'PASS' if identity['remotePayloadOriginDemonstrated'] or probe['remotePayloadOriginDemonstrated'] else 'PARTIAL', 'Byte-exact incoming envelopes and linked admission evidence; remote internal cause remains unknown.'),
    ('Invalid-identity admission', 'PASS' if test_ok else 'FAIL', 'Research rejects zero, malformed and wrong-width signatures; strict diagnostic profile rejects ambiguous/version/mapping payloads.'),
    ('1,800-second stable monitoring', 'PASS' if duration_ok else 'FAIL', f"One supervisor: {s['elapsedMs']/1000:.6f} monotonic seconds; wall discrepancy {s['clockDiscontinuityMs']:.3f} ms."),
    ('Continuous required coverage', 'PASS' if coverage_ok else 'FAIL', f"Current gaps {gaps}; quarantines {j['quarantined']}; invalid identities {e['unverifiableIdentities']}."),
    ('Current Pump/PumpSwap variants', 'PARTIAL', 'Both observed variants remain blocked. Reviewed diagnostic semantics do not complete financial compatibility.'),
    ('Raydium/Meteora creation detection', 'PARTIAL', f'Raydium: {len(late_verified)} actual selected creation verified after the run, excluded from entries. Meteora legacy detection is validated offline; current delivery/new initializer coverage remains incomplete.'),
    ('Independent providers', 'PARTIAL', 'Unavailable: public endpoints are not an authenticated independently operated pair; different account banks remain unknown.'),
    ('Genuine current paper entry/exit', 'PASS' if entry and exit else 'FAIL', f'{entry} entries / {exit} exits. Historical unsigned public-inventory diagnostics are excluded.'),
    ('Tests/build/security checks', 'PASS' if checks_ok else 'FAIL', f'{tests[2]}/{tests[1]} TypeScript tests, five Python clock tests; clean Node22 install/build/typecheck, container and PostgreSQL checks; audit capture retained.'),
    ('Funded execution disabled', 'PASS' if e['liveTrading'] is False else 'FAIL', 'No signing, submission, funding or spending authorized or introduced.'),
]
summary = {'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
           'fullPhaseAcceptance': False, 'endToEndCurrentPaperValidated': bool(entry and exit),
           'gates': [{'gate': name, 'status': status, 'detail': detail} for name, status, detail in gates],
           'tests': {'total': int(tests[1]), 'passed': int(tests[2]), 'failed': int(tests[3]), 'pythonClockTests': 5},
           'monitoring': s, 'notifications': e['notifications'], 'selectedCandidates': len(e['rows']),
           'verifiedCreationsDuringRun': sum(r.get('verifiedLaunches', 0) for r in e['rows']),
           'verifiedCreationsAfterRunExcludedFromEntries': len(late_verified),
           'candidateOutcomes': funnel['counts'], 'venueCounts': e['venueCounts'], 'gaps': j['gaps'],
           'quarantines': j['quarantined'], 'refusalCounts': e['refusalCounts'],
           'wireZeroProofs': len(identity['byteExactZeroProofs']), 'identityCapture': e['identityAudit'],
           'independentProviderAgreement': False, 'independentEpochApproval': False,
           'paperEntries': entry, 'paperExits': exit, 'liveTrading': False,
           'signingBroadcastSpending': False, 'audit': audit['metadata']['vulnerabilities']}
(OUT / 'validation-summary.json').write_text(json.dumps(summary, indent=2) + '\n')
table = '\n'.join(f'| {name} | **{status}** | {detail} |' for name, status, detail in gates)
venue_table = '\n'.join(f"| {name} | {v['notifications']} | {v['creationHints']} | {v['selected']} | {v['unverifiableIdentities']} |" for name, v in e['venueCounts'].items())
funnel_table = '\n'.join(f'| {name} | {count} |' for name, count in funnel['counts'].items())

doc('phase13-engineering-report.md', f'''
# Phase 13 engineering report

**Full phase acceptance remains unmet.** The delivered pipeline identifies zero signatures at the incoming transport boundary and refuses invalid research identities. Current protocol, coverage/provider and genuine paper-lifecycle blockers remain explicit. Signing, broadcasting and spending remain disabled.

| Acceptance gate | Result | Evidence-backed assessment |
|---|---|---|
{table}

The exact [Phase 12 starting source](phase13/source-at-start-sha256.json), [source archive](phase13/source-at-start.tar.gz), [prior evidence manifest](phase13/prior-artifact-sha256.json) and [earlier root documents](phase13/prior-root-docs/docs/phase12-engineering-report.md) preserve the baseline. No original test, deployment pin, reviewed financial layout or dependency lock was changed. Current source and loaded compiled modules are checked by the [delivery verifier](../scripts/phase13-final-validation.py).

The first 120-second identity diagnostic captured {probe['notifications']:,} notifications and two exact zero-signature envelopes. Its raw bytes, parsed field, normalized signature, stable key and fsynced refusal are linked by SHA-256. The new primary run supplies {len(identity['byteExactZeroProofs'])} further byte-exact zero proofs. This establishes incoming remote-payload origin for these samples, not the remote server's internal reason or the missing historical Phase 12 envelopes. There was no signature fallback to remove. [Root-cause report](zero-signature-root-cause.md).

The existing shared supervisor, risk/market services, simulation gate, WAL and paper ledger remain in use. Changes add bounded sanitized wire diagnostics, strict JSON-RPC envelope handling in the explicit diagnostic profile, canonical 64-byte signature checks at research admission, and a bounded single-reader verification schedule. HTTP 429 retries honor cooldown and stop at evidence deadlines; finality, ownership, schema, provider, coverage and freshness requirements remain mandatory. Creation hints retain wire provenance between regular samples and remain hints until finalized verification.

The primary run measured {s['elapsedMs']/1000:.6f} monotonic seconds, received {e['notifications']:,} notifications, selected {len(e['rows'])} receipts and verified {summary['verifiedCreationsDuringRun']} creations during monitoring. Fully ACKed time was {s['acknowledgedMs']/1000:.6f} seconds, distinct from connected time {s['connectedMs']/1000:.6f} and disconnected time {s['disconnectedMs']/1000:.6f}. Final gaps: {gaps}; current quarantines: {j['quarantined']}. Preflights, diagnostic and owner probes are excluded from that duration. [Monitoring](stable-monitoring-validation.md), [coverage/providers](independent-provider-and-coverage.md).

| Venue | Notifications | Creation hints | Selected | Invalid identities |
|---|---:|---:|---:|---:|
{venue_table}

Current Pump and the observed reversed PumpSwap route remain disabled. A current selected Raydium creation is verified after the run; Meteora's retained legacy fixture remains valid offline but its current historical reread is unavailable. Public discovery API HTTP 403 and unsupported initializers are recorded rather than inferred away. [Protocols](current-protocol-compatibility.md), [creation validation](raydium-meteora-creation-validation.md).

All selected outcomes are accounted for, with **{entry} paper entries and {exit} exits**. No historical public inventory is treated as a fresh position. [Execution evidence](end-to-end-paper-evidence.md). The delivered image also passes shared-owner refusal and authenticated sticky stop. Existing crash/restart and PostgreSQL recovery checks remain in the complete suite. [Performance/security](performance-and-security.md), [funded blockers](remaining-funded-trading-blockers.md), [commands and immutable artifacts](phase13/README.md).
''')

doc('zero-signature-root-cause.md', f'''
# Zero-signature root cause — Phase 13

**PASS at the local transport boundary: captured zero identities are already present in incoming provider notification data.** Their remote emission mechanism remains unknown. Phase 12 retained normalized observations, so its unavailable raw envelopes cannot be retrospectively verified.

| Stage | Result |
|---|---|
| Raw WebSocket bytes | Sanitized bounded base64 envelopes retain original SHA-256/length and an explicit byte-exact flag. Two probe samples and {len(identity['byteExactZeroProofs'])} primary-run samples are byte-exact zero proofs. |
| Provider notification | JSON-RPC `params.result.value.signature` contains 64 base58 `1` characters, encoding 64 zero bytes. |
| Subscription normalization | Acknowledged subscription IDs bind to the registered program; unbound mappings in the strict profile fail and open recovery gaps. |
| ProgramObservation | `signature: value.signature` copies the field; no empty/default/generated signature is inserted. |
| Signature extraction | Canonical base58 width and all-zero checks operate without replacing the input. |
| Stable identity | The existing key is verified program address plus original signature. Cross-program signatures remain distinct. |
| WAL admission | Invalid identities create a fsynced gap/refusal; no pending/completed ownership or anchor is created. The audit records the returned refusal after that boundary. |

[Probe analysis](phase13/identity-probe-analysis.json), [primary analysis](phase13/identity-mainnet-analysis.json) and their `wire-identity.jsonl` files preserve the joins. Redacted or truncated envelopes are excluded from byte-exact proof. The corpus is bounded; retention and dropped-record counts are explicit. No endpoint path, request credential or authorization header is captured. Local hashes provide tamper evidence, not external notarization.

The strict diagnostic profile rejects unsupported JSON-RPC versions and duplicate object keys, including escaped spellings, before normalization. Missing/non-string identities cannot become observations. Research admission also refuses invalid alphabet/width identities. Invalid strict-profile observations cannot advance the monitor's slot head. Existing generic journal fixture behavior remains compatible; this is an explicit research admission policy.

Tests cover byte-exact wire→observation→durable refusal/restart, missing/malformed/versioned payloads, ambiguous keys, same-program duplicates/conflicts, cross-program identity scope, unbound subscriptions, sanitizer limits and creation-wire capture. [Tests](../tests/phase13-wire-identity.test.ts). Changed payloads still do not prove chain forks or provider culpability. No signature is manufactured, substituted or refreshed.
''')

doc('stable-monitoring-validation.md', f'''
# Stable monitoring validation — Phase 13

**Duration gate: {'PASS' if duration_ok else 'FAIL'}. Continuous required coverage: {'PASS' if coverage_ok else 'FAIL'}.** Elapsed time and complete event coverage are assessed separately.

| Separate experiment | Monotonic seconds | Result |
|---|---:|---|
| Corrected fresh 300-second preflight | {short['actualMonotonicSeconds']:.9f} | Stable: {short['stableForRequestedInterval']} |
| Required same-budget preflight | {preflight['actualMonotonicSeconds']:.9f} | Stable: {preflight['stableForRequestedInterval']} |
| Primary supervisor, one run | {s['elapsedMs']/1000:.9f} | State: {s['state']} |
| Concurrent independent clock observer | {clock['actualMonotonicSeconds']:.9f} | Stable: {clock['stableForRequestedInterval']} |

The Phase 12 timing guard still requires a completed preflight at least as long as the proposed monitoring interval. The additional 1,800-second preflight preserves that rule after the requested fresh 300-second check. Their durations are never added to monitoring. The earlier 120-second identity probe and roughly ten-second owner probes are also excluded.

Temporary `systemd-inhibit --what=sleep:idle --mode=block` locks are held during preflights and across launch/wait of the actual research container. [Inhibitor evidence](phase13/timing/inhibitors-during-preflight.json), [driver](../scripts/phase13-stable-monitor.py), [launch record](phase13/validated-runtime-launch.json). No permanent desktop sleep policy is changed. Kernel suspend counters, realtime/monotonic/boottime/raw clocks, scheduler/process/cgroup CPU and NTP journals are retained under `phase13/timing/`.

Primary supervisor wall seconds: {s['wallElapsedMs']/1000:.6f}; wall/monotonic discrepancy: {s['clockDiscontinuityMs']:.6f} ms. Connected: {s['connectedMs']/1000:.6f} seconds; fully ACKed: {s['acknowledgedMs']/1000:.6f}; disconnected: {s['disconnectedMs']/1000:.6f}. Connections: {s['connections']}; incidents: {s['incidents']}. Exact socket/ACK/fault chronology is in `supervisor.intervals` and `supervisor.events` in [final evidence](phase13/runtime/mainnet-validated/evidence.json). The clock observer uses a persistent same-host container; the research wrapper additionally checks its own current boot and coherent wall/monotonic ages.

The initial `runtime/mainnet/` container failed a five-second public RPC genesis bootstrap before monitoring started. Its source/ledger/launch and container logs are preserved and contribute no supervisor time. The distinct primary `runtime/mainnet-validated/` uses PublicNode as primary and Solana public RPC as secondary; neither is authenticated or independently authorized.

The first 300-second observer wrote successful evidence, but its one-off outer launch command raised an exit-handling TypeError. That failed log is preserved. A corrected separate fresh 300-second launch returned success. No failure was overwritten or counted as extra coverage.

Final gap states are {gaps}, quarantines {j['quarantined']}, invalid identities {e['unverifiableIdentities']}. WAL writer failure: {j['writerFailure']}; pipeline fatal: {e['pipeline']['fatal']}. These facts prevent a duration-only coverage claim. [Coverage reconciliation](independent-provider-and-coverage.md).
''')

doc('current-protocol-compatibility.md', '''
# Current protocol compatibility — Phase 13

**Current Pump deployment and the observed reversed PumpSwap variant remain blocked. No financial adapter, deployment pin or allocation whitelist was broadened.**

[Current finalized Pump capture](phase13/pump-deployment/evidence.json) again observes deployment slot 469055660 against reviewed slot 458921440. Referenced ELF SHA-256 remains `0630a8108569c1c7a5b833c6e11276ebac03c801c495b1685fcfac99bf865cc5`; full ProgramData and padded payload hashes are separately retained. The [Global read](phase13/current-network/evidence.json) is 1096 bytes, while the pinned official Global schema accounts for 1088. Tail `1e00000000000000` still has no established authoritative field meaning. Public source/interface publication is not deployed binary/financial-contract equivalence.

The freshly captured [official revision and IDLs](phase13/official/evidence.json) remain pinned to commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22` for Pump. Native/non-native quotes, Mayhem supply/reserves, recursive depth, configurable fees, reward custody, transfer restrictions and new instructions are not globally approved by matching selected fields. [Phase 12 financial review](current-pump-financial-contract.md) and the [current assessment](phase13/current-protocol-assessment.json) preserve the missing proof chain.

The observed PumpSwap pool is `DLEu6cVEPJ9Y64WG9Qs9ZtciWV4e9EjLWP8QH7vki5VA`. Its base mint is wrapped SOL, quote mint `Bj1XKzJ4MRj5gpJ9K4VWEjQsEvSyGuCP8JDjF53pAEHX`. [Current equal-batch custody](phase13/pumpswap-contract.json) validates vault mint/authority relationships and signed accounting bounds. The SOL-side vault holds only **585 lamports**, below the unchanged strategy minimum. Current signed offset and retained fee buckets are zero; the original offset was -8,859,839 with matching retained protocol fees. No intervening sweep is inferred without transaction proof.

Official [signed-reserve semantics](https://raw.githubusercontent.com/pump-fun/pump-public-docs/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/docs/NEGATIVE_VIRTUAL_QUOTE_RESERVES.md) define effective quote reserves as quote custody plus a signed i128 offset. Retained fees are liabilities, not extra liquidity. Values are never clamped or reinterpreted as unsigned. SOL-base/native mint supply is zero, so the retained SDK market-cap equality is degenerate and cannot validate bidirectional quotes. Reversed routing, fee denomination, independent integer buy/sell wires, complete custody/authority evidence and actual two-sided variant simulations remain incomplete.

Independent [wire vectors](phase13/builder-reference.json) match 8/8 and [captured-state quote vectors](phase13/quote-reference.json) match 16/16 for already reviewed subjects. UNIT wire accounts and historical fixtures remain diagnostic. [Current buy](phase13/current-buy-simulations.json) and [sell](phase13/current-sell-simulations.json) calls succeed on a separate supported PumpSwap subject; Raydium sell also reconciles. They do not validate the observed reversed route or establish an eligible paper entry, owned inventory, full fresh-position lifecycle or profitability. Fees, rent and balance effects remain in the exact simulation accounting records.
''')

doc('raydium-meteora-creation-validation.md', f'''
# Raydium/Meteora creation validation — Phase 13

**PARTIAL. Existing strict finalized creation detection is validated; exhaustive current coverage and newer initializer support are not claimed.** The [coverage matrix](phase13/creation-validation.json) separates supported variants, actual finalized fixtures and current reread availability.

The actual Phase 12 Raydium `initialize` receipt at slot 469514659 is reverified against current finalized reads. Meteora's actual retained `initialize_lb_pair` fixture verifies against its retained finalized/account evidence; PublicNode returned null for its historical transaction reread, which remains unavailable, not zero creations. Neither historical receipt becomes a fresh entry. The public Meteora pool-discovery API returned HTTP 403; the failed requests are preserved under [discovery evidence](phase13/dlmm-discovery/). A separate [per-venue delivery check](phase13/venue-delivery-check.json) found recent successful Meteora history on both public RPC endpoints while the primary notification counter was zero. [Single-venue controls](phase13/venue-controls.json) are separate bounded experiments, never added to primary duration or interpreted as creation proof. In the 60-second controls, the same monitor received 6,591 Meteora notifications from Solana public RPC and zero from PublicNode despite acknowledgements; PublicNode reached the receipt-stale watchdog. This establishes a provider/connection-specific delivery gap in that sample, with the remote internal mechanism unknown. Subscription ACKs and aggregate traffic therefore cannot demonstrate all-venue delivery. These are observations and swaps, not 6,591 pool creations.

Raydium `initialize_with_permission` and Meteora `initialize_lb_pair2`, permissioned and customizable variants remain unsupported without complete finalized fixtures and invocation/account/PDA proof. Pool creation is distinct from bin-array initialization, position initialization, liquidity changes and swaps. Existing decoder checks still require exact successful invocation attribution, instruction data, event identity and account relationships.

| Venue | Notifications in primary run | Creation hints | Selected |
|---|---:|---:|---:|
| Raydium CPMM | {e['venueCounts']['raydium-cpmm']['notifications']} | {e['venueCounts']['raydium-cpmm']['creationHints']} | {e['venueCounts']['raydium-cpmm']['selected']} |
| Meteora DLMM | {e['venueCounts']['meteora-dlmm']['notifications']} | {e['venueCounts']['meteora-dlmm']['creationHints']} | {e['venueCounts']['meteora-dlmm']['selected']} |

The primary run selected one new Raydium `initialize` receipt at slot 469745467, signature `25UYv2XuXoA5oXgeABN69icevLsGziurJoJewzpKeYhKsn7KQ8KaUEpRetUciqoMPui7vwMva6hXnqXAt7dHJMgx`. It was quarantined from incomplete/truncated live invocation logs. A bounded finalized post-run reread proves pool `Fy2GNqA73qDqDsFANKM2WrhDH6fppoyLT9hqStQdNJS1`; the [new actual creation fixture](phase13/raydium-current-creation-fixture.json) retains original receipt, wire provenance, quarantine cause and full finalized proof. It remains history-bound and ineligible for a fresh entry. This late proof is counted separately from creations verified during monitoring.

[Primary selected outcomes](phase13/candidate-outcomes.json) retain every verification result. [Post-run rereads](phase13/postrun-creation-verification.json) preserve original timestamps and explicitly history-bound freshness. Hint counts are not verified creation counts, and missing/failed reads do not estimate genuine creation frequency. Sampling caps, gaps and rate limits remain visible.

The existing verifier now optionally uses one bounded reader, capacity 16, minimum spacing 350 ms, at most two HTTP attempts and an eight-second per-request budget in this research run. HTTP 429 cooldown is honored, including refusal when Retry-After exceeds the evidence deadline. This does not relax finalized or mandatory account evidence, share a global quota with every RPC client, or prove an improvement across unequal live workloads. [Scheduling tests](../tests/phase13-verification-scheduling.test.ts).
''')

doc('independent-provider-and-coverage.md', f'''
# Independent provider and coverage evidence — Phase 13

**Independent authenticated providers are unavailable; current-window authorization remains blocked.** No provider-related credentials were configured in the execution environment. Public endpoint brands cannot establish independent infrastructure or authentication.

[Provider observations](phase13/provider-validation.json) retain genesis, finalized slots and account reads. [Historical transaction comparison](phase13/provider-history.json) compares the actual Raydium signed message/signatures across both public endpoints. Its matching selected payload does not prove equal account banks or operator independence. The market account reads have different reported banks; account agreement remains unknown. `minContextSlot` is never interpreted as exact-bank equality. Missing history, HTTP/RPC errors and any conflicts remain explicit; a conflicting diagnostic requires manual review, not automatic quarantine release or epoch approval.

The primary run ended with gaps {gaps}, current quarantines {j['quarantined']}, refusals {e['refusalCounts']}. [WAL reconciliation](phase13/runtime-reconciliation.json), [forensics](phase13/run-forensics.json) and [coverage history](phase13/coverage-history.json) preserve status and original identities. Prior Phase 11/12 gaps and quarantines remain referenced by hash in the five supplied history artifacts; new run IDs and empty queues grant no permission. Zero identities remain a run-level coverage failure even if a provider scan labels a gap recovered.

Recovery is bounded and provider-reported. Page/transaction/window limits cannot prove completeness once anchors or predecessor evidence are unavailable. No original WAL is rewritten by offline reconciliation, and no historical zero/refusal is relabeled a verified transaction or proven fork. Quarantine mutation still requires separate authorized, expiring WAL/plan/fingerprint-bound review with durable audit.

The existing [draft epoch policy](phase12/current-window-policy-proposal.json) is unapproved. No new policy authority was manufactured for this run. Common-state evidence, authenticated independent operator provenance, complete required current-window coverage, reviewed protocol support and fresh strategy/risk checks remain entry prerequisites.
''')

doc('end-to-end-paper-evidence.md', f'''
# End-to-end current-chain paper evidence — Phase 13

**Acceptance {'PASS' if entry and exit else 'FAIL / UNMET'}: {entry} genuine paper entries, {exit} exits. No realized paper P&L is inferred from diagnostics.** The existing shared supervisor, market adapter, mandatory risk engine, simulation gate and file-backed paper ledger are retained.

Primary notifications: {e['notifications']:,}; selected receipts: {len(e['rows'])}; finalized creations during run: {summary['verifiedCreationsDuringRun']}. Invalid-identity refusals occur before candidate admission and are separately retained. Original live receipt/time, wire links where captured, finalized verification and every selected outcome are in [the complete selected funnel](phase13/candidate-outcomes.json).

| Selected outcome | Count |
|---|---:|
{funnel_table}

This is complete for selected receipts, not all launches on the network. Sampling limits and capture drops remain in [final evidence](phase13/runtime/mainnet-validated/evidence.json). Market rejection reasons are {e['rejectionCounts']}; verification reasons are {e['verificationRejectionCounts']}. Unresolved or quarantined work never becomes an eligible entry.

The full required path remains original live receipt → finalized identity → current reviewed protocol/account custody → token/extension/holder/liquidity evidence → fresh integer buy/full-position sell quotes → independently validated unsigned instructions → reconciled simulation effects/costs → current provider/coverage/freshness/strategy/stop recheck → durable entry → fresh executable sell monitoring → normal exit and terminal ledger/P&L. Historical post-run proof cannot satisfy the original receipt's freshness or fill a missing stage.

Unsigned [buy diagnostics](phase13/current-buy-simulations.json) and [sell diagnostics](phase13/current-sell-simulations.json) retain actual errors, fees, rent, public inventory and reconciled effects. Supported PumpSwap and Raydium diagnostic subjects are different from unapproved current variants. Public inventory impersonation with `sigVerify:false` is neither user-owned inventory nor a fresh paper entry. Separate buys/sells on different public accounts cannot form a synthetic round trip or establish profitability.

With no qualified position, fresh full-position exit monitoring and terminal paper P&L remain unproved. No strategy limit, concentration requirement, deployment guard, provider rule or coverage policy was bypassed to force a trade.
''')

doc('performance-and-security.md', f'''
# Performance and security — Phase 13

**Validation {'PASS' if checks_ok else 'FAIL'}; no speedup claim.** [Final regression](phase13/delivery-validation/after-tests.log): {tests[2]}/{tests[1]} TypeScript tests, all original 312 retained byte-for-byte. Five original Python clock tests pass. [Clean Node22 validation](phase13/clean-delivery-validation/clean-build.json) records isolated npm ci, typecheck, backend/frontend build and audit. Audit vulnerabilities at capture: {audit['metadata']['vulnerabilities']['total']}. Earlier validation logs remain intact.

[Final image smoke](phase13/production-delivery-smoke.json) verifies authentication, dashboard, no-store research projection, SQL assets and live-mode rejection in an actual read-only, network-disabled container. [Final wrapper owner/stop probe](phase13/final-release-probe-stop-owner-smoke.json) refuses a concurrent shared-namespace owner, accepts authenticated sticky kill, drains the ledger and releases ownership. Its short duration is excluded from primary monitoring. No cross-host/distributed lease is claimed.

The unchanged regression suite executes PostgreSQL SCRAM privilege/rotation, immediate crash/restart, uncertainty fencing and backup/restore checks. Fresh [database evidence](phase13/delivery-validation/prior-helper-rerun/docs/phase8/database-validation.json) and [persistent intent evidence](phase13/delivery-validation/prior-helper-rerun/docs/phase7/persistent-database-validation.json) are retained. These private single-node test clusters are not HA or production deployment proof. The first Phase 13 regression invocation refreshed the mutable root summaries `docs/phase7/persistent-database-validation.json` and `docs/phase8/database-validation.json` before the preservation wrapper was used. Their pre-invocation bytes were not included in the Phase 13 snapshot and cannot be asserted unchanged. The new summaries are retained in `phase13/initial-database-evidence/`; subsequent passes preserve summaries and retain reruns separately. This is an archival limitation. Earlier per-phase logs and all hashed Phase 11/12 immutable artifacts remain unchanged.

The implementation preserves worker fsync ownership and queue bounds. Wire diagnostics have explicit byte/record retention limits, sanitization/exactness flags and failure propagation. Research refuses ambiguous JSON keys and malformed identities; generic fixture compatibility does not grant research eligibility. Verification scheduling honors provider cooldown, limits admission/retries and never converts missing mandatory evidence into a verified result.

[Primary telemetry](phase13/runtime/mainnet-validated/evidence.json) records WAL fsync/group sizes, receipt-to-decision times, queue/backpressure, process CPU, memory, event-loop delay and RPC errors. Actual unsigned simulation queue/execution and account-retrieval timings are retained in the buy/sell diagnostic artifacts. There is no eligible-event simulation latency population when no entry qualifies. The separate [performance summary](phase13/performance-summary.json) preserves metric populations without comparing unequal live durations or claiming source improvements. Phase 12 A/A/source controls remain immutable and are not reused as Phase 13 speedup evidence.

Unapproved financial variants, independent-provider/epoch authority, complete coverage and genuine paper lifecycle remain deployment blockers. A zero npm audit does not establish external application security approval or funded readiness. Signing, broadcasting and spending remain disabled.
''')

headline = f"Phase 13: **full current-chain paper acceptance remains unmet**. The final suite passes {tests[2]}/{tests[1]} tests plus five Python clock tests. Incoming remote zero signatures are proven and refused. The single primary supervisor measured {s['elapsedMs']/1000:.3f} seconds; continuous required coverage remains {'demonstrated' if coverage_ok else 'unmet'}. Current observed protocol variants and independent provider/epoch approval remain blocked; paper entries/exits are {entry}/{exit}. [Engineering report](docs/phase13-engineering-report.md), [evidence and commands](docs/phase13/README.md), [funded blockers](docs/remaining-funded-trading-blockers.md)."
readme = ROOT / 'README.md'
text = readme.read_text()
text = re.sub(r'\nPhase 1[23]:.*?\n', '\n', text, count=1)
text = text.replace('# Mintbot\n', '# Mintbot\n\n' + headline + '\n', 1)
readme.write_text(text)
status = ROOT / 'docs/phase-status.md'
text = status.read_text().replace('## Current Phase 12 acceptance', '## Historical Phase 12 acceptance')
text = re.sub(r'\n## Current Phase 13 acceptance.*?(?=\n## |\Z)', '', text, flags=re.S)
first, rest = text.split('\n', 1)
status.write_text(first + '\n\n## Current Phase 13 acceptance — November 15, 2026\n\n' + headline.replace('docs/', '') + '\n' + rest)
blockers = ROOT / 'docs/remaining-funded-trading-blockers.md'
text = blockers.read_text()
if text.startswith('# Phase 12'):
    text = text.replace('# Phase 12 remaining funded-trading blockers', '## Retained Phase 12 funded-trading assessment', 1)
if not text.startswith('# Phase 13'):
    blockers.write_text(f'''# Phase 13 remaining funded-trading blockers

**Funded execution and genuine current-chain paper lifecycle acceptance remain blocked.** [Current verdict](phase13-engineering-report.md).

- Pump's current executable/Global tail lacks approved financial-contract evidence; the observed reversed signed-reserve PumpSwap variant remains unvalidated and currently has only 585 lamports on its SOL side.
- Current required continuous coverage is {'demonstrated only within the measured scope' if coverage_ok else 'unmet'}; unresolved/unknown history and invalid identities remain retained. Duration success does not approve an epoch.
- Authenticated independently operated providers and defensible common-state account evidence are unavailable. Independent epoch-policy review remains required.
- Genuine eligible paper entry/exit and terminal exact P&L are {entry}/{exit}; historical public inventory and unsigned diagnostics cannot supply missing fresh positions.
- Selective WebSocket delivery must be resolved and per-venue receipt evidence reviewed: the Meteora control received 6,591 Solana-public notifications and zero PublicNode notifications despite ACKs. Newer initializer completeness, mandatory holder/authority/concentration evidence, operational recovery review and production alerting remain bounded or incomplete.
- Distributed leases/storage, isolated signer/spend authorization, settlement/uncertainty controls, independent security review, HA/PITR and separately authorized funded validation remain outside the tested single-host paper system.

Earlier phase assessments below are historical and do not satisfy current acceptance.

''' + text)
print(json.dumps({'tests': summary['tests'], 'monitoringSeconds': s['elapsedMs']/1000,
                  'paperEntries': entry, 'paperExits': exit, 'fullPhaseAcceptance': False}))
