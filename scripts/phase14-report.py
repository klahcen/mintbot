"""Evidence-derived Phase14 reports. Does not approve providers, epochs, markets or paper work."""
from pathlib import Path
import json, hashlib, datetime, re
root=Path(__file__).resolve().parents[1];out=root/'docs/phase14'
def read(name):return json.loads((out/name).read_text())
def put(name,body): (root/'docs'/name).write_text(body.strip()+'\n')
def pretty(value):return json.dumps(value,indent=2)
control=read('delivery-control.json')
rows=control['rows']
summary=[{'host':r['host'],'notifications':r['normalizedNotifications'],'invalidIdentities':r['invalidIdentities'],
 'acks':len(r['acks']),'elapsedSeconds':r['supervisor']['elapsedMs']/1000,
 'acknowledgedSeconds':r['supervisor']['acknowledgedMs']/1000,'connections':r['supervisor']['connections'],
 'incidents':r['supervisor']['incidents'],'firstReceiptAt':r.get('firstReceiptAt'),'lastReceiptAt':r.get('lastReceiptAt'),
 'finalizedSample':r.get('finalizedSample'),'wireDropped':r['wireDropped']} for r in rows]
(out/'delivery-summary.json').write_text(pretty(summary)+'\n')
old=json.loads((root/'docs/phase13/runtime/mainnet-validated/evidence.json').read_text())
proof=json.loads((root/'docs/phase13/identity-mainnet-analysis.json').read_text())
# Phase13 retained wire audit is sampled; only full-run venue counters supply notification denominators.
identity=[]
for venue,c in old['venueCounts'].items():
 identity.append({'phase':13,'venue':venue,'providerAttribution':'See each byte-exact proof; run may reconnect',
 'normalizedDelivered':c['notifications'],'invalidIdentities':c['unverifiableIdentities'],
 'invalidRate':c['unverifiableIdentities']/c['notifications'] if c['notifications'] else None})
newidentity=[{'phase':14,'host':r['host'],'venue':'meteora-dlmm','normalizedDelivered':r['normalizedNotifications'],
 'logEnvelopes':r['logEnvelopes'],'invalidIdentities':r['invalidIdentities'],'invalidRate':r['invalidNormalizedRate'],
 'wireOutcomes':{k:sum(t['outcome']==k for t in r['wire']) for k in sorted(set(t['outcome'] for t in r['wire']))},
 'wireDropped':r['wireDropped']} for r in rows]
(out/'identity-rates.json').write_text(pretty({'baseline':identity,'current':newidentity,'phase13Proofs':len(proof['byteExactZeroProofs']),
 'denominator':'Delivered normalized observations including invalid identities, not sampled wire records, distinct transactions, or total finalized chain activity',
 'unavailable':'Phase13 exact per-provider notification denominator; invalid-envelope all-shape rates outside this bounded control'})+'\n')
verdicts=[
 (1,'PARTIAL','Fresh controls reproduce 27,100 Solana public notifications versus zero PublicNode. Finalized program-log verification is blocked by version1; remote cause remains unproven.'),
 (2,'PASS','Per-venue ACK, valid delivery, freshness, counters and evidence timestamp; silent required venues block researchCoverage.'),
 (3,'PASS','Zero/invalid identities remain refused; malformed mapped envelopes retain subscription/venue provenance; original byte-exact proofs preserved.'),
 (4,'PARTIAL','Fresh supported PumpSwap two-sided diagnostics; Raydium sell succeeds, buy capacity gate blocks. Full independent market risk approval absent.'),
 (5,'PARTIAL','Four authentic finalized fixtures decode; latest Phase13 Raydium fixture reread succeeds. Legacy Meteora retained fixture passes; current historical reread unavailable; no new variant enabled.'),
 (6,'PASS','Historical gaps and quarantines unchanged; clipped sampled history never marks recovery complete.'),
 (7,'EXTERNALLY BLOCKED','No authenticated independently operated provider pair available in inspected environment.'),
 (8,'EXTERNALLY BLOCKED','Independent reviewer and explicit coverage-epoch policy authority unavailable.'),
 (9,'EXTERNALLY BLOCKED','Zero genuine fresh entries/exits. No eligible research lifecycle attempted after prerequisite stop.'),
 (10,'PASS','All 328 TypeScript tests (original 323 retained), five Python clock tests, final clean Node22 typecheck/build, Docker smoke, PostgreSQL fault/recovery and zero-advisory audit; initial startup failures retained.'),
 (11,'PASS','Live mode rejected; no signer, broadcaster or funded execution introduced.')]
put('phase14-engineering-report.md', '''# Phase 14 engineering report

**PARTIAL overall; current-chain paper acceptance remains externally blocked.** Source changes add a per-venue delivery gate to the existing supervisor/coverage path and preserve attribution for malformed signature envelopes. A busy program can no longer supply missing delivery evidence for another required venue. `verified` in `venueDelivery` means fresh valid-identity delivery only; finalized history, independent providers, risks and epoch authorization remain separate mandatory gates.

'''+ '\n'.join(['| Criterion | Verdict | Evidence / limit |','|---|---|---|']+[f'| {i} | **{s}** | {v} |' for i,s,v in verdicts])+'''

Fresh read-only work prioritizes Meteora delivery and supported native-quote PumpSwap/Raydium. No deployment pin, financial allocation whitelist, original test or dependency lock was changed. Preservation verification checks 811 earlier artifacts without changes. The external prerequisite stop prevents scope expansion into upgraded Pump support or an unauthorized research epoch.

[Selective delivery](selective-websocket-delivery.md), [providers](provider-integrity-matrix.md), [identity incident](zero-signature-incident-analysis.md), [markets](supported-market-validation.md), [creation fixtures](creation-detection-coverage.md), [coverage](coverage-and-epoch-review.md), [paper](end-to-end-paper-results.md), [operations](operational-monitoring-results.md), [security/performance](security-and-performance-validation.md), [operator contract](external-prerequisites.md), [funded blockers](remaining-funded-trading-blockers.md). Reproducible commands and machine evidence are in [Phase14](phase14/README.md).
''')
put('selective-websocket-delivery.md','''# Selective WebSocket delivery — Phase 14

The Phase13 single-venue controls received 6,591 Meteora notifications from Solana public and zero from PublicNode, despite acknowledgements. This is connection/provider-specific evidence, not proof of a remote implementation defect. Original [control](phase13/venue-controls.json) and wire evidence remain unchanged.

Fresh concurrent controls subscribe to `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` with the same supervisor, strict decoding and shared 300-second stop deadline. Requests, request IDs, ACK results, connection generations, subscription lifecycles, open/close/error/ping/pong chronology, normalized counters, receipt times and bounded wire traces are retained. ACK intervals differ with connection setup and reconnection; whole-window counters are not equal exposure estimates.

```json
'''+pretty(summary)+'''
```

[Full experiment](phase14/delivery-control.json), [command](phase14/README.md). Finalized signature lists are capped at ten per endpoint. One selected transaction per endpoint was requested for original-signature and program-invocation verification, but both calls returned RPC `-32015`: transaction version 1 exceeds the current reader limit of 0. [Exact follow-up responses](phase14/version-diagnostics.json) preserve that compatibility blocker. No finalized program-log verification succeeded in this control. They are a clipped activity sample, not all finalized events in the monitoring window. Failed/null reads are unavailable. Confirmed notifications can differ from finalized history; no fork is inferred.

The synthetic supervisor regression shows that subscription routing preserves a silent venue even while another venue receives valid traffic. Existing tests cover ACK collisions, unbound IDs and old-generation callbacks. This supports investigating endpoint/connection delivery; it does not exclude network, server-side routing or other provider behavior. Resolving remote cause needs operator server logs tied to the retained connection times and subscription IDs. A positive delivery control never proves complete delivery.
''')
put('provider-integrity-matrix.md','''# Provider integrity matrix — Phase 14

| Requirement | Solana public | PublicNode |
|---|---|---|
| Authenticated independent operator pair | Unavailable | Unavailable |
| Genesis / selected finalized transaction | Captured in fresh read-only diagnostics | Captured in fresh read-only diagnostics |
| Meteora subscription delivery | See fresh per-connection control | See fresh per-connection control |
| Complete bounded historical interval | Unproven: latest-ten sample | Unproven: latest-ten sample |
| Same snapshot / bank | Different account banks; agreement unknown | Different account banks; agreement unknown |
| Provider authorization | False | False |

[Fresh provider history](phase14/provider-history.json) records matching selected signed transaction payloads with different account context banks. This cannot approve state agreement, authentication or operator independence. `minContextSlot` is a lower bound, never an atomic snapshot guarantee. Conditional equal reported slots alone would still need a defensible bank/common-snapshot contract and operator verification. Conflicts require immutable evidence and manual independent review; no automatic release, quorum override or epoch approval was added.

The inspected process contains no RPC/provider credential variable names; no `.env` exists in the repository (only `.env.example`). This does not assert credentials are absent from every external secret store. Supply the [operator prerequisites](external-prerequisites.md). Account owners/deployments used by diagnostics remain checked by existing market constructors and unchanged pins; these checks are separate from infrastructure authority.
''')
put('zero-signature-incident-analysis.md','''# Zero-signature incident analysis — Phase 14

The original [69 byte-exact remote zero-signature proofs](phase13/identity-mainnet-analysis.json) and raw audit files remain unchanged. No valid signature fallback exists or was added. Existing admission tests establish refusal before WAL ownership, recovery-anchor promotion, finalized verification or paper admission. A malformed mapped notification now retains venue, subscription, available slot and `envelopeIssue`, while preserving the established `message-rejected` outcome and never fabricating a signature.

[Rates and denominators](phase14/identity-rates.json) use all normalized delivered observations, including invalid identities. The Phase13 run is 69/275,760 (65/268,353 Pump; 4/5,172 Raydium; 0/2,235 PumpSwap). Meteora has denominator zero, so its rate is undefined, not zero. Wire traces are sampled and cannot supply full-rate denominators. Repeated identical invalid envelopes are still observations, not distinct signed transactions.

Fresh Meteora endpoint rows include normalized counts, all message and log-envelope counts, issue counts and connection-tagged traces. These support bounded per-endpoint/venue attribution. The Phase13 run-wide denominator is not split by provider unless full per-provider counters exist. Invalid proof records expose endpoint, subscription and connection; coincidence with a reconnect is not a causal explanation. Unsupported/malformed envelopes remain diagnosed separately from normalized identity rates. No invalid payload is treated as a proven Solana fork.
''')
put('supported-market-validation.md','''# Supported market validation — Phase 14

**PARTIAL.** Fresh diagnostics use established supported PumpSwap and Raydium subjects before further upgraded-Pump engineering. [Buy captures](phase14/current-buy-simulations.json) retain deployment/account reads, native-quote mint/vault/owner relationships, decimal/token-program checks, liquidity, fee inputs, integer quotes, exact unsigned plans and serialized-policy/simulation accounting. [Sell captures](phase14/current-sell-simulations.json) retain public-inventory discovery, fresh custody reads and actual effect/fee reconciliation.

Supported PumpSwap buy and sell simulations succeed. Raydium sell succeeds; its buy diagnostic stops at `Insufficient reservation capacity`. No budget or account balance was increased to force success. Public holder addresses used in `sigVerify:false` diagnostics are never owned inventory, signer authority, paper entries or fills. Account reads are finalized current batches and cannot reconstruct historical creation-bank state.

[Pinned independent SDK wire comparison](phase14/builder-reference.json): 8/8; [captured-state quote comparison](phase14/quote-reference.json): 16/16. Wire vectors include UNIT execution accounts and validate reviewed serialization, not availability of those accounts or all current variants. Quote comparisons cover retained real Raydium/DLMM account bytes. These results must not be generalized into independent current PumpSwap market risk approval.

Fresh sampled Meteora transactions also return unsupported transaction version 1 ([exact responses](phase14/version-diagnostics.json)); no reader version limit was relaxed. Full current holder/custody/transfer-risk evidence, independent common-state verification, a qualifying fresh creation and approved current coverage are not established together. The current Pump deployment and unexplained Global tail remain rejected by unchanged pins/layouts. The reversed PumpSwap subject remains unsupported: signed reserve semantics, reversed fee denomination, two-sided wires and simulations are incomplete. [Retained financial assessment](current-protocol-compatibility.md) remains authoritative; no new variant was enabled or unexplained bytes whitelisted.
''')
put('creation-detection-coverage.md','''# Creation detection coverage — Phase 14

[Four-venue finalized fixtures](phase14/creation-fixtures.json) pass strict invocation/instruction/account verification: one each for Pump, PumpSwap, Raydium CPMM and Meteora DLMM. The newly retained Phase13 Raydium `initialize` at slot 469745467 is preserved by SHA-256, redecoded and reverified with a fresh finalized reread. Its original wire identity and quarantine remain attached; offline proof never releases the original quarantine or creates a new receipt.

[Legacy/current rereads](phase14/creation-validation.json) separately verify the Phase12 Raydium fixture. Meteora `initialize_lb_pair` verifies against genuine retained finalized/account evidence, while the current historical RPC reread is unavailable. Newer permissioned/customizable/`initialize_lb_pair2` variants remain unsupported without authentic complete finalized fixtures. No swap, bin-array initialization, liquidity adjustment or unrelated account initialization is counted as a launch.

The funnel stages remain distinct: delivered program notification → creation hint → finalized verified creation → supported current state → positive integer buy/sell quotes → complete mandatory risks and eligible strategy. Fixtures establish only their stated historical verification stage and can never become fresh eligible entries. Notification totals cannot estimate creation coverage.
''')
put('coverage-and-epoch-review.md','''# Coverage and epoch review — Phase 14

**Independent epoch approval is EXTERNALLY BLOCKED.** No self-approved bypass was added. The existing proposal remains a proposal requiring an independent reviewer with explicit policy authority. New run IDs, empty pending queues, fresh subscription ACKs and fresh valid delivery do not erase history.

All Phase13 evidence, WAL gaps, quarantines and prior manifests are unchanged ([preservation](phase14/preservation-check.json)). Baseline final gaps remain three unrecoverable and one recovered, with 752 quarantines. Phase14 transport controls do not own a research WAL and recover none of those gaps. Historical classification is retained rather than recomputed from a recent-ten history sample.

Recovery still requires completed underlying bounded work, original valid anchors, explicit interval/predecessor boundaries and durable completion evidence. Failed, clipped, partial or unavailable pages stay incomplete. The new per-venue gate adds a missing-delivery rejection to `researchCoverage`; provider consistency, journal failures, quarantine and identity-refusal coverage checks remain mandatory. Independent infrastructure is needed to verify recovery completeness and authorize a current window under [the operator contract](external-prerequisites.md).
''')
put('end-to-end-paper-results.md','''# End-to-end paper results — Phase 14

**0 genuine fresh entries; 0 exits; terminal P&L not demonstrated.** Phase14 performs transport controls and historical/current technical diagnostics. It does not start an eligible candidate research epoch because required provider and policy prerequisites are unavailable. It therefore has no new candidate-level research rejection funnel to claim complete.

| Source / attempted stage | Result | Paper disposition |
|---|---|---|
| Matched Meteora transport controls | Notifications and bounded identity/history diagnostics | No WAL candidate ownership or market decisions |
| Retained four-venue creation fixtures | Strict finalized offline verification | Historical; never fresh |
| Supported PumpSwap diagnostic | Actual unsigned buy/sell success | Public address diagnostic; excluded |
| Raydium diagnostic | Buy capacity rejection; unsigned sell success | Excluded |
| Independent provider/coverage policy | Unavailable / unapproved | Fresh eligible pipeline blocked before candidate work |

The complete Phase13 source-attributed [selected candidate outcomes](phase13/candidate-outcomes.json) remain retained and are not relabeled Phase14 outcomes. The existing supervisor, risk engine, simulation gate, durable ledger, owner fence, sticky stop and final freshness checks remain the only authorized paper route. No synthetic balance, public holding, historical inspection or simulation is used to manufacture a fresh event or fill.
''')
put('operational-monitoring-results.md','''# Operational monitoring results — Phase 14

**PARTIAL.** A fresh probe with a shared 300-second deadline and concurrent Meteora-only transport controls is retained in [delivery evidence](phase14/delivery-control.json). Actual elapsed, ACK, receipt, disconnect and incident evidence is separate for each endpoint. This is not a four-venue research-supervisor run, continuous chain coverage or a 1,800-second research run. Follow-up finalized reads are excluded from transport duration.

The independently measured 1,800-second Phase14 research run was not started: authenticated independent infrastructure and epoch policy authority are unavailable, triggering the user's external-prerequisite stop. Phase13's successful sleep-inhibited 1,800-second run remains historical and contributes zero new monitoring time. No new sleep-inhibition or host clock certification is claimed; the existing supervisor clock-discontinuity checks remain active in controls.

Exclusive research ownership, sticky emergency stop, fsynced WAL acknowledgement, quarantine versus pending accounting, authenticated dashboard and bounded retry/backpressure are unchanged and exercised by the retained suite and isolated container smoke. Controls do not acquire research ownership. Initial diagnostic imports were not sealed by a separate loaded-module source manifest; the baseline and final source manifests are retained, and this limits source-at-start operational acceptance. Final Docker source/image identity is separately captured.
''')
clean=read('clean-validation.json')
testlog=(out/('clean-tests-retest.log' if (out/'clean-tests-retest.log').exists() else 'clean-tests.log')).read_text();m=re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)',testlog,re.S)
put('security-and-performance-validation.md','''# Security and performance validation — Phase 14

[Clean isolated Node22 validation](phase14/clean-validation.json) records commands and exit codes for npm ci, full tests, backend/frontend typecheck, production build, five Python clock tests and npm audit. Exact suite counts: '''+(f'{m[2]}/{m[1]} passing; {m[3]} failed' if m else 'not yet finalized')+'''. [Focused regressions](phase14/final-focused-retest.log) cover selective delivery, ACK-only silence, zero/missing identities, stale receipts, reconnect resets and actual supervisor-to-coverage propagation. Existing provider-conflict/current-variant/paper-risk tests remain unchanged.

The first supplementary Node20 run and initial clean Node22 run failed an API startup timeout under concurrent host load; it is retained rather than hidden. An intermediate trace-outcome regression was corrected while preserving all original tests; the final focused suite passes. These failures do not establish protocol failures or performance regressions.

[Two-stage Docker build](phase14/docker-build.log) and [read-only no-network container smoke](phase14/production-container-smoke.json) capture current image identity, authenticated dashboard/read-only access and live-mode rejection. Full tests include PostgreSQL fault/recovery, fsync, crash/restart, persistent intents, SCRAM and durable journal checks. This does not prove production database HA or external-provider fault recovery.

Twelve randomized matched benchmark jobs are retained in [the performance capture](phase14/matched-performance.json), with three before/after repetitions for durable-burst-200 and sustained-stream, fixed seed, source/harness hashes, offered/completed populations and fsync guarantees. The baseline is the retained Phase13 clean install. This harness does not measure supervisor-gate overhead, and shared-host load limits interpretation. No speedup, stable latency SLO or explanation for historical regressions is claimed. Live market windows, public endpoint quotas and host load are unequal workloads; simulation or notification counts cannot serve as matched throughput benchmarks.
''')
put('external-prerequisites.md','''# External prerequisites — Phase 14 operator setup contract

**Provider authorization and current-window epoch approval remain false.** No provider credentials are configured in the inspected process; repository configuration supplies public defaults. No credentials were fabricated, guessed or searched for in unrelated private stores.

The operator must supply:

1. Two authenticated HTTPS/WSS RPC services with independently documented operators and upstream infrastructure, mainnet genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`, archive retention covering the original gap anchors, finalized versioned transactions, program logs, full accounts and sufficient documented read/subscription quotas. Provide attribution, service/retention terms and permitted evidence retention; distinct hostnames alone are insufficient.
2. Secret-managed `SOLANA_RPC_URL`, `SOLANA_SECONDARY_RPC_URL`, `SOLANA_WS_URL` and `SOLANA_SECONDARY_WS_URL` endpoints, plus an existing-shape `RESEARCH_PROVIDERS_PATH` configuration containing IDs, endpoints and independently reviewed operator attribution. Keep credentials out of evidence and reports. Configuration alone grants no provider authorization.
3. Matched per-program controls for all four registry addresses, recording actual JSON-RPC request/ACK/subscription identities, first/last receipts, pings/pongs, reconnect generations and errors. Correlate PublicNode's retained Meteora times/subscription IDs with provider server logs. Reconcile delivered signatures to bounded finalized history through explicit anchors/predecessors; retain failed/null/clipped pages as incomplete.
4. Independent signed-transaction identity and genesis comparisons, account owner/program/deployment checks and a defensible common-snapshot/bank method supported by the services. Document which state can actually be compared. `minContextSlot` or different-slot values cannot establish identical-bank agreement. Exercise conflict/quarantine and failed/partial recovery paths without approving missing evidence.
5. A named independent reviewer and explicit policy authority for the existing coverage-epoch proposal, with reviewed required venues, retained historical gap scope, immutable source/evidence hashes and review decision. No agent self-approval or retrospective deletion of old gaps.
6. After those gates pass, fresh supported creation events with complete token, custody, liquidity, holder and transfer-risk evidence, successful serialized-policy buy/sell simulations and exact accounting. Run the existing paper pipeline under exclusive ownership, approved host clock/sleep controls, sticky stop and authenticated dashboard. Then perform a stable 300-second research probe and independently timed 1,800-second run.

There is no funded execution authorization in this contract. Supply prerequisites through the operator's secret/configuration and review channels; do not paste credentials into reports. Until supplied and verified, stop broader market/epoch/paper scope and preserve zero trades.
''')
put('remaining-funded-trading-blockers.md','''# Remaining funded-trading blockers — Phase 14

Funded trading remains disabled. Phase14 grants no production readiness or spending authority.

- Authenticated independent providers, complete per-venue delivery/history evidence and defensible common-state comparison are unavailable.
- Original unrecoverable gaps, quarantines and invalid remote identities remain unresolved evidence; current-window epoch approval lacks independent policy authority.
- Current Pump deployment/financial schema and reversed PumpSwap route remain unsupported under unchanged pins.
- No current fresh event has all creation, market, holder/custody/transfer risk, strategy, freshness and serialized unsigned simulation gates satisfied together. No genuine paper entry/exit lifecycle or terminal P&L has been demonstrated.
- The new 1,800-second research run and full operational source/clock/sleep certification are incomplete. Diagnostic successes, public inventory and historical fixtures cannot substitute for them.
- Production signer isolation, explicit funded signer policy, settlement/reconciliation, production database/HA operations and independent security review remain prerequisites outside this paper-only phase. Live mode remains rejected; no signing or broadcasting path was introduced.
''')
(out/'acceptance.json').write_text(pretty({'overall':'PARTIAL / EXTERNALLY BLOCKED','criteria':[{'criterion':i,'status':s,'reason':v} for i,s,v in verdicts],
 'paperEntries':0,'paperExits':0,'providerAuthorization':False,'epochAuthorization':False,'liveTrading':False})+'\n')
