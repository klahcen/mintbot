"""Generate measured Phase8 monitoring and engineering reports from retained artifacts."""
from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1];out=root/'docs/phase8';read=lambda p:json.loads((out/p).read_text())
e=read('mainnet/evidence.json');p=read('provider-validation.json');db=read('database-soak.json');perf=read('performance-attribution-summary.json');audit=read('dependency-audit-after.json')
exhaustion=next((i for i in e.get('rpcIssues',[]) if i['stage']=='websocket' and 'reconnect budget exhausted' in i['message']),None)
exhaustion_offset=(exhaustion['at']-e['startedAt'])/1000 if exhaustion else None
unavailable_tail=(e['endedAt']-exhaustion['at'])/1000 if exhaustion else 0
rows=e['rows'];ledger=e['ledger'];metrics=e['telemetry'];c=metrics['counters'];hist=metrics['histograms'];n=len(rows);verified=sum(r.get('verifiedLaunches',0) for r in rows);reviews=ledger.get('marketReviews',[]);available=sum(bool(r.get('evidence',{}).get('state')) for r in reviews);decisions=sum('decision'in r for r in rows);verification_reasons=e.get('verificationRejectionCounts',{});reasoncounts=e['rejectionCounts'];trades=len(ledger['trades']);sims=sum(len(d.get('evidenceRows',[])) for d in e.get('simulationDiagnostics',[]));samples=e.get('samples',[])
rss=max((s['memory']['rss'] for s in samples),default=e['resources']['memory']['rss'])/1024**2
maxheap=max((s['memory']['heapUsed'] for s in samples),default=e['resources']['memory']['heapUsed'])/1024**2
lat=hist.get('research.receipt_to_paper_decision_ms');stat=lambda h:'/'.join(f"{h[k]:.3f}" for k in ['p50','p95','p99'])
testlog=(out/'after-tests.log').read_text();tests=int(re.search(r'^# tests (\d+)',testlog,re.M)[1]);passes=int(re.search(r'^# pass (\d+)',testlog,re.M)[1]);assert tests==passes;testseconds=float(re.search(r'^# duration_ms ([\d.]+)',testlog,re.M)[1])/1000
summary={'scope':'Actual bounded read-only monitoring and separate controls; no signed/submitted/funded operations','configuredObservationSeconds':e['seconds'],'totalReceiptToStopWallSeconds':(e['endedAt']-e['startedAt'])/1000,'reconnectBudgetExhausted':bool(exhaustion),'exhaustionOffsetSeconds':exhaustion_offset,'remainingProcessSecondsAfterExhaustion':unavailable_tail,'notifications':e['notifications'],'creationNotifications':e.get('creationNotifications'),'sampledCandidates':n,'skippedSampling':e.get('skippedSampling'),'verifiedCreations':verified,'paperDecisions':decisions,'marketStatesAvailable':available,'paperTrades':trades,'simulationAttempts':sims,'marketRpcCalls':c.get('rpc.calls',0),'marketRpcErrors':c.get('rpc.errors',0),'taggedRateLimits':c.get('research.rpc_rate_limits',0),'verificationReasons':verification_reasons,'paperReasonCounts':reasoncounts,'rpcIssues':len(e.get('rpcIssues',[])),'observedDisconnectGapRecords':len(e.get('gaps',[])),'captureDropped':e.get('captureDropped',0),'peakSampledRssMiB':rss,'peakSampledHeapMiB':maxheap,'receiptToPaperDecisionMs':lat,'cpuMicroseconds':e['resources']['cpuMicroseconds'],'wal':e['journal'],'tests':tests,'allOriginalTestsRetained':241,'liveTrading':False}
(out/'validation-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
s=f'''# Phase 8 mainnet monitoring report

Actual public mainnet experiment, requested **{e['seconds']} seconds (15 minutes)** of observation, source provider `{e['provider']}`. Including initialization/final drain, receipt-to-stop wall duration is {(e['endedAt']-e['startedAt'])/1000:.3f} seconds. This is a longer bounded research run, not a multi-hour production soak or complete feed coverage.

| Observed population | Count |
|---|---:|
| Notifications received | {e['notifications']:,} |
| Successful CreateV2 notifications considered (may repeat a signature) | {e.get('creationNotifications',0):,} |
| Candidates selected across the window | {n} |
| Excluded by configured sampling/duplicate/maximum bound | {e.get('skippedSampling',0):,} |
| Verified creation instructions | {verified} |
| Final paper decision callbacks | {decisions} |
| Paper reviews with parsed market state | {available} |
| Actual linked simulation attempts in candidate gate | {sims} |
| Paper trades | {trades} |
| Admission refusals | {e['refused']} |
| Recorded disconnect/reconnect gap entries | {len(e.get('gaps',[]))} |

Sampling admits at most one selected candidate per configured interval and at most {e['maxCandidates']} candidates. Excluded notifications were not all decoded or durably ingested: this is **not** proof of zero event loss, total coverage or full-feed throughput. Verification failures before opportunity creation are recorded separately from paper decisions. Reasons overlap; their counts cannot be summed into opportunity counts.

## Degraded coverage — failed extended-feed validation

**The public WebSocket exhausted its five-reconnect budget at approximately {exhaustion_offset:.1f} seconds.** It received no further notifications for the remaining {unavailable_tail:.1f} process seconds. The11 gap records represent six disconnects and five reconnects, not11 independent recovered intervals. The configured900-second process ran to completion, but it did **not** provide15minutes of connected coverage. No backfill recovery was performed, so long-duration continuous mainnet validation remains failed/incomplete.

Final source now tracks feed health separately from RPC/provider agreement, marks exhaustion failed, stops new paper work on permanent exhaustion, and prevents a later ready callback from silently clearing the terminal health state. These changes are covered deterministically; the original long run did not exercise that later guard. Do not raise retry budgets or infer recovered coverage to conceal the failure. A replacement provider/recovery experiment remains required.

## Rejections and limitations

'''
s+='| Verification issue | Selected receipts |\n|---|---:|\n'+''.join(f'| {k} | {v} |\n' for k,v in verification_reasons.items())
s+='\n| Paper decision reason | Decisions containing reason |\n|---|---:|\n'+''.join(f'| {k} | {v} |\n' for k,v in reasoncounts.items())
s+=f'''
No mandatory risk condition, token balance, account authority or strategy parameter was fabricated. The result is **{trades} paper trades**, with positive entry/exit behavior unproven if no eligible candidate appeared. Initial instruction/state checks can reject unsupported current variants before any quote exists; those rejections do not imply verified prices or simulations.

## Timings and resources

'''
if lat:s+=f"Local monotonic receipt → completed paper-decision callback: n={lat['count']}, p50/p95/p99 **{stat(lat)} ms**. This population includes rejections, not eligible fills.\n\n"
s+='| Measured stage | Count | p50/p95/p99 ms |\n|---|---:|---|\n'
for key in ['market.transaction_verification_ms','market.state_retrieval_ms','market.quote_computation_ms','market.risk_evaluation_ms','market.strategy_decision_ms','ingest.enrichment.queue_wait_ms','market.queue_backlog_age_ms']:
 if key in hist:s+=f"| {key} | {hist[key]['count']} | {stat(hist[key])} |\n"
s+=f'''
Missing simulation or paper-fill latency is **unmeasured**, never zero. Chain block time, confirmed receipt slot, finalized transaction/account context, wall age and process-local receipt clocks stay distinct. Peak sampled RSS/heap: **{rss:.1f}/{maxheap:.1f} MiB**; CPU user/system: **{e['resources']['cpuMicroseconds']['user']/1e6:.3f}/{e['resources']['cpuMicroseconds']['system']/1e6:.3f} seconds**. Five-second samples retain memory, CPU, event-loop p50/p95/p99/max, main-thread GC and WAL status. Sampling can miss peaks; main-thread GC is not complete worker GC attribution.

The market transport counted {c.get('rpc.calls',0)} calls / {c.get('rpc.errors',0)} errors. Tagged rate-limit counter: {c.get('research.rpc_rate_limits',0)}. Separate issues: {len(e.get('rpcIssues',[]))}. These counters are not an exhaustive count of all underlying verification/holder RPC attempts: some legacy read paths normalize errors, and successful verifier requests are also retained in raw capture records. A zero tagged rate-limit count cannot certify zero provider throttling. Raw request/result provenance and issue categories are preserved.

Final WAL pending/unacknowledged: **{e['journal']['pending']}/{e['journal'].get('unacknowledged',0)}**, disk bytes **{e['journal']['walBytes']}**, fsync groups **{e['journal'].get('fsyncBatches',0)}**. Compaction telemetry is retained if emitted; no forced production-sized compaction or exhaustive historical recovery is inferred from this small sampled WAL. {e.get('captureDropped',0)} capture records exceeded the explicit retention bounds. Disconnect gap entries describe observations, not guaranteed historical recovery.

## Source and evidence scope

[Raw run](mainnet/evidence.json), [ledger](mainnet/ledger.json), [WAL](mainnet/ingestion.wal), [transcript](mainnet.log), [summary](validation-summary.json). The long experiment used the preserved initial Phase8 harness in `mainnet-harness-executed.ts.txt`, retaining Phase7 mandatory paper gating. Later source adds optional independent-provider rejection, complete-strategy digest and bounded diagnostics, mainnet genesis validation, terminal feed-health handling and corrected dashboard metadata. Short integration/release-check directories preserve those later observations separately. No current-chain eligible entry exercised the added provider gate; its unknown/conflict rejection is tested deterministically.

Two producer-only metadata errors were corrected: a rejection callback does not verify market state; a confirmed notification head is not a finalized slot. The stopped Research snapshot is rebuilt from durable evidence, old market banks become stale, and explicit finalized provider observations are separate. The original at-stop projection is retained as superseded metadata; raw decisions/account bytes are unchanged. No clock is refreshed into executable evidence.

A separate authenticated PostgreSQL heartbeat overlaps this monitoring window for five minutes: {db['successfulSamples']} successful checks, {db['failedSamples']} failures, p50/p95/p99 {stat(db['latencyMs'])} ms. It is not a database connection attached to the live candidate pipeline and not HA evidence. Node profiles/benchmarks and normal development activity also overlap parts of the run, so resource/latency observations are under documented concurrent research load.

Reproduction uses the explicit `phase8-mainnet.ts --run --seconds 900 --max-candidates 60 --output NEW_DIRECTORY`; defaults are read-only. Public providers and current program variants can change. Multi-hour soak, fresh eligible entry/exit, independently verified provider infrastructure and production recovery remain open.
'''
(out/'mainnet-monitoring-report.md').write_text(s)
(out/'end-to-end-paper-validation.md').write_text(f'''# End-to-end real-chain paper validation

Phase8 connects the existing opt-in simulation-gated paper wrapper to an explicitly bounded live research monitor. It captures actual Pump notifications, preserves identity/source/receipt clocks, verifies finalized original creation, reads pinned deployments/current accounts, computes integer buy/sell quotes where supported, preserves custody/authority/concentration/liquidity checks, constructs unsigned transactions and requires real successful simulations/exact effects before original strategy/paper review. No wallet, token inventory or safety signal is synthesized.

The long run observed {e['notifications']:,} notifications, selected {n} candidates, verified {verified} creations and recorded {decisions} paper decision callbacks; {trades} paper trades and {sims} linked simulation attempts occurred. Verification failures are separate pre-opportunity rejections. See [monitoring report](mainnet-monitoring-report.md) and raw reason counts. **A genuine positive launch→simulations→paper-entry→exit trace was not demonstrated.** Recorded rejected behavior is real; it must not be represented as a successful fill.

Existing four-protocol actual buy/sell captures remain regression inputs with their original clocks and identity. The expanded suite retains checks of zero signatures, message digests, instruction/metas, exact balances/fees, Token2022 restrictions, changed reserves/decimals, stale evidence and unavailable routes. Historical fixtures are never promoted to current quotes.

## Integration corrections and controls

The gate retains mandatory risk before expensive simulation, hashes the full strategy configuration, bounds diagnostics at100, rechecks stop state and delegates final risk/freshness/strategy/accounting to the original paper engine. Phase8's configured provider guard rejects unknown/conflicting agreement and requires comparison of the exact quote bank. Operator strings/configuration are not cryptographic identity. Default public-provider independence is unknown, so no positive entry can rely on it. Deterministic tests verify no construction RPC or paper trade occurs on unknown/failed agreement.

The market transport keeps its existing sanitized error message and adds numeric HTTP/RPC diagnostics for research collection. The Research producer derives parsed market status from durable state, marks stale market evidence, and does not mislabel confirmed head slots as finalized. Projection metadata is observational, not a source of risk assertions.

Fresh exit pricing is polled every five seconds through existing `MarketService.poll`, retaining its fresh-quote minimum-output/fee/stop/failure protections. There were no positions in this run, so actual current-chain paper exit behavior remains unobserved. Exit prices are account-state paper estimates; Phase8 does not claim a new simulation-based exit implementation or funded settlement. Existing deterministic exit tests remain intact.

## Durability and scope

Paper review mutations use the existing fsynced Store. Ingestion uses worker-owned WAL acknowledgements; neither authorizes signing. Verification issues before a verified launch are in raw evidence/WAL lifecycle, separate from paper opportunities. Final evidence JSON and sampled status files are diagnostic exports rather than a replacement financial ledger. The live monitor has no execution-intent database pool attached; its research intents shown in the dashboard are explicitly separate restricted-role fault-test records.

The retained long run predates the final metadata/provider-guard refinements; its exact harness is kept. Shorter integration/release checks preserve the final-source context, while tests cover added fail-closed behavior. No eligible mainnet candidate exercised the positive simulation branch. Remaining acceptance gaps include positive fresh entry/exit, multi-hour soak, independent provider validation, broader supported variants and funded operational/security readiness.
''')
report=f'''# Phase 8 engineering report

Prepared2026-11-11; retained capture timestamps are2026-11-10 UTC as recorded. **{tests} tests pass**, preserving all241 originals; backend/frontend typecheck, production build and isolated current-artifact container smoke pass. Actual mainnet monitoring ran for a configured15minutes, with separate authenticated database fault/heartbeat and provider diagnostics. **No transaction was signed, broadcast or funded; live mode remains disabled.**

Production readiness remains **blocked**. No qualifying current-chain paper entry or exit was demonstrated; three high dependency findings remain, provider infrastructure agreement remains unknown and multi-hour/HA/distributed recovery validation remains incomplete. No benchmark rate difference is claimed as an optimization.

## Audit and source changes

Phase7 supplied four pinned unsigned builders and actual buy/sell captures, serialized policy, paper risk gates, separate fenced SQL intents and241 tests. Gaps included short monitoring, no eligible paper entry, partial dependency/provider/operational validation and a dashboard without research evidence. The initial producer also inferred market verification from a callback and mislabeled confirmed notification head as finalized; those metadata errors are corrected without changing risk or raw decisions.

The existing ingestion/WAL/Store/engine/model modules, strategy configuration, original tests, dashboards outside the Research tab and startup live-mode rejection are preserved. Narrow changes add numeric sanitized market RPC diagnostics, a configured provider guard/strategy digest/bounded paper diagnostics, the read-only research endpoint and frontend view, dependency override and separate tools/tests. Previous source/evidence is archived and hashed. Legacy test outputs that refresh Phase7 are retained under Phase8 and original bytes restored.

## Measured mainnet outcome

| Observation | Actual value |
|---|---:|
| Configured observation window |900seconds |
| Notifications |{e['notifications']:,} |
| Sampled candidates |{n} |
| Verified creations |{verified} |
| Paper decision callbacks |{decisions} |
| Parsed market reviews |{available} |
| Candidate buy/sell simulation attempts |{sims} |
| Paper trades |{trades} |

**The WebSocket exhausted its reconnect budget at {exhaustion_offset:.1f}seconds, followed by {unavailable_tail:.1f}seconds without further receipts. The15-minute process was not15minutes of connected coverage; no gap recovery was performed. Extended continuous-feed validation failed.** Final source marks exhaustion failed and stops new paper work, with deterministic tests; this guard was added after the long run.

The monitor samples candidates across the window; this is not complete feed coverage. Rejections and unsupported/unknown evidence remain explicit. Local receipt→paper-decision timing includes rejected candidates; chain time and RPC latency are separate. Full p50/p95/p99, CPU/memory/event-loop/queue/WAL, error categories, scope and current-source limits are in [mainnet monitoring](phase8/mainnet-monitoring-report.md). [End-to-end validation](phase8/end-to-end-paper-validation.md) explicitly records the missing positive entry/exit trace.

Fresh position quotes are polled through the existing paper exit rules; no position existed to validate an actual exit. Four historical actual buy/sell protocol captures continue to pass serialization/economic regression checks; they are not fresh market opportunities. No artificial balances, risk assertions, paper fills or relaxed mandatory rules were added.

## Security, providers and database

The narrowly assessed Jayson browser-client override removes the three moderate findings; web3/SPL versions remain. The remaining **three high paths** represent one unpatched bigint-buffer native advisory and block funded release. Actual localHTTP compatibility, Token2022/account/decoder/transaction and regression tests pass. [Dependency remediation](phase8/dependency-remediation.md) documents the deliberate major override's limited browser API compatibility and unresolved release impact; no incompatible SPL downgrade or hidden ignore was used.

Two public RPC endpoints returned correct mainnet genesis and nearby finalized slots, but different account banks and insufficient attribution of independent infrastructure. The result is **unknown / ineligible**, not independent agreement. The new bounded comparison/fallback/quarantine/manual-resolution layer never makes a failed or unknown comparison authorization. Process-local quarantine history and authenticated multi-instance coordination remain limits. Actual status agreement is not claimed from mocked tests. See [provider validation](phase8/multi-provider-validation.md).

A retained private PostgreSQL16 deployment now uses peer administration and separate SCRAM migration/runtime logins, bounded pools1/2/1, restricted grants, durability, actual secret rotation/old-secret rejection, fenced immediate-crash recovery, duplicate prevention and exact backup restore. Five-minute SELECT heartbeat: **{db['successfulSamples']} successes / {db['failedSamples']} failures**, p50/p95/p99 **{stat(db['latencyMs'])} ms**. These are same-host health queries, not transaction/HA latency. [Database readiness](phase8/production-database-readiness.md) distinguishes tested local behavior from proposed backup/retention/alert automation and unimplemented production service isolation.

[Signer readiness](phase8/signer-security-readiness.md) reviews custody, authorization, exact message/spending, replay/stop, audit and incidents as **design only**. No signer or funded interface was implemented.

## Dashboard and performance

The existing dashboard gains an authenticated, read-only Research tab: observed identities, verification/market status, rejections, simulations, separate research paper P&L, provider/WAL/backfill, explicitly sourced research intent rows, latency and readiness. Missing/stale evidence remains explicit. The bounded local projection strips unrecognized fields and endpoint credentials; no HTTP path selects files or enables live controls. Tests cover authorization/origin/no-store/GET-only, bounds, SSR escaping and mode separation. Container smoke confirms the built research API and disabled live mode. Browser screenshot/interactive validation is unverified. See [dashboard details](phase8/dashboard-research.md).

Eighteen randomized A/A jobs use identical ingestion/WAL implementation hashes and current shared dependencies, with separate six-job scheduler/JSON/V8 profiling. Observed medians vary despite identical source; no speedup is claimed. Per-thread runqueue/runtime, worker fsync/ack, JSON/GC and event-loop costs are separated with observer limits. Historical regressions remain incompletely attributed. [Performance investigation](phase8/performance-investigation.md) retains all measurements, drafts, source/profile provenance and remaining remedies.

## Release evidence and remaining work

Full suite: **{passes}/{tests} pass**, no failed/skipped, {testseconds:.3f}s. Original241 tests remain, prior reports preserved. Typecheck/build/container smoke and PostgreSQL fault tests pass. Container validation uses current artifacts in existing Node22 with networkdisabled/read-only mounts/private state; it is not a full production image/Compose/storage rollout. Security audit still fails on the three high findings.

All requested report categories and reproduction commands are linked from [Phase8 index](phase8/README.md). [Remaining funded blockers](phase8/remaining-funded-trading-blockers.md) identify positive real entry/exit, high-advisory remediation, independent providers, multi-hour operational coverage, production DB/auth/backup/alerts/HA, distributed stop and independently authorized signer/settlement. These incomplete requirements prevent a funded-release proposal.
'''
(root/'docs/phase8-engineering-report.md').write_text(report)
print(json.dumps({'tests':tests,'passed':passes,'notifications':e['notifications'],'candidates':n,'verified':verified,'decisions':decisions,'trades':trades,'sims':sims,'peakRssMiB':rss}))

for doc in [root/'docs/phase8-engineering-report.md',out/'mainnet-monitoring-report.md',out/'end-to-end-paper-validation.md']:
 text=doc.read_text().replace('Phase8','Phase 8').replace('Phase7','Phase 7').replace('all241','all 241').replace('Prepared2026','Prepared 2026').replace('are2026','are 2026')
 text=re.sub(r'(\d)(minutes|minute|seconds|second|notifications|receipts|creations|tests|UTC)\b',r'\1 \2',text)
 doc.write_text(text)
