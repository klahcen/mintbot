"""Render Phase10 claims from retained evidence; missing or interrupted runs never pass."""
from pathlib import Path
import json, re, statistics, datetime

ROOT=Path('docs'); OUT=ROOT/'phase10'; RUN=OUT/'runtime/mainnet-validated'
def read(path, default=None):
    p=OUT/path
    return json.loads(p.read_text()) if p.exists() else default
def table(headers, rows):
    cell=lambda x:str(x).replace('|','\\|').replace('\n',' ')
    return '| '+' | '.join(headers)+' |\n|'+'|'.join(['---']*len(headers))+'|\n'+'\n'.join('| '+' | '.join(cell(x) for x in row)+' |' for row in rows)
def write(name, text): (ROOT/name).write_text(text.strip()+'\n')
def link(path): return f'[evidence](phase10/{path})'
def fmt(x): return f'{x:,.3f}' if isinstance(x,(int,float)) else str(x)
final=read('runtime/mainnet-validated/evidence.json'); progress=read('runtime/mainnet-validated/run-progress.json',{})
e=final or progress; s=e.get('supervisor',{}); j=e.get('journal',{}); fatal=e.get('pipeline',{}).get('fatal')
ledger=e.get('ledger') or read('runtime/mainnet-validated/ledger.json',{}); ledger=ledger.get('state',ledger)
reviews=ledger.get('marketReviews',[]); trades=ledger.get('trades',[]); rows=e.get('rows',[])
parsed=[r for r in reviews if r.get('evidence',{}).get('state')]
paired=[r for r in reviews if r.get('evidence',{}).get('buy') and r.get('evidence',{}).get('sell')]
manifest=read('runtime/mainnet-validated/runtime-manifest.json',{})
elapsed=s.get('elapsedMs',0); duration_met=bool(final) and elapsed>=7200000 and abs(s.get('clockDiscontinuityMs',0))<=5000
coverage_complete=duration_met and not fatal and not j.get('quarantined') and all(g['status']=='recovered' for g in j.get('gaps',[]))
status=('Finalized bounded experiment' if final else 'INTERIM: final evidence unavailable')
if fatal or s.get('state')=='terminal': status='Failed/terminal bounded experiment; evidence retained'
time=datetime.datetime.now(datetime.timezone.utc).isoformat()
tests=(OUT/'complete-validation/after-tests.log').read_text() if (OUT/'complete-validation/after-tests.log').exists() else ''
matched=re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)',tests,re.S)
test_text=f'{matched[1]} tests, {matched[2]} passed, {matched[3]} failed' if matched else 'Final test population pending'
acceptance=table(['Acceptance item','Disposition'],[
 ['Original and new regression suite',test_text],
 ['Final supervisor exercised in intended explicit deployment path','Delivered and exercised; legacy default selection preserved'],
 ['Current Pump compatibility','UNMET: deployment/global blocked pending complete reviewed proof'],
 ['Unverified variants fail closed','Enforced; no new variant enabled'],
 ['Continuous event coverage','UNMET: unresolved gap/quarantine; no independent completeness proof'],
 ['Quarantine ownership/accounting','Retained; historical copy reviewed, current stopped WAL reconciled separately'],
 ['Authenticated independent provider agreement','UNMET: infrastructure/operator attribution unavailable'],
 ['Genuine fresh paper entry and exit','UNMET: zero qualifying fills; no artificial inventory or freshness'],
 ['7,200-second monotonic process target','MET' if duration_met else 'PENDING/UNMET; final duration evidence required'],
 ['Continuous-coverage monitoring acceptance','UNMET regardless of process duration'],
 ['Signing, broadcast or spending','Disabled; no funded actions'],
 ['Performance attribution','UNRESOLVED: retained negative signals and experimental limitations disclosed'],
])
pump=read('pump-deployment/evidence.json',{}); binary=next((o for o in pump.get('observations',[]) if o.get('programDataSha256')), {})
global_capture=read('current-pump-global.json',{}); quarantine=read('phase9-reconciliation.json',{})
q_rpc=read('quarantine-finalized-rpc.json',{}); review_copy=read('quarantine-review-results.json',{})
provider=read('provider-validation.json',{}); methods=read('provider-method-evidence.json',{})
audit=read('final-validation/dependency-audit.json',{}); audit_count=audit.get('metadata',{}).get('vulnerabilities',{}).get('total','unavailable')
builder=read('builder-reference.json',{}); quote=read('quote-reference.json',{})
variant=read('protocol-variant-review.json',{}); integration=read('integration-difference.json',{})
verified=sum(r.get('verifiedLaunches',0) for r in rows) if final else e.get('sample',{}).get('verifiedCreations',0)
summary=table(['Observation','Measured result'],[
    ['Run',status],['Requested monotonic monitoring seconds',7200],['Recorded supervisor seconds',fmt(elapsed/1000)],
    ['Process wall seconds',fmt((e.get('endedAt',e.get('updatedAt',0))-e.get('startedAt',0))/1000)],
    ['Transport-open seconds',fmt(s.get('connectedMs',0)/1000)],['Fully acknowledged subscription seconds',fmt(s.get('acknowledgedMs',0)/1000)],
    ['Transport-disconnected seconds',fmt(s.get('disconnectedMs',0)/1000)],['Wall/monotonic discrepancy ms',fmt(s.get('clockDiscontinuityMs','unavailable'))],
    ['Connections / incidents',f"{s.get('connections',0)} / {s.get('incidents',0)}"],['Delivered notifications',e.get('notifications',0)],
    ['Verified creations',verified],['Market reviews / parsed states / paired quotes',f'{len(reviews)} / {len(parsed)} / {len(paired)}'],
    ['Paper entries / exits',f"{sum(t.get('side')=='buy' for t in trades)} / {sum(t.get('side')=='sell' for t in trades)}"],
    ['Admission refusals',e.get('refused',0)],['Active pending / quarantined',f"{j.get('activePending','unavailable')} / {j.get('quarantined','unavailable')}"],
    ['Oldest active work ms',j.get('oldestActiveAgeMs','unavailable')],['Oldest pending ms including quarantine',j.get('oldestPendingAgeMs','unavailable')],
    ['Writer / pipeline failure',f"{j.get('writerFailure')} / {fatal}"],['Two-hour monotonic target met',duration_met],['Provider-reported continuous coverage established',coverage_complete],
    ['Independently operated provider agreement','UNMET'],['Live trading',False],
])

write('phase10-engineering-report.md',f'''# Phase 10 engineering report

Generated {time}. **Engineering changes are delivered; full protocol/coverage/paper acceptance remains incomplete.** No signer, broadcaster, live configuration or funded submission was introduced.

The audit began with the November 14 Pump mismatch, interrupted Phase9 run and unresolved WAL. Original source, all prior root documents and 759 Phase9 artifact hashes were captured before edits under [Phase10](phase10/README.md). The original 288 tests remain; validation records **{test_text}**. Backend/frontend typecheck, production build, uncached Node22 clean-install Docker build and authenticated production-image/live-rejection smoke are retained. Audit findings: **{audit_count}**. Original safety, quotes, integer accounting and dashboard contracts remain.

The operational entrypoint `npm run research:monitor -- --run` and explicit `compose.research.yaml` overlay reuse the existing research pipeline. The default HTTP server still selects the legacy monitoring service; no silent supervisor switch occurred. The measured job runs compiled Node22 code inside the restricted container and seals its loaded module hashes before import. [Integration differences](phase10/integration-difference.md) distinguish the Phase9 source-at-start, final Phase9 source, final Phase10 runtime and deployment settings.

Fault testing found and corrected stale readiness during retry backoff, and an overdue receipt racing a delayed watchdog. Refusal audits now retain the precise pipeline reason plus conflicting fingerprints. Durable quarantine failures retain stage and bounded redacted cause. Reviewed retries reopen coverage before releasing quarantine; original identity/time/attempts remain and no review marks a gap recovered. Fully acknowledged duration is measured separately from transport-open duration.

{summary}

The Pump binary was captured at deployment slot {binary.get('observedDeploymentSlot','unavailable')}; its reviewed slot remains 458921440. The current Global is {global_capture.get('actualBytes','unavailable')} bytes versus reviewed sizes 1045/1088. Available official schemas and SDK outputs do not establish source-to-binary correspondence or the complete changed financial contract. Pump stays blocked; no new variant/pin was enabled. Eight independent SDK instruction vectors and sixteen quote vectors match retained fixtures, not the new binary.

All 40 historical quarantines reproduce: 35 truncated-log and five incomplete-invocation-stack failures. The 223 refused/conflicting admissions split into three capacity refusals and 220 fingerprint conflicts, with two duplicates counted separately. The original WAL remains unchanged; 40 retain reviews were demonstrated on a forensic copy with all 40 ownership records and the unrecoverable gap preserved. Missing historical provenance is not invented.

Two earlier container calibrations are retained separately and contribute no time to the validated window. This run's source snapshot includes the readiness and retry-gap fixes from launch; later offline reports/tools are outside its loaded module graph. A running process or completed duration does not establish continuous chain coverage.

{acceptance}

Required findings: [Pump deployment](pump-deployment-compatibility.md), [variant coverage](protocol-variant-coverage.md), [supervisor validation](websocket-supervisor-validation.md), [gap/quarantine reconciliation](gap-and-quarantine-reconciliation.md), [providers](independent-provider-validation.md), [paper results](end-to-end-paper-results.md), [long monitoring](long-duration-monitoring.md), [performance](performance-root-cause.md), [security](security-validation.md), [funded blockers](remaining-funded-trading-blockers.md).
''')

write('pump-deployment-compatibility.md',f'''# Current Pump deployment compatibility

**Current Pump financial execution is blocked. The deployment pin was not changed.** Reviewed slot: 458921440. Captured slot: {binary.get('observedDeploymentSlot','unavailable')}; ProgramData address: B5MvUwXdiW1NMM6QFFD3ssPKBujD4zMohncbM73Z2BQu.

| Captured object | Bytes | SHA-256 |
|---|---|---|
| Full ProgramData including loader header/allocation | {binary.get('programDataBytes','unavailable')} | {binary.get('programDataSha256','unavailable')} |
| Allocated code payload after 45-byte loader header | {binary.get('allocatedPayloadBytes','unavailable')} | {binary.get('allocatedPayloadSha256','unavailable')} |
| ELF extent referenced by headers/segments/sections | {binary.get('elfReferencedBytes','unavailable')} | {binary.get('elfReferencedSha256','unavailable')} |

Trailing allocation bytes all zero: {binary.get('trailingBytesAllZero','unavailable')}. ELF machine/flags: {binary.get('elfMachine','unavailable')} / {binary.get('elfFlags','unavailable')}; these numeric fields are not interpreted as a verified program/source release. [Full request, finalized bank, loader ownership, Program pointer, header bytes and source revisions](phase10/pump-deployment/evidence.json) and the two binary files permit exact rehashing. Captures are bounded to two providers and 20 MiB per response. The byte range called ELF extent is not a reproducible-build or semantic-equivalence claim.

The Program account points to ProgramData under loader-v3; loader metadata and code are separate. [Solana's loader documentation](https://solana.com/docs/core/programs/program-deployment) explains that structure. The inspected official [Pump docs/IDL revision](https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22) is captured locally with URLs/hashes. It documents quote assets, depth, holder rewards and retained-fee/sweep mechanics. Those published descriptions are not a verified build linked to this ELF hash.

Defensibly established: provider-reported finalized loader identity, ProgramData pointer, deployment slot and exact captured bytes. **Unknown:** source correspondence, all changed initialization/fee/supply/custody behavior, every new instruction's wire/economic contract, and positive compatible current buy/sell simulations. The unchanged `MarketRpc.deployment` rejects the real upgraded header fixture. The 1096-byte Global is separately rejected. No larger size, schema prefix, apparent reserve balance, SDK match or public simulation alone enables the deployment.
''')

variant_rows=[['Mayhem supply','Four retained Phase8 cases: mint 2e15 atoms versus curve total 1e15; creator/decimals match','Supply-model incompatibility; neither malice nor safety established'],['Non-native quote / depth','Two actual retained non-native quote examples; official quote-chain/depth schema captured','Quote custody, multihop sell route, fee mechanics and both simulation sides unverified'],['Current Global','Finalized 1096-byte capture versus reviewed 1045/1088','Rejected; no permissive prefix/padding assumption'],['Creator / fee semantics','One original current-creator mismatch; official configurable fee/reward/sweep fields','Identity changes and fee custody remain mandatory checks'],['Unsupported creation instructions','All 18 original verification failures replay exactly from retained finalized transactions','No event-tail truncation or layout guessing'],['New deployment','Full ProgramData and ELF hashes captured','No verified source/build correspondence; blocked']]
write('protocol-variant-coverage.md',f'''# Protocol variant coverage

No new variant is enabled.

{table(['Investigated path','Evidence','Disposition'],variant_rows)}

[Per-case replay and exact official instruction/account/argument schemas](phase10/protocol-variant-review.json), [current Global bytes](phase10/current-pump-global.json), [binary/source provenance](phase10/pump-deployment/evidence.json). All {len(variant.get('cases',[]))} original verification failures have their original signature, slot/time and transaction hash; no historical receipt is made fresh.

Retained narrow PumpSwap, Raydium CPMM and Meteora DLMM implementations remain regression-tested. Pump's reviewed legacy code/fixtures remain available but the current deployment/global are rejected. Independent SDK results match {len(builder.get('rows',[]))} buy/sell instruction vectors and {len(quote.get('rows',[]))} arithmetic vectors from immutable recorded accounts. [Wire vectors](phase10/builder-reference.json), [quote vectors](phase10/quote-reference.json), [pinned reference package locks](phase10/reference-sdk-integrity.json). Reference dependency installation used `--ignore-scripts`; a pure-JS bigint fallback warning belongs to those isolated reference packages, not the production codec.

Required before a new variant: authoritative source/schema tied defensibly to its deployment, finalized creation/state, all token/custody/supply relationships, integer two-sided quotes, independent arithmetic, exact unsigned wire vectors, supported real buy/sell simulations, and risk/failure regressions. No concentration, liquidity, authority, transfer, identity, expiry or sell-route condition was relaxed.
''')

write('websocket-supervisor-validation.md',f'''# Operational supervisor validation

The validated container runs `dist/scripts/phase10-mainnet.js` → the existing research pipeline → `MonitorSupervisor`, on {manifest.get('node','unavailable')}. [Loaded module hashes and copied compiled code](phase10/runtime/mainnet-validated/runtime-manifest.json), [exact container launch](phase10/runtime-validated-launch.json), [integration audit](phase10/integration-difference.json).

The explicit Compose overlay creates a finite research sidecar and connects its read-only status to the existing Research tab. Default `compose.yaml` and server monitor selection remain unchanged. The overlay uses `RESEARCH_RUN_NAME` for a fresh retained directory, drops capabilities, has a read-only root, uses init, and never automatically restarts. Existing output directories are rejected before opening a WAL. Stop preserves pending/quarantined work and evidence; a new bounded experiment has a distinct scope and does not heal the old interval.

Subscription IDs must be unique per acknowledged request; repeated identical ACKs are idempotent. ACK timeout is ten seconds. The underlying 15-second ping/pong heartbeat and bounded payload/handshake remain. Receipt staleness is thirty seconds. A transport fault clears readiness before its callback/backoff; an overdue receipt arriving ahead of the watchdog triggers a gap rather than resetting freshness. Stable receipts reset only incident attempts. Three failed attempts cause cooldown/rotation; global connection/incident/time budgets remain finite.

WAL admission is bounded to 1024 items / 4 MiB and eight fsync-aware admission jobs. Saturation pauses/fences transport and records a durable gap. Failed callbacks retain bounded redacted stage/cause. Terminal exhaustion, observer failure, WAL failure or wall/monotonic drift above five seconds stops the controller, drains and exports. Stop and start cannot reset a finished supervisor's budgets. Fully acknowledged milliseconds exclude pre-ACK socket time.

[Actual persisted failure-stage checkpoint](phase10/runtime-checkpoint-proof.json), [compiled CLI consent/live/reuse guards](phase10/research-cli-guards.json), [live sidecar dashboard/API smoke](phase10/dashboard-sidecar-smoke.json), [fault/review tests](phase10/readiness-stage-tests.log), [all original/new tests](phase10/complete-validation/after-tests.log), [Compose expansion](phase10/compose-validation.json). Docker research health requires recent receipts and no durability failure, quarantine or unresolved gap. A healthy API server or open socket is not independent chain coverage or paper eligibility.

{summary}
''')

old_counts=quarantine.get('admission',{}); qcounts={}
for r in quarantine.get('quarantined',[]): qcounts[r['decode'].get('message','no reproduced decoder failure')]=qcounts.get(r['decode'].get('message','no reproduced decoder failure'),0)+1
current_reconciliation=read('runtime-reconciliation.json',{})
current_failure_counts={}
for r in current_reconciliation.get('quarantined',[]):
    failure=r.get('lastFailure',{})
    key=f"{failure.get('stage','unknown')}: {failure.get('message','historical cause unavailable')}"
    current_failure_counts[key]=current_failure_counts.get(key,0)+1
rpc_counts={}
for r in q_rpc.get('rows',[]):rpc_counts[r.get('issue',r.get('decodeStatus','unavailable'))]=rpc_counts.get(r.get('issue',r.get('decodeStatus','unavailable')),0)+1
write('gap-and-quarantine-reconciliation.md',f'''# Gap and quarantine reconciliation

All 7,023 checksummed frames of the original completed WAL were replayed into memory without opening its writer lock.

{table(['Exact reproduced decoder failure','Count'],sorted(qcounts.items()))}

The original failure stage was not retained by Phase9; replay demonstrates current deterministic rejection of those exact bytes, not unseen historical callback context. Original decoder/module hashes are recorded. Unknown fields/layouts, incomplete invocation attribution and truncation are not automatically token-risk failures. New durable failure records include stage, timestamp, error name and bounded URL-redacted cause.

Admission accounting: {old_counts.get('total')} total = {old_counts.get('capacityRefusals')} capacity refusals + {old_counts.get('stableIdentityConflicts')} fingerprint conflicts. {old_counts.get('knownDuplicatesNotCountedAsRefusals')} known duplicates are separate. Full individual refusal payloads were not retained in Phase9, so fork versus provider inconsistency/truncation cannot be assigned to all 220 cases. New bounded refusal audit files retain original event/time, actual pipeline reason and retained/observed fingerprints, with explicit rotation metadata.

Finalized RPC rereads of the 40 original signatures:

{table(['Observed outcome','Count'],sorted(rpc_counts.items()))}

A null transaction is unavailable provider evidence, not proof that no chain transaction existed. HTTP 429 is a recorded rate limit, not a verified bad token. These bounded reads do not replace original WAL payloads or timestamps.

[WAL reconstruction and review plan](phase10/phase9-reconciliation.json), [bounded RPC captures](phase10/quarantine-finalized-rpc.json), [fsynced review on forensic copy](phase10/quarantine-review-results.json). All {len(review_copy.get('results',[]))} reviews retain ownership; pending/quarantined count remains 40 and the original gap remains unrecoverable. The original Phase9 WAL is unchanged. The forensic copy is separate and is not the production writer.

`phase10-quarantine-review.ts` requires an explicit plan, expected fingerprint and exclusive offline writer. Reviews are fsynced/checkpointed. Retain/retry never marks completion, alters the original observation/time, resets attempts, or marks coverage recovered. Retry opens a gap before clearing quarantine; at most three reviews and ten lifetime attempts are permitted. A retry is not freshness, independent-provider agreement or a trade authorization. Old readers must not be used to write reviewed WALs with the new record kind.

The stopped current WAL has {current_reconciliation.get('frames','pending')} checksummed frames and {current_reconciliation.get('incompleteTailBytes','pending')} incomplete tail bytes. Its {j.get('quarantined','pending')} pending quarantines retain their actual failure metadata and original observations.

{table(['Current durable failure stage/cause','Count'],sorted(current_failure_counts.items()))}

Current refusal reasons: {e.get('refusalCounts',{})}. Full stopped ownership reconstruction: [runtime-reconciliation.json](phase10/runtime-reconciliation.json). These quarantines are separate from the {len(rows)} selected candidate receipts and are not additional invented paper rejections. No current pending ownership was removed during the read-only diagnosis.

Current run gaps (provider-reported only):

```json
{json.dumps(j.get('gaps',[]),indent=2)}
```

Large clipped/pagination-limited intervals stay partial/unrecoverable. A persisted cursor is an audit checkpoint; restart rescans and deduplicates, not proof that missing pages were covered. Old pending age includes quarantine; `activePending` / `oldestActiveAgeMs` are separate. Admission anchors are durable observations and may include pending work; they are not necessarily completed strategy callbacks.
''')

write('independent-provider-validation.md',f'''# Independent RPC validation

**Independent candidate authorization remains UNMET.** No authenticated independent-provider configuration was supplied in this environment. Different endpoint domain names, configured operator labels, matching genesis, equal bytes at different banks or failover availability do not prove independent operation or exact quote-bank agreement.

Configured public diagnostics return policy status **{provider.get('status','unavailable')}** with eligibility **{provider.get('eligible',False)}**. Reasons: {'; '.join(provider.get('reasons',[]))}. [Full attributed observations, genesis, finalized banks and ownership/digests](phase10/provider-validation.json); [per-method signature/account reads](phase10/provider-method-evidence.json).

Exact finalized account bank: {methods.get('exactBank','unknown')}; exact bytes equality at that bank: {methods.get('exactBytesEqual','unknown')}. Standard `minContextSlot` is a lower bound, not an exact historical-bank selector. The diagnostics are separate public-provider observations; no successful current candidate quote-bank comparison is claimed. Provider disagreement/failure/unknown attribution stays blocked. Existing chain mismatch, same-bank conflict, lag, failure isolation and unknown-operator tests remain passing.

The new deployment capture identifies bytes served by its named finalized provider, not a cryptographic source/build attestation or verified infrastructure independence. Durable production provider-quarantine operations and authenticated independent infrastructure remain funded-release work.
''')

candidate_outcomes=read('candidate-outcomes.json',{})
reason_counts={}
for r in reviews:
    for reason in r.get('reasons',[]):reason_counts[reason]=reason_counts.get(reason,0)+1
simrows=[]
for name,side in [('current-buy-simulations.json','buy'),('current-sell-simulations.json','sell')]:
    for r in (read(name,{}) or {}).get('rows',[]):
        success=r.get('result',{}).get('simulation',{}).get('success')
        simrows.append([r['venue'],side,'Actual unsigned simulation success' if success else r.get('issue','Inspect retained attempts')])
write('end-to-end-paper-results.md',f'''# Phase 10 end-to-end paper results

{status}. No live signature, broadcast or spending occurred. Historical synthetic fixtures and diagnostic public-account impersonation are never inserted as eligible fresh launches.

{summary}

The existing flow retains live receipt identity/provider/time, strict finalized creation verification, current market accounts, mandatory risk/strategy/capital checks, unsigned two-sided simulation/economic checks, independent agreement and coverage gating, then durable paper entries and fresh-quote exits. A verified creation identity does not establish compatibility of a changed deployed financial contract. Current Pump deployment/global failures prevent eligibility; safety was not relaxed to produce a fill.

{table(['Current recorded review rejection (reason occurrences, not mutually exclusive)','Count'],sorted(reason_counts.items())) if reason_counts else 'No finalized review distribution available yet.'}

{table(['Separate route diagnostic','Side','Outcome'],simrows)}

{table(['Strict finalized creation verification rejection','Count'],sorted(e.get('verificationRejectionCounts',{}).items()))}

Final per-selected-receipt accounting is retained in [candidate-outcomes.json](phase10/candidate-outcomes.json) after WAL reconciliation. Current finalized accounting: {candidate_outcomes.get("counts","Pending final evidence")}. This separates decoder quarantine, strict verification, RPC/finality absence and actual market rejection rather than treating every receipt as a failed trade.

These route diagnostics reread previously identified markets/public inventory. A construction, inventory or account fetch failure is not a failed transaction simulation or an executed trade. [Buy attempts](phase10/current-buy-simulations.json), [sell attempts](phase10/current-sell-simulations.json). Recorded old successful unsigned simulations remain regression fixtures only.

Positive fresh eligible entry/exit and reconciled real-chain paper P&L are not demonstrated when none qualifies. The final ledger retains original timestamps/provenance and exact accounting; no artificial token inventory, historical freshness or positive profit was supplied.
''')

samples=e.get('samples',[]); latest=e.get('sample',{}) if not samples else samples[-1]
hist=e.get('telemetry',{}).get('histograms',{}); counters=e.get('telemetry',{}).get('counters',{})
confirmed_slots=[r['event']['slot'] for r in rows if r.get('event',{}).get('slot') is not None]
finalized_slots=[c['result']['slot'] for c in e.get('captured',[]) if c.get('method')=='getTransaction' and c.get('commitment')=='finalized' and c.get('result',{}).get('slot') is not None]
market_slots=[c['result']['contextSlot'] for c in e.get('captured',[]) if c.get('method')=='market.getMultipleAccounts' and c.get('result',{}).get('contextSlot') is not None]
slot_range=lambda values: [min(values),max(values)] if values else 'No retained population yet'
slot_table=table(['Sampled slot scope','Range/anchor'],[['Confirmed sampled receipt slots',slot_range(confirmed_slots)],['Finalized transaction response slots',slot_range(finalized_slots)],['Finalized market account banks',slot_range(market_slots)],['Durable admitted anchors, possibly including pending work',j.get('anchors',{})]])
resource=table(['Resource/timer','Measured observation'],[
    ['Process CPU user/system microseconds',e.get('resources',{}).get('cpuMicroseconds',latest.get('cpuMicroseconds','unavailable'))],
    ['Sampled peak RSS bytes',max([x.get('memory',{}).get('rss',0) for x in samples]+[latest.get('memory',{}).get('rss',0)])],
    ['Sampled peak WAL bytes',max([x.get('wal',{}).get('walBytes',0) for x in samples]+[j.get('walBytes',0)])],
    ['WAL checkpoints',counters.get('research.wal_checkpoints',0)],['RPC calls / errors',f"{counters.get('rpc.calls',0)} / {counters.get('rpc.errors',0)}"],
    ['Explicit HTTP/handshake 429 lower bound',counters.get('research.rpc_rate_limits',0)],['Event-loop delay milliseconds',latest.get('eventLoopDelayMs','unavailable')],
    ['Fsync batches',j.get('fsyncBatches','unavailable')],['Fsync group records p50/p95/p99',hist.get('journal.batch_records','unavailable')],
])
write('long-duration-monitoring.md',f'''# Phase 10 long-duration monitoring

{status}. Monotonic 7,200-second target met: **{duration_met}**. Provider-reported continuous coverage established: **{coverage_complete}**. Independent operation/agreement: **UNMET**. No duration or open socket is substituted for complete event coverage.

{summary}

{resource}

{slot_table}

Ranges describe sampled provider observations, not fully covered intervals. Slot differences are not converted into milliseconds. Research-pipeline monotonic runtime (startup/drain scope) is recorded separately in sample elapsedMs; container start/stop wall time is retained in the final container inspection. Wrapper bootstrap and final JSON export are not claimed as monitored coverage.

The measured job is a restricted Node22 container with compiled runtime snapshots sealed before pipeline import. All monitoring is Pump-only; creation candidates are bounded samples. Confirmed notification slots, durable admission anchors, finalized creation slots and finalized market banks are different evidence scopes. Receipt latency is process-local and never substituted for chain occurrence time.

`connectedMs` counts physical open intervals; `acknowledgedMs` begins only after every subscription ACK. Stale receipts and outages create explicit gaps; recovery windows remain provider-reported and bounded. Host clock drift above five seconds terminates before delivery of delayed notifications. Process wall, monotonic elapsed, disconnection and discrepancy are independently recorded. Oldest active work is separate from retained quarantines.

Raw observations and refusals rotate with retained deletion metadata. WAL ownership/acknowledgement remains worker fsync(file+directory), with pending/completed/disk caps and checkpoints. All source copies, in-flight/queue observations, memory/CPU, event-loop lag, RPC issues and rejection provenance are retained under [the validated run](phase10/runtime/mainnet-validated/). Final `evidence.json` follows stop, drain, flush and ledger reload; progress is interim only.

The earlier `runtime/mainnet` and `runtime/mainnet-final` calibrations are preserved separately, excluded from this window. The failed Phase9 host-discontinuity run is not added to this duration. Shared-host tests/builds/reference installs and performance probes overlapped portions of this run; recorded latency is not a quiet-host SLO. The research process has no PostgreSQL pool attached; database fault/recovery validation is separate.
''')

bench_rows=[]
for path,label in [('performance-unprofiled-control.json','Unprofiled archived Phase9 reproduction'),('performance-phase9-reproduction.json','Scheduler/JSON-instrumented reproduction'),('performance-traced-pair.json','Traced/instrumented pair'),('performance-current-delivery.json','Current Phase10 versus final Phase9, Node20'),('performance-node22-disk-counterbalanced.json','Node22 disk-backed alternating-pair control')]:
    b=read(path,{})
    for side in ['before','after']:
        population=[r for r in b.get('rows',[]) if r['adapter']==side]
        if population:
            median=lambda f:statistics.median(f(r) for r in population)
            bench_rows.append([label,side,len(population),fmt(median(lambda r:r['completedPerSecond'])),fmt(median(lambda r:r['latencies']['end_to_end_ms']['p95'])),median(lambda r:r['journal']['fsyncBatches']),median(lambda r:r['telemetry']['histograms']['journal.batch_records']['p50'])])
current_bench=read('performance-current-delivery.json',{})
current_medians={side:statistics.median(r['completedPerSecond'] for r in current_bench.get('rows',[]) if r['adapter']==side) for side in ['before','after']} if current_bench.get('rows') else {}
current_delta=(current_medians.get('after',1)/current_medians.get('before',1)-1)*100 if current_medians else None
node22_bench=read('performance-node22-disk-counterbalanced.json',{})
node22_medians={side:statistics.median(r['completedPerSecond'] for r in node22_bench.get('rows',[]) if r['adapter']==side) for side in ['before','after']} if node22_bench.get('rows') else {}
node22_delta=(node22_medians.get('after',1)/node22_medians.get('before',1)-1)*100 if node22_medians else None
trace=read('performance-trace-analysis.json',{})
thread_rows=[]
for r in trace.get('threads',[]):
    thread_rows.append([r['side'],'main',fmt(r['main']['runtimeMs']),fmt(r['main']['runqueueWaitMs'])])
    for t in r['walWritingThreads']:thread_rows.append([r['side'],'WAL writer '+t['tid'],fmt(t['runtimeMs']),fmt(t['runqueueWaitMs'])])
write('performance-root-cause.md',f'''# Burst performance root-cause investigation

The Phase9 13.4% burst-throughput decrease remains an unresolved historical signal, not an attributed code regression or a claimed improvement. Exact pre-Phase9 and final Phase9 source archives were reconstructed, linked to the same current dependencies, and measured with identical seeded offers and file/directory-fsync acknowledgements. Full source hashes and commands are retained. The current Phase10 comparison separately measures its new ingestion/WAL metadata paths.

{table(['Population','Side','Runs','Median completed/s','Median per-run p95 ms','Median fsync batches','Median records/group p50'],bench_rows)}

Current delivery burst signal: before median {fmt(current_medians.get("before","pending"))}/s, after {fmt(current_medians.get("after","pending"))}/s, change {fmt(current_delta)}%. This three-run Node20 decrease remains unresolved and is disclosed as a regression signal, not a cured Phase9 regression. The six-pair disk-backed Node22 control changes {fmt(node22_delta)}% (before {fmt(node22_medians.get("before","pending"))}/s; after {fmt(node22_medians.get("after","pending"))}/s). Its mixed pair outcomes and different runtime/order prevent attributing a stable source-level cause.

These are medians of per-run measurements, not pooled percentiles. The archived/current host runs use Node20 for comparison with Phase9; the production observer and separately labeled disk-backed control use Node22. The first Node22 tmpfs controls are retained as RAM-backed diagnostics only and are excluded from persistent-storage claims: [setup correction](phase10/node22-tmpfs-correction.json). Fsync calls alone do not make tmpfs power-loss durable. The corrected control binds the same host /tmp filesystem, with device identity recorded. The fixed three-run shuffle places two after jobs early and two before jobs late; the alternating-pair control measures order sensitivity without discarding the original negative result. It does not prove order is the sole root cause.

Profiling/scheduler/strace populations have substantial instrumentation overhead and must not be compared directly to unprofiled throughput. The before/after signs and magnitudes vary across repetitions. No durability delay, acknowledgement-before-fsync, risk relaxation or arbitrary batch tuning was used to manufacture a gain. Shared dependencies prevent a codec before/after claim; other host load is uncontrolled despite excluding concurrent Mintbot builds/tests/DB probes from the isolated measurement commands.

{table(['Exact WAL syscall','Parsed count','p50 ms','p95 ms','max ms'],[[r['syscall'],r['count'],fmt(r['p50Ms']),fmt(r['p95Ms']),fmt(r['maxMs'])] for r in trace.get('walSyscalls',[])])}

{table(['Traced pair side','Thread','Observed CPU ms','Observed runqueue wait ms'],thread_rows)}

[Trace reconstruction](phase10/performance-trace-analysis.json) joins unfinished/resumed calls; WAL file-descriptor paths identify the actual writing thread IDs. Per-task observations use 20ms endpoints and exclude unobserved thread lifetime. Kernel `sched_schedstats=0` is retained context; nonzero per-task counters are reported as observed, while zero rows do not prove absence of contention. Syscall wall times include scheduling and tracing effects, not isolated physical-device latency. Main-thread JSON calls/time, GC, queue occupation/wait, worker append/fsync/group distributions, CPU, memory, `/proc/stat`/load snapshots and invariants are in raw per-job evidence.

[Unprofiled control](phase10/performance-unprofiled-control.json), [instrumented reproduction](phase10/performance-phase9-reproduction.json), [trace pair](phase10/performance-traced-pair.json), [current Node20 delivery](phase10/performance-current-delivery.json), [disk-backed Node22 control](phase10/performance-node22-disk-counterbalanced.json), [injected provider/live-history interference](phase10/performance-provider-interference.json). The latter injects bounded temporary failures and delays; it is not real provider latency or a paper fill. Actual RPC faults and backpressure belong to the mainnet report.

Observed batching and scheduling sensitivity is measurable; a stable causal explanation of the historical 13.4% remains unproven. No speedup, production SLO or regression cure is claimed.
''')

write('security-validation.md',f'''# Phase 10 security and release validation

Recorded full suite: **{test_text}**, including all original 288 tests. No original test or immutable Phase9 artifact was removed or rewritten. New tests cover real deployment/global rejection, captured binary integrity, ACK timing, immediate transport readiness loss, delayed watchdog races, durable quarantine review/restart, failure redaction/stage, bounded reviews and retry coverage reopening.

Dependency audit at capture: **{audit_count} findings**. The local versioned native-bigint replacement, tarball/license/integrity and narrow dependency overrides remain. No blanket audit override/force was introduced. [Audit](phase10/final-validation/dependency-audit.json), [uncached Node22 two-stage clean install/build](phase10/validation/docker-build-clean-node22.log), [final production build](phase10/release-validation/docker-build.log), [typecheck](phase10/release-validation/typecheck.log), [production-container/live-mode rejection](phase10/release-validation/production-container-smoke.json), [original/new full suite](phase10/complete-validation/after-tests.log).

PostgreSQL authenticated SCRAM/privilege/rotation/crash/restart/fencing and backup/restore tests passed in that suite; refreshed old helper evidence is retained under the Phase10 validation directories while old bytes are restored. No heartbeat was run against a cluster concurrently with destructive fault tests. That retained private PG16 test deployment is separate from Compose PG17 and from the research observer; production HA/PITR/operations are not established.

The independent SDK reference installations are isolated temporary directories with pinned top-level packages, preserved locks and lifecycle scripts disabled. They are not production dependencies, not a clean-production-audit claim for their own graphs, and not current Pump deployment approval.

New quarantine records require a compatible current WAL reader; downgrade to an old writer is not authorized. Reviews use local exclusive WAL ownership, expected fingerprint, bounded review/attempt counts and fsynced records. Retries reopen an unresolved gap; writer failures fail closed. No route connects to a private key, signer, broadcaster, live-mode switch or funded spending. Original wallet unit tests remain isolated fixtures, not credentials used for chain operations.
''')

write('remaining-funded-trading-blockers.md',f'''# Phase 10 remaining funded-trading blockers

Live signing, transaction broadcast and funded trading remain unavailable. Engineering validation does not authorize funded release.

- Current Pump deployment slot {binary.get('observedDeploymentSlot','unavailable')} and 1096-byte Global are unreviewed. Binary hashes/official schemas do not establish the complete source/financial contract. The old pin remains; no variant was enabled without the required proof chain.
- Phase9's large gap and 40 quarantined deliveries remain accounted for, not erased. The current run's coverage is {coverage_complete}; any partial/unrecoverable gap or pending quarantine blocks authorization.
- Authenticated independently operated providers, exact candidate quote-bank agreement, persistent production conflict/quarantine operations and independent recovery completeness remain unverified.
- A qualifying fresh launch → unsigned two-sided simulation → durable paper entry → monitored exit/P&L has not been demonstrated when none qualifies. Fixtures/old simulations are separate.
- Two-hour monotonic target currently met: {duration_met}. Even a completed duration is not continuous coverage. Host interruptions, terminal failures and calibration time cannot be added to the target.
- Historical burst-performance attribution remains unproven. Current/instrumented/raw comparisons are disclosed without a speedup claim. The current three-run Node20 burst median decreases about 15.5%, and the six-pair disk-backed Node22 control about 4.9%; their source-level causes remain unproven.
- Independent security review of the local codec, production SQL/paper atomic ownership, managed backup/PITR/restore/HA and operational alerting remain deployment work. A clean npm audit is not an external security audit.
- Isolated signer policy, spend/packet authorization, uncertainty/landing/settlement reconciliation, capital controls and separately authorized funded validation remain outside this delivery. No such path was introduced.
''')

(OUT/'report-status.json').write_text(json.dumps({'generatedAt':time,'finalEvidence':bool(final),'monotonicTargetMet':duration_met,'continuousProviderCoverage':coverage_complete,'providerIndependence':'unknown','paperTrades':len(trades),'runDirectory':str(RUN),'liveTrading':False},indent=2)+'\n')
print(json.dumps({'reportsGenerated':True,'final':bool(final),'supervisorSeconds':elapsed/1000,'notifications':e.get('notifications',0),'paperTrades':len(trades),'monotonicTargetMet':duration_met,'coverageComplete':coverage_complete}))
