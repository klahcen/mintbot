"""Render evidence-backed Phase9 reports. A running experiment stays explicitly incomplete."""
from pathlib import Path
import json, statistics, re, datetime, argparse
parser=argparse.ArgumentParser()
parser.add_argument("--run-dir",default="mainnet-validated")
parser.add_argument("--validation-dir",default=".")
parser.add_argument("--test-log",default="after-tests.log")
parser.add_argument("--running",action="store_true",help="Explicitly assert a currently active process; missing final evidence alone never implies running")
args=parser.parse_args()
root=Path('docs'); out=root/'phase9'
run=out/args.run_dir; validation=out/args.validation_dir
def read(name, fallback=None):
 p=validation/'clock-release'/name if (validation/'clock-release'/name).exists() else validation/name if (validation/name).exists() else out/name
 return json.loads(p.read_text()) if p.exists() else fallback

def write(name, content):
 for artifact in ['market-diagnostics.json','protocol-review.json','provider-validation.json','provider-method-evidence.json','dependency-audit-release.json']:
  if (validation/'clock-release'/artifact).exists(): content=content.replace('phase9/'+artifact,'phase9/'+str(Path(args.validation_dir)/'clock-release'/artifact))
  elif (validation/artifact).exists(): content=content.replace('phase9/'+artifact,'phase9/'+str(Path(args.validation_dir)/artifact))
 content=content.replace('phase9/mainnet-validated/',f'phase9/{args.run_dir}/').replace('`mainnet-validated/source-at-start`',f'`{args.run_dir}/source-at-start`')
 (root/name).write_text(content.strip()+'\n')
def f(v): return f'{v:,.3f}' if isinstance(v,(int,float)) else str(v)
def table(headers,rows): return '| '+' | '.join(headers)+' |\n|'+'|'.join(['---']*len(headers))+'|\n'+'\n'.join('| '+' | '.join(map(str,r))+' |' for r in rows)
final=json.loads((run/'evidence.json').read_text()) if (run/'evidence.json').exists() else None
progress=json.loads((run/'run-progress.json').read_text()) if (run/'run-progress.json').exists() else {}
e=final or progress; complete=bool(final); s=e.get('supervisor',{}); samples=e.get('samples',[]); last=e.get('sample',{}) if not samples else samples[-1]
metrics=e.get('telemetry',{}); counters=metrics.get('counters',{}); hist=metrics.get('histograms',{})
ledger=e.get('ledger') or (json.loads((run/'ledger.json').read_text()) if (run/'ledger.json').exists() else {})
# Store serialization may wrap state; retain exact root if not wrapped.
ledger=ledger.get('state',ledger); reviews=ledger.get('marketReviews',[]); trades=ledger.get('trades',[])
parsed=[r for r in reviews if r.get('evidence',{}).get('state')]
rows=e.get('rows',[]); diagnostics=e.get('simulationDiagnostics',[])
rejections={}
for r in reviews:
 for reason in r.get('reasons',[]):rejections[reason]=rejections.get(reason,0)+1
m=read('market-diagnostics.json',{}); bench=read('performance-observer-only.json',read('performance-delivery.json',read('performance-matched.json',{}))); sim=read('simulation-benchmark.json',{}); db=read('database-soak.json',{}); protocol=read('protocol-review.json',{}); provider=read('provider-validation.json',{}); method=read('provider-method-evidence.json',{})
audit=read('dependency-audit-release.json',{}); before=read('dependency-audit-before.json',{})
verified_headers=[d['name'] for d in protocol.get('deployments',[]) if d.get('evidence',{}).get('status')=='verified']
unverified_headers=[d['name']+': '+d.get('issue','Unverified loader evidence') for d in protocol.get('deployments',[]) if d.get('evidence',{}).get('status')!='verified']
deployment_summary=str(len(verified_headers))+' of '+str(len(protocol.get('deployments',[])))+' current loader headers matched reviewed pins ('+', '.join(verified_headers)+'). '+('; '.join(unverified_headers)+'. Unreviewed deployments remain rejected.' if unverified_headers else 'No changed loader header was observed in this capture.')
count=lambda x: x.get('metadata',{}).get('vulnerabilities',{}).get('total','unavailable')
discontinuity=read('host-clock-discontinuity.json',{})
if discontinuity.get('runDirectory')!=str(run): discontinuity={}
failed=bool(e.get('pipeline',{}).get('fatal')) or s.get('state')=='terminal'
window_complete=complete and not discontinuity and s.get('elapsedMs',0)>=e.get('seconds',7200)*1000
status=(('FAILED bounded experiment; final evidence preserved' if failed else 'Completed requested monitoring window' if window_complete else 'Stopped before requested monitoring window; final evidence preserved') if complete else 'RUNNING: final results are not yet available' if args.running else 'INTERRUPTED/UNFINALIZED: retained progress only; no active process asserted')
if discontinuity: status='INTERRUPTED/host-clock discontinuity: final evidence retained; two-hour monitored target unmet'
summary=[('Experiment',status),('Supervisor elapsed seconds',f(s.get('elapsedMs',0)/1000)),('Process wall seconds',f((e.get('endedAt',e.get('updatedAt',e.get('startedAt',0)))-e.get('startedAt',0))/1000)),('Transport open seconds',f(s.get('connectedMs',0)/1000)),('Transport disconnected seconds',f(s.get('disconnectedMs',0)/1000)),('Connections / incidents',f"{s.get('connections')} / {s.get('incidents')}"),('Delivered notifications',e.get('notifications',0)),('Admission refusals/conflicts',e.get('refused',0)),('Sampled candidates',len(rows) if complete else e.get('candidates',0)),('Verified creations',sum(r.get('verifiedLaunches',0) for r in rows) if complete else last.get('verifiedCreations','pending')),('Durable market reviews / parsed states',f'{len(reviews)} / {len(parsed)}'),('Simulation diagnostic records',len(diagnostics) if complete else 'final evidence pending'),('Paper entries / exits',f"{sum(t.get('side')=='buy' for t in trades)} / {sum(t.get('side')=='sell' for t in trades)}"),('Instrumented RPC calls / errors',f"{counters.get('rpc.calls',0)} / {counters.get('rpc.errors',0)}"),('Observed explicit rate limits (lower bound)',counters.get('research.rpc_rate_limits',0)),('WAL checkpoints',counters.get('research.wal_checkpoints',0)),('Live trading',False)]
paired=sum(bool(r.get('evidence',{}).get('buy')) and bool(r.get('evidence',{}).get('sell')) for r in reviews)
summary.extend([('Completed ingestion identities',counters.get('ingest.completed',0)),('Processing fatal state',e.get('pipeline',{}).get('fatal')),('Quarantined observations',e.get('journal',{}).get('quarantined',0)),('Oldest pending age ms (includes quarantine)',e.get('journal',{}).get('oldestPendingAgeMs','pending')),('Admission queue peak',metrics.get('gauges',{}).get('research.admission.pending',{}).get('peak','pending')),('Worker unacknowledged record peak',metrics.get('gauges',{}).get('journal.unacked',{}).get('peak','pending')),('Intentional transport backpressure pauses',counters.get('supervisor.backpressure_pauses',0)),('Paired account-state quote reviews (before simulation)',paired)])
summary.append(('WebSocket handshake 429 incidents (retained events)',sum(x.get('kind')=='incident' and 'Unexpected server response: 429' in x.get('reason','') for x in s.get('events',[]))))
if discontinuity:
 summary.append(('Wall minus monotonic duration discrepancy, seconds (unobserved; exact mechanism unknown)',f(((e.get('endedAt',0)-e.get('startedAt',0))-s.get('elapsedMs',0))/1000)))
main_table=table(['Observation','Measured value'],summary)
write('websocket-reliability.md',f'''# Phase 9 WebSocket reliability

The Phase 8 receipt outage followed five lifetime reconnects. `SolanaMonitor` never reset that counter on a successful connection. Recorded errors were `Invalid WebSocket frame: invalid status code 1006`. Code 1006 is reserved and cannot appear in a close frame; the validating receiver correctly rejected it. The artifacts cannot identify whether the provider or an intermediary emitted those bytes. Validation remains enabled. See [ws validation source](https://github.com/websockets/ws/blob/master/lib/validation.js) and [Solana subscription contract](https://solana.com/docs/rpc/websocket/logssubscribe).

[MonitorSupervisor](../src/research/monitor-supervisor.ts) wraps the existing monitor, disables its internal retries for each connection, and owns finite recovery. Acknowledgements must arrive within 10 seconds. An open socket or pong is insufficient: notification receipts must be no older than 30 seconds. Thirty seconds of stable receipts resets the incident attempt counter; successful ACKs alone do not. Three successive unsuccessful attempts cause a 30-second provider cooldown and rotation. Whole-run limits remain 512 connections, 512 incidents, and 7200 seconds in the experiment. A terminal budget or lifecycle callback failure closes the socket; stale callbacks are fenced by generation. Original 15-second ping/pong handling and handshake/payload bounds remain in `SolanaMonitor`.

The delivered lifecycle also notifies the controller exactly once on stop, terminates synchronous observer failures, rejects conflicting subscription acknowledgements, and retains bounded redacted provider JSON-RPC reasons and codes. Independent wall and monotonic clocks stop on drift above five seconds before a delayed receipt can become fresh coverage; timing freezes at stop. These later refinements have deterministic regression tests and were not hot-loaded by the captured extended process.

Events retain monotonic incident times, provider host, transport error/close codes, subscription state and socket intervals. The new supervisor is used by the explicit Phase 9 research CLI. A bounded 1024-item/4MiB admission stage runs at most eight jobs and waits for refusal gap metadata to flush as well as successful ownership. Saturation pauses and fences the socket; resume preserves lifetime budgets and the deadline. Intentional pauses do not accumulate as failed network attempts. Fatal processing resolves the bounded run early and is retained in evidence, rather than allowing a receiving socket to hide a stalled pipeline. The ordinary server/legacy monitors retain their existing contracts; they have not been switched to this research lifecycle or claimed to inherit its recovery results. A supervisor is one run and cannot silently restart after stop/exhaustion.

{main_table}

Transport-open duration is not acknowledgement-ready duration, receipt continuity or finalized chain coverage. The deterministic tests cover missing ACKs, stale receipts, cooldown/failover, subscription resynchronization, old socket callbacks, stable-budget reset, run deadline and terminal observer failure. See [retained original Phase 9 test log](phase9/new-tests-final.log), [extended evidence](phase9/mainnet-validated/), and [coverage limits](recovery-coverage.md).
''')
journal=e.get('journal',{}); gaps=journal.get('gaps',[])
write('recovery-coverage.md',f'''# Phase 9 recovery coverage

The existing WAL, stable event identities, bounded live-priority queues and recovery verifier remain in place. `HttpRecoveryRpc` now accepts an explicit finalized commitment for the research run; its existing confirmed default remains compatible. A new awaited page-progress callback records target/from slots, cursor, pages, retrieved/duplicate/unavailable counts, anchor visibility and boundary visibility. The CLI fsyncs the progress file and its parent directory. The WAL owns gap bounds, anchors and attempt counts.

A recorded cursor is audit progress, **not** authorization to skip earlier pages after restart. Restart rescans from the head and deduplicates against durable identities. Recovery is reported complete only when the original anchor and lower boundary were seen, no window was truncated, transactions were available, accepted work finished, and the gap did not expand during the scan. Provider-reported history is not independently proven complete history.

The monitor pins each scan to the selected HTTP provider. Each scan has a 2000-slot window, ten 100-signature pages, at most 1000 transactions, one retry and a 20-second deadline. A program gets at most three automatic cycles; an explicit reviewed recovery action is required to reset exhausted attempts. A new disconnect merged into an exhausted gap now remains explicitly unrecoverable, with a flush before completion. The final run includes the status correction before launch. The interrupted first run under `mainnet-extended` predates it and retains a pending exhausted gap; that original artifact is preserved. Neither version permits a paper entry through an unresolved gap.

Observed final/current WAL gaps:

```json
{json.dumps(gaps,indent=2)}
```

The bounded real RPC attempt using the **last selected Phase 8 anchor** returned the result in [phase8-recovery.log](phase9/phase8-recovery.log). It cannot certify outages preceding that anchor. Its window was clipped and stayed partial. Raw-page progress and the private research WAL are retained in the corresponding `phase8-recovery-*` directory. No Phase 8 interval is newly claimed fully recovered. A separate controlled finalized Meteora history probe also stayed partial: five ten-signature pages were all newer than its fixed target, so the bounded scan did not reach the requested window. [recovery-probe.log](phase9/recovery-probe.log) and its retained RPC responses demonstrate the limitation; zero retrieved transactions do not mean an empty chain interval. The probe does not claim recovery of an observed outage.

Deterministic durable-WAL tests interrupt after an awaited page checkpoint, restart, rescan, and assert no repeated strategy identity. Tests also check finalized RPC parameters, the confirmed default, and exhausted merged-gap behavior. Existing retention, missing-transaction, pagination, 429 and live/history priority tests remain unchanged. See [recovery test log](phase9/recovery-tests-release.log). New paper admission requires fresh receipts, no quarantined work or ingestion failure, and every current gap recovered; historical discoveries retain their origin and cannot become fresh launch entries.
''')
for label,filename in [('Retained Phase 8 anchor','phase8-recovery.log'),('Controlled current DLMM history','recovery-probe.log')]:
 path=validation/filename
 if path.exists():
  try:
   observation=json.loads(path.read_text().strip().splitlines()[-1])
  except (ValueError,IndexError):
   observation={'issue':'See raw attempt log'}
  with (root/'recovery-coverage.md').open('a') as target:
   target.write('\nCurrent '+label+' attempt ([raw log](phase9/'+args.validation_dir+'/'+filename+')):\n\n```json\n'+json.dumps(observation,indent=2)+'\n```\n')
failrows=[]
for r in m.get('rows',[]):
 a=r['retainedAnalysis'];cause='Stale/unknown original event time; no market retrieval'
 if a.get('status')=='decoded':
  cause=('Mayhem flag; mint supply 2,000,000,000,000,000 > curve total 1,000,000,000,000,000; decimals 6 and creator match' if not a['supplyWithinCurveTotal'] else 'Unsupported non-native quote mint '+a['quoteMint']+('; creator also changed' if not a['creatorMatches'] else ''))
 failrows.append([r['id'],cause])
write('market-rejection-analysis.md',f'''# Phase 9 diagnosis of the eight Phase 8 market failures

Every original decision is reproduced from retained account bytes and original launch identity, not inferred from an error label. The new structured `marketFailure` evidence preserves exact unsupported layout/variant and identity/supply fields without changing admission rules or error strings. [The fixture regression](../tests/phase9-market-diagnostics.test.ts) asserts all eight classifications.

{table(['Original stable identity','First failure and additional verified observations'],failrows)}

Four are supply-model incompatibilities on observed Mayhem curves; two are unsupported non-native quote variants, one with a changed current curve creator. Those are protocol/identity evidence failures, not demonstrated malicious transfer restrictions or holder concentration failures. Both other decisions failed freshness before account retrieval. The six retained mint decodes have six decimals and verified metadata-only transfer-extension evidence; this does not prove every mandatory token risk signal safe. Completed curves, missing accounts or a program upgrade are not asserted as causes of these eight decisions.

[market-diagnostics.json](phase9/market-diagnostics.json) contains exact original batches, original reasons and current finalized account rereads with provider/context. Current bytes may differ from the historical decision and cannot repair its freshness or authorize a retrospective trade. {deployment_summary} See [protocol-review.json](phase9/protocol-review.json); loader equality is not ELF/semantic equivalence.

The pinned upstream [Pump documentation](https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22) and captured IDL describe Mayhem, quote-mint and depth fields. A layout label alone does not validate changed custody, supply, fees, multihop quotes or both unsigned swap sides. These variants remain disabled until the complete proof chain exists. Mandatory authorities, extensions, transfer restrictions, liquidity, concentration, fresh evidence and sell feasibility were not relaxed.
''')
current_failures=[]
for review in reviews:
 detail=review.get('evidence',{}).get('marketFailure',{})
 fields='; '.join(str(k)+'='+str(v) for k,v in detail.items() if k not in ['kind','creationCreator','currentCurveCreator','account'])
 state=review.get('evidence',{}).get('state',{})
 if state and any('eventIdentity:' in reason for reason in review.get('reasons',[])):
  launch=state.get('launch',{});freshness=launch.get('freshness',{});policy=review.get('evidence',{}).get('policy',{})
  fields+='; launchSlot='+str(launch.get('slot'))+'; freshnessEventSlot='+str(freshness.get('eventSlot'))+'; marketSlot='+str(state.get('slot'))+'; maxMarketSlotLag='+str(policy.get('maxMarketSlotLag'))
 current_failures.append([review.get('id'),detail.get('kind','First recorded failure; no deeper cause asserted'),'; '.join(review.get('reasons',[])),fields])
if current_failures:
 with (root/'market-rejection-analysis.md').open('a') as target:
  target.write('\n## Current monitored review population\n\n'+table(['Stable identity','Diagnostic class','First failure','Retained fields'],current_failures)+'\n\nThese are original durable review diagnostics from the reported run. A supply-model or unsupported-layout failure is not proof of a malicious token. Missing later risk signals remain unknown. The eventIdentity signal also enforces the configured maximum distance between launch and market-bank slots; matching identity fields with a bank distance above that limit indicate a slot-distance rejection, not a proven identity conflict. Original account bytes, timestamps and provenance are in the experiment evidence; interim runs have only the durable ledger until final export.\n')
write('verified-protocol-extensions.md',f'''# Phase 9 protocol review

No new trading variant is enabled. {deployment_summary} A header match does not establish a source-to-ELF audit. [protocol-review.json](phase9/protocol-review.json) records the evidence and exact current source commits, files, URLs and hashes under `protocol-sources`.

| Venue | Retained bounded support | New variants and release disposition |
|---|---|---|
| Pump.fun | Reviewed 166-byte native-SOL curve, exact mint/PDA/custody/supply checks; pinned legacy trade instruction layouts | Observed Mayhem inflated supply, non-native quote coins, depth, editable creator fee, cashback/holder rewards and new instructions are not newly enabled |
| PumpSwap | Reviewed native-SOL orientation, bounded enabled mode, exact state/fee/vault checks | New quote orientations, mode flags and smaller instruction families require complete evidence |
| Raydium CPMM | Reviewed exact account/version/fee flags, native-SOL orientation, exact integer curve math | Unknown account/fee flags and other pool families remain rejected |
| Meteora DLMM | Reviewed version-1 pair, bounded active bins, supported fee/token flags and exact bin math | Unknown pair/bin versions, activation/limit-order/fee modes and unverified transfer extensions remain rejected |

Preserved real finalized creation/state fixtures remain in Phase 3–5; original unsigned buy fixtures in Phase 6 and sell fixtures in Phase 7 remain regression inputs. Phase 9 reran all recorded adapter, Token-2022, quote and simulation tests after the codec migration. The pinned independent SDK comparison matched eight buy/sell instruction layouts and 16 Raydium/DLMM quote vectors; see [builder-reference.json](phase9/builder-reference.json), [quote-reference.json](phase9/quote-reference.json) and the full test log. These offline comparisons include UNIT execution-account stubs and are not new mainnet simulations or eligible launch evidence.

The source review retained Pump docs/IDL commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`, Raydium CP swap commit `3d69122790e97cd6aff24e8ba95940793773f58c`, and Meteora SDK commit `1532e540db41ac405dbf4c5bb2ddfceaa1f98ff1`. New support still requires a pinned source/program relationship, real finalized creation and state, exact buy/sell quotes, wire checks, actual unsigned simulation and regression fixtures. No unsupported path is labeled verified because it deserializes.
''')
loader_mismatch=validation/'clock-release/pump-loader-mismatch.json'
if loader_mismatch.exists() and json.loads(loader_mismatch.read_text()).get('headerIdentityVerified'):
 lm=json.loads(loader_mismatch.read_text())
 note='\nThe November 14 finalized Pump loader capture has deployment slot **'+str(lm['observedDeploymentSlot'])+'**, versus reviewed slot **'+str(lm['reviewedPin']['deploymentSlot'])+'**. The ProgramData pointer and loader variants match; the deployment slot does not. Existing deployment policy rejects it. [Raw finalized loader headers](phase9/'+args.validation_dir+'/clock-release/pump-loader-mismatch.json) preserve the bank, account bytes and request. No new deployment pin or protocol variant was enabled.\n'
 for target in ['verified-protocol-extensions.md','market-rejection-analysis.md']:
  with (root/target).open('a') as handle:handle.write(note)
write('end-to-end-paper-results.md',f'''# Phase 9 end-to-end paper results

{status}. Live signing, broadcasting, funding and submission remain unavailable. The original synthetic replay and ordinary dashboard/API contracts are preserved.

The opt-in Phase 9 CLI uses the existing creation verifier, market service, risk/strategy engine and simulation-gated `RealMarketPaper`. It attempts durable admission for every delivered observation, records refusals and pauses transport on overload, and samples bounded creation candidates, preserves receipt/provider/slot/commitment/provenance, fetches finalized state, and requires original mandatory risk conditions before construction. Both exact unsigned buy/sell simulations and economic checks, independent-provider agreement at the quote bank, fresh receipts and resolved coverage are required before a durable paper entry. Exits continue through existing fresh sell-quote and accounting rules. No test fixture or historical discovered token is inserted into the real experiment as an opportunity.

{main_table}

Current/final reasons (a review may have multiple reasons):

{table(['Reason','Count'],sorted(rejections.items())) if rejections else 'No durable market-review reasons are present at this snapshot.'}

{('No eligible current-chain paper entry or exit was demonstrated. There is no realized market P&L claim.' if not trades else 'Inspect each durable ledger trade and its supporting simulation evidence; no trade is a funded fill.')}

[Extended evidence](phase9/mainnet-validated/) separates original notifications, verification failures, market decisions and simulation diagnostics. Recorded historical positive buy/sell simulations and deterministic accounting tests remain regression evidence; they do not satisfy a fresh observed launch → real evidence → eligible paper entry → exit. The positive opportunity criterion remains unmet when none qualifies. The two-hour monitored target also remains unmet after the host clock discontinuity.
''')
diagnostic_rows=[]
for filename,side in [('current-buy-simulations.json','buy'),('current-sell-simulations.json','sell')]:
 path=validation/filename
 if path.exists():
  for row in json.loads(path.read_text()).get('rows',[]):
   success=row.get('result',{}).get('simulation',{}).get('success')
   diagnostic_rows.append([row.get('venue'),side,'Unsigned simulation succeeded' if success else row.get('issue','See retained attempts')])
if diagnostic_rows:
 with (root/'end-to-end-paper-results.md').open('a') as target:
  target.write('\n## Separate current route diagnostics\n\n'+table(['Venue','Side','Outcome'],diagnostic_rows)+'\n\nThese attempts reread previously identified markets and public account inventory. They do not represent fresh launch candidates, paper trades, signer authorization or submissions. Evidence: [buy attempts](phase9/'+args.validation_dir+'/current-buy-simulations.json), [sell attempts](phase9/'+args.validation_dir+'/current-sell-simulations.json). Historical four-venue buy/sell successes remain separate regression fixtures.\n')
verification=e.get('verificationRejectionCounts',{})
verification_table=table(['Retained sampled verification issue','Count'],sorted(verification.items())) if verification else 'Final sampled verification distribution pending.'
resources=e.get('resources',{})
resource_table=table(['Resource observation','Value'],[
 ('Process CPU user/system microseconds',str(resources.get('cpuMicroseconds',last.get('cpuMicroseconds','pending')))),
 ('Sampled peak RSS bytes',max([x.get('memory',{}).get('rss',0) for x in samples]+[last.get('memory',{}).get('rss',0)])),
 ('Sampled peak WAL bytes',max([x.get('wal',{}).get('walBytes',0) for x in samples]+[e.get('journal',{}).get('walBytes',0)])),
 ('Minimum sampled disk free bytes',min([x.get('wal',{}).get('diskAvailableBytes',10**30) for x in samples]+[e.get('journal',{}).get('diskAvailableBytes',10**30)])),
 ('WAL writer failure',e.get('journal',{}).get('writerFailure')),
 ('Fsync batches',e.get('journal',{}).get('fsyncBatches','pending')),
 ('Records/group p50/p95/p99',str({k:hist.get('journal.batch_records',{}).get(k) for k in ['p50','p95','p99']})),
 ('Event-loop delay captured ms',str(last.get('eventLoopDelayMs','pending'))),
 ('GC captured count/time ms',str(resources.get('gcCount',last.get('gc',{}).get('count','pending')))+' / '+str(resources.get('gcMs',last.get('gc',{}).get('totalMs','pending')))),
])
finalized_tx=[c.get('result',{}).get('slot') for c in e.get('captured',[]) if c.get('method')=='getTransaction' and c.get('commitment')=='finalized']
finalized_accounts=[c.get('result',{}).get('contextSlot') for c in e.get('captured',[]) if c.get('method')=='market.getMultipleAccounts']
slot_table=table(['Slot scope','Recorded range/observation'],[
 ('Latest durable completed observation anchor (confirmed feed)',str(e.get('journal',{}).get('anchors',{}))),
 ('Sampled finalized creation transaction slots',str([min(finalized_tx),max(finalized_tx)]) if finalized_tx else 'Unavailable/pending'),
 ('Sampled finalized market account slots',str([min(finalized_accounts),max(finalized_accounts)]) if finalized_accounts else 'Unavailable/pending'),
])
latrows=[]
for name,h in hist.items():
 if any(x in name for x in ['research.admission','decode.end_to_end','receipt_to','state_retrieval','transaction_verification','quote_computation','risk','strategy.processing','simulation','rpc.market','journal.worker_fsync','queue_wait']):
  latrows.append([name,h['count'],h['samples'],f(h['p50']),f(h['p95']),f(h['p99'])])
clock_note=(f'''The retained watcher records a wall-clock jump from November 13 to November 14 while only about 50 seconds of monotonic observation elapsed. [The interruption record](phase9/{args.validation_dir}/host-clock-discontinuity.json) preserves the evidence. The missing interval is unobserved: it is not counted as transport-open time, provider-disconnected time or chain coverage. Host suspension versus clock adjustment is not established. The delivered supervisor compares independent wall and monotonic clocks and terminates on drift above five seconds, including before delivering a notification; that later fix was not loaded by this experiment.''' if discontinuity else 'The supervisor records wall and monotonic duration separately and stops on clock discontinuities; neither elapsed clock establishes recovered chain coverage.')
write('long-duration-mainnet-report.md',f'''# Phase 9 extended mainnet observation

{status}. Requested duration is {e.get('seconds',7200)} seconds. Receipt counts represent delivered Pump log notifications, not every network launch. Only bounded sampled CreateV2 candidates enter account/risk evaluation. No other venue is claimed continuously monitored by this run.

{main_table}

{clock_note}

Confirmed notification heads are recorded in row events and sample WAL anchors. Only verifier transactions and finalized account/RPC reads establish finalized evidence; these are not interchangeable slot observations. Socket-open time includes pre-ACK time and notification pauses, and does not certify finalized coverage. Recovery remains provider-reported and incomplete where anchors, windows or histories are unavailable.

{slot_table}

Slot ranges describe sampled provider-reported reads, not covered intervals or finalized network heads. Slot differences are not converted into elapsed milliseconds.

{verification_table}

{resource_table}

Resource snapshots precede final evidence serialization; that export can allocate additional memory. RPC error counters cover instrumented transports. The captured process counter omits WebSocket handshake wording; the separate retained-event handshake count makes those explicit 429 responses visible without rewriting raw telemetry. The delivered CLI recognizes both HTTP and handshake 429 messages. Explicit HTTP429 counts remain a lower bound across captured error paths; retained issue rows are capped at 500.

Selected monotonic histograms, milliseconds:

{table(['Timer','All observations','Retained samples','p50','p95','p99'],latrows)}

Histograms are bounded rolling samples (10,000 retained by default), not exact lifetime quantiles once full. Decode end-to-end starts at the existing monitor's normalized-event receipt clock and includes intake, WAL ownership and queue delay for live observations. JSON/message normalization precedes that clock and has separate timers; this is not wire-arrival or chain-occurrence latency. Historical/restart timing has its own origin and cannot measure an earlier process receipt. Quote/risk/simulation timers absent from the table have no measured population; absence does not mean zero latency. Queue age, peak depth, fsync groups, memory/CPU, GC and event-loop observations are in samples and telemetry.

Pending age includes quarantined observations and must not be labeled active queue wait. The checkpoint diagnosis in [quarantine-diagnostics.json](phase9/quarantine-diagnostics.json) reproduces existing strict log decoder errors against a checksummed compressed checkpoint, without relaxing parsing or asserting unsafe tokens. Counts from that one checkpoint are not a full-run inventory. The validated run includes the coverage helper that rejects quarantined observations and durable ingestion failures. Active queue depth, quarantined work and fatal processing state are recorded separately.

Raw observations rotate at 8 MiB with two retained archives; removal/coverage metadata is explicit. Captures are bounded to 64 MiB/2000 records; capture drops are counted. WAL bounds remain 64 MiB/10,000 pending/20,000 completed and checkpointing retains durable ownership semantics. Disk free space, WAL writer failures, pending age and checkpoint counters are recorded. The research CLI has no PostgreSQL pool attached; database fault/latency validation is separate.

The reported run loaded the retained source snapshot under `mainnet-validated/source-at-start`, including all gap, admission, failure-reporting and status corrections. No hot reload was used. Two earlier interrupted runs are retained: `mainnet-extended` exposed acknowledgement saturation and stalled processing; `mainnet-final` calibrated an overly small 128-item intake buffer. Neither is counted as a successful two-hour run. Their partial snapshots and WALs are evidence of the failed attempts, not complete capture sets; in-memory candidates/captures were not exported at abrupt termination.

Shared-host tests, builds, benchmarks and database probes overlap portions of this observation. Results are observations under that load, not quiet-host SLOs or a comparable throughput improvement over Phase 8. Startup requests, draining and shutdown can make total wall duration exceed the supervisor window. The 7200-second target is satisfied only if the final supervisor evidence actually records that duration.
''')
write('dependency-security-report.md',f'''# Phase 9 dependency security

The before audit has **{count(before)} findings**, all three high severity in the bigint conversion dependency chain. The release audit has **{count(audit)} findings**. See [before](phase9/dependency-audit-before.json), [release audit](phase9/dependency-audit-release.json) and [resolved dependency tree](phase9/dependency-tree-release.txt). This is the advisory database result at capture time, not a claim of vulnerability-free software or external review.

The path was SPL Token → buffer-layout-utils → native bigint-buffer. [GHSA-3gc7-fjrx-p6mg / CVE-2025-3194](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg) lists vulnerable versions through 1.1.5 and no patched release. Rather than suppress that advisory, a narrow local package replaces CJS/ESM unsigned conversion with bounded native-JavaScript bigint shifts and validated, initialized byte windows. Other utility APIs/types remain upstream copies. Supported protocol amounts do not require the previous out-of-range behavior; negative, overflow, wrong type, invalid width and truncated buffers now throw before writes.

The installable versioned local tarball is selected by a direct dependency and dollar-reference transitive override. The vulnerable native package is absent from the graph. Docker copies vendor before both clean installs, and the tarball is explicitly unignored. The first folder override failed dependency resolution; an intermediate tarball override resolved relative to a transitive package and failed; these logs are retained. A stale generated link was removed. A real Docker clean install then exposed a missing optional UTF-8 validator peer entry under Node22/npm10; regenerating the lockfile with that runtime fixed the install. The final two-stage image built and passed its own smoke checks. No blanket audit-force upgrade or ignore was used.

[Migration scope and integrity](phase9/dependency-migration-source.json), [source/license and maintenance instructions](../vendor/MIGRATION.md), [new boundary/BN/module-system tests](../tests/phase9-bigint-migration.test.ts), full regression, Token-2022 parsing, eight independent SDK instruction vectors, 16 independent quote vectors and recorded buy/sell simulation accounting tests support compatibility. Host Node20.19.5 emits a pre-existing cookie2 Node>=22 engine warning; the production container uses Node22. Independent security review, signer isolation and funded operational readiness remain blockers even with a clean audit.
''')
pr=[]
for o in method.get('observations',[]):
 for c in o['calls']:
  value='failed: '+c['issue'] if 'issue' in c else ('result recorded; '+str(c['result'])[:100] if c['method']!='getMultipleAccounts' else 'finalized account bank '+str(c['result'].get('context',{}).get('slot')))
  pr.append([o['provider'],c['method'],value.replace('|','/'),f(c['elapsedMs'])])
write('rpc-provider-comparison.md',f'''# Phase 9 RPC comparison

Configured service brands are Solana public RPC and Allnodes PublicNode. PublicNode publishes its service at [publicnode.com](https://www.publicnode.com/); this does not establish who operates the other endpoint or prove independent underlying infrastructure. Operating independence remains **unknown**, and the paper agreement gate remains fail closed.

The policy assessment status is **{provider.get('status','unknown')}** with eligibility **{provider.get('eligible',False)}**. [provider-validation.json](phase9/provider-validation.json) retains attributed observations, failures and reasons. [provider-method-evidence.json](phase9/provider-method-evidence.json) separately retains current per-method availability/results for one original finalized launch identity, preserving failures rather than collapsing them into a configured label.

{table(['Provider','Method','Observation','Elapsed ms'],pr)}

Exact account-bank agreement: **{method.get('exactBank','unknown')}**; exact account bytes equal at that bank: **{method.get('exactBytesEqual','unknown')}**. Different finalized banks do not establish state agreement. Genesis identity, slot lag, signature finalization and missing account checks remain separate requirements. Failover can restore availability, not agreement or complete history. Existing provider tests cover chain mismatch, same-bank conflict/quarantine, lag, failure isolation and unknown operator identity. No new independently operated provider pair, exact quote-bank authorization or independent recovery completeness is claimed.
''')
brows=[]
for scenario in bench.get('selectedScenarios',[]):
 for adapter in ['before','after']:
  rs=[r for r in bench['rows'] if r['scenario']==scenario and r['adapter']==adapter]
  if not rs:continue
  median=lambda fn:statistics.median(fn(r) for r in rs)
  brows.append([scenario,adapter,len(rs),f(median(lambda r:r['completedPerSecond'])),f(median(lambda r:r['latencies']['end_to_end_ms']['p50'])),f(median(lambda r:r['latencies']['end_to_end_ms']['p95'])),f(median(lambda r:r['latencies']['end_to_end_ms']['p99'])),sum(r['duplicateLogicalProcessing'] for r in rs),sum(r['refused'] for r in rs)])
write('performance-comparison.md',f'''# Phase 9 performance measurements

The matched harness uses an archived pre-change source checkout and the delivered source, three seeded repetitions per side/scenario, equivalent completion populations and current shared dependencies. The initial A/A control had identical source hashes. The final matched comparison includes the one-field exhausted-gap merge status correction in EventJournal; other measured ingestion/WAL/engine modules remain unchanged. This state correction is not a latency optimization or a native-codec before/after experiment. The supervisor and live providers were not backported into the baseline. The final comparison runs with the required mainnet observer and no concurrent Mintbot tests/builds/database probes; other host load remains uncontrolled. Two earlier runs overlapped tests/builds and remain retained: the initial A/A [performance-matched.json](phase9/performance-matched.json), and the loaded matched [performance-delivery.json](phase9/performance-delivery.json). Their copied metadata errors are explicit in the performance metadata correction files. No raw timing is silently discarded or relabeled as a quiet-host result.

Medians of the per-run measurements (not pooled percentiles):

{table(['Scenario','Side','Runs','Completed/s','p50 ms','p95 ms','p99 ms','Duplicate work','Refused'],brows)}

[performance-observer-only.json](phase9/performance-observer-only.json) includes offered/completed populations, raw latencies, fsync group/ownership timers, queue gauges, CPU, sampled memory, event-loop delay, injected RPC errors and integrity checks for each run. Live/history interference is measured with the same bounded scheduling and injected delay on both sides. All logical completion, paper-only, balance and unique-position checks must pass; table differences cannot establish an improvement or regression cause without isolation and repeated comparable conditions. In the final observer-only run, durable burst median throughput fell 13.4% (528.9 to 458.0/s), sustained stream changed about +0.1%, and mixed live/history changed about +33.1%. The burst reduction is an unresolved regression signal; the increases are not claimed improvements. Shared-host variability and the earlier loaded runs prevent source-level attribution.

[simulation-benchmark.json](phase9/simulation-benchmark.json) separately measures 12 recorded-market/UNIT-account build batches, three actual local PostgreSQL durable intent runs and three 64-job injected-provider failure bursts. These provider delays/failures are synthetic; they do not measure current mainnet simulation or successful fills. SQL transaction latency is in its telemetry. Actual current market retrieval and receipt-to-decision observations, with sample counts and missing populations, are in [the mainnet report](long-duration-mainnet-report.md). There is no real simulation-latency population when no candidate passes mandatory evidence.

The new transport/admission wrapper is not exercised by the direct-ingestion matched harness; its actual latency and queue populations are recorded by the final mainnet run without a speedup claim.

The clean authenticated PostgreSQL heartbeat (private cluster isolated from the current fault-test suite) ran {f(db.get('durationMs',0)/1000)} seconds: {db.get('successfulSamples','pending')} successes, {db.get('failedSamples','pending')} failures; round-trip p50/p95/p99 {f(db.get('latencyMs',{}).get('p50','pending'))}/{f(db.get('latencyMs',{}).get('p95','pending'))}/{f(db.get('latencyMs',{}).get('p99','pending'))} ms. It is SELECT-only availability, not commit latency or a pool attached to the mainnet monitor. An earlier overlapping probe was invalidated by the intentional credential rotation/crash tests and failed shutdown; its raw log is preserved, not counted as a clean soak. The full suite's retained authenticated PostgreSQL crash/restart, SCRAM rotation, privilege, restore and fencing evidence is under `phase9/prior-helper-rerun`; prior artifacts were restored byte-for-byte.
''')
current_bench=validation/'performance-comparison.json'
if current_bench.exists():
 cb=json.loads(current_bench.read_text()); cr=[]
 for scenario in cb['selectedScenarios']:
  for side in ['before','after']:
   population=[r for r in cb['rows'] if r['scenario']==scenario and r['adapter']==side]
   cr.append([scenario,side,len(population),f(statistics.median(r['completedPerSecond'] for r in population)),f(statistics.median(r['latencies']['end_to_end_ms']['p95'] for r in population))])
 with (root/'performance-comparison.md').open('a') as target:
  target.write('\n## Current validation comparison\n\n'+table(['Scenario','Side','Runs','Completed/s median','p95 ms median'],cr)+'\n\nThe baseline is the source snapshot captured at the start of the current experiment. At the time of that comparison, only chain subscription acknowledgement validation differed among the measured modules; this direct-ingestion harness does not exercise that path or the supervisor changes. Shared current dependencies and uncontrolled host load limit attribution. This comparison predates the final JSON-RPC and clock-discontinuity refinements and does not measure their overhead. No speed improvement is claimed. Raw metrics, integrity assertions, and the correction to inherited harness load/change labels are retained in [current performance evidence](phase9/'+args.validation_dir+'/performance-comparison.json) and [metadata attribution](phase9/'+args.validation_dir+'/performance-metadata-attribution.json).\n')
current_sim=validation/'current-buy-simulations.json'
if current_sim.exists():
 cs=json.loads(current_sim.read_text()); timers=[]
 for name,h in cs.get('telemetry',{}).get('histograms',{}).items():
  if name in ['simulation.rpc_ms','rpc.simulation.simulateTransaction_ms','simulation.evidence_to_result_ms'] or name=='intent.commit_ms':
   timers.append([name,h['count'],f(h['p50']),f(h['p95']),f(h['max'])])
 with (root/'performance-comparison.md').open('a') as target:
  target.write('\n## Current route diagnostic timing\n\n'+table(['Timer','Count','p50 ms','p95 ms','max ms'],timers)+'\n\nThese are actual provider timings from the separate current public-account buy diagnostics, including one successful unsigned PumpSwap simulation. A one-sample simulation population cannot establish an SLO or an improvement. It does not measure a qualifying live launch, a paper entry, a sell simulation or a funded fill. See [current buy evidence](phase9/'+args.validation_dir+'/current-buy-simulations.json).\n')
write('remaining-funded-trading-blockers.md','''# Phase 9 remaining funded-trading blockers

Live mode remains rejected. The repository has no newly connected signer, broadcaster, funded wallet or submission route. The extended attempt encountered a host clock discontinuity and did not complete two monitored hours; a fresh uninterrupted controlled run remains required.

- The first Phase9 controller bypassed bounded intake and stalled at its acknowledgement limit while transport continued. The final bounded controller is separately validated; the ordinary legacy monitor integration still needs an operational migration before a funded deployment.
- The 13.4% burst-throughput reduction in the observer-only matched sample remains an unresolved regression signal; no production latency SLO or speedup is claimed.
- Complete independent finalized coverage is not established. Public RPC windows, slot conflicts and outages leave gaps; fresh receipts alone cannot clear them. The final supervisor is opt-in research tooling; legacy server monitors retain their original lifecycle.
- No independently attributed provider pair and exact quote-bank agreement have authorized a qualifying opportunity. Current availability is not proof of independence or complete history.
- No eligible fresh current-chain paper entry and exit has been demonstrated when mandatory evidence fails. Existing recorded simulations and deterministic lifecycle tests do not substitute for that result.
- The November 14 Pump loader upgrade no longer matches its reviewed deployment pin. It is rejected until new source/program, finalized fixture, quote, wire and unsigned-simulation evidence is complete.
- Mayhem supply variants, non-native/depth quote coins, newer instructions and other unreviewed pool/extension modes need complete pinned source/state/quote/wire/unsigned simulation evidence. They remain disabled.
- A clean dependency audit follows a locally reviewed codec migration. Independent code/security review and reproducible maintenance of that vendored package are still required.
- Production intent-ledger ownership, durable provider quarantine/resolution, paper/SQL consistency, managed backup/PITR/restore/HA, operational alerts and failure drills need deployment review. The private local SCRAM cluster is not a production financial service.
- Isolated signer/KMS policy, complete packet/spend authorization, original-signature uncertainty handling, landed balance/fee reconciliation, capital limits and explicitly authorized funded release validation remain separate work. Nothing in Phase 9 enables these paths.
''')
tests=(validation/args.test_log).read_text() if (validation/args.test_log).exists() else ''
quarantine=read('quarantine-diagnostics.json',{})
matched=re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)',tests,re.S)
write('phase9-engineering-report.md',f'''# Phase 9 engineering report

Status date: {datetime.datetime.now(datetime.timezone.utc).date()}. **Read-only reliability changes delivered; verified continuous coverage and positive real-launch paper execution remain unproven.** {status}. Live trading remains disabled.

The repository was audited before edits. The original application, dashboard, journal worker, ingestion identity/durability, quotes, strategy and paper engines were retained. New work adds the opt-in bounded WebSocket supervisor, finalized recovery/page audit checkpoints, durable exhausted-gap status correction, structured Pump failure evidence, exact historical diagnosis, and a narrow native-bigint dependency replacement. The before source/archive and old root documents are retained under [phase9](phase9/README.md). All 100 checked prior-phase artifacts still match the Phase8 manifest.

Validation: **{matched.group(1) if matched else 'pending'} tests, {matched.group(2) if matched else 'pending'} passed, {matched.group(3) if matched else 'pending'} failed** in the retained full run, including all original 266 tests. {int(matched.group(1))-266 if matched else 'New'} additional tests cover supervisor faults, restart/recovery/deduplication, explicit coverage/quarantine gates, exact eight-case diagnostics and codec boundaries. The retained full run, typecheck and production image include the fsync completion refinement and explicit quarantine admission guard; inspect the validation artifacts for exact hashes and versions. Typecheck, production build, mounted Node22 smoke, actual two-stage Docker build and production-image smoke evidence are retained. Both container probes assert authenticated APIs/dashboard assets/SQL assets and live-mode rejection. PostgreSQL crash/restart/SCRAM/privilege/restore/fencing tests run against the private research cluster, with previous-phase files restored. Dependency findings changed from {count(before)} to {count(audit)}; no advisory was suppressed. Current validation artifacts are in [the validation directory](phase9/{args.validation_dir}/). The initial loaded rerun had one API startup timeout (281/282 passed); the subsequent full rerun passed without changing the original test or timeout.

{main_table}

The first full-stream controller had an integration failure: the acknowledgement gauge reached 1024, gap metadata persistence failed while the worker remained healthy, completions stopped at 256420, and transport continued. Its 66-minute partial run was stopped and retained. A deterministic 1000-conflict replay reproduces that frontend-capacity failure, while the bounded admission test avoids it without raising worker limits. A 128-item buffer calibration then showed excessive pauses; the final run uses 1024 items with the same 4MiB byte limit and eight concurrent fsync-aware jobs. No failed attempt is hidden or counted toward the full-window criterion.

The eight historical market failures are reproducible: four supply mismatches on Mayhem state, two non-native quote variants, and two stale/unknown original event times. {deployment_summary} No new protocol variant was enabled without complete evidence. All eight independent SDK buy/sell wire comparisons and 16 quote vectors match after the dependency migration. No unsafe token classification, imaginary quote, coverage recovery, eligible trade, profit or speed improvement is asserted.

Required evidence and limits:

- [WebSocket reliability](websocket-reliability.md)
- [Recovery coverage](recovery-coverage.md)
- [Eight-case market diagnosis](market-rejection-analysis.md)
- [Protocol review and disabled variants](verified-protocol-extensions.md)
- [End-to-end paper results](end-to-end-paper-results.md)
- [Extended mainnet report](long-duration-mainnet-report.md)
- [Dependency security](dependency-security-report.md)
- [Provider comparison](rpc-provider-comparison.md)
- [Matched performance and database measurements](performance-comparison.md)
- [Remaining funded blockers](remaining-funded-trading-blockers.md)

Acceptance is bounded by actual observations: tested retries and durable identity hold; real missing coverage is still partial/unrecoverable; unsupported market variants fail closed; provider independence remains unknown; no eligible positive paper entry/exit is claimed. The monitored process uses the captured source in its source-at-start directory. Later terminal-controller, observer-failure, unique-subscription acknowledgement, JSON-RPC error-detail and wall/monotonic discontinuity refinements are tested separately and were not hot-loaded into that process. The earlier failed/calibration runs remain separately attributed. Read-only research delivery does not establish a funded release.
''')
(out/'README.md').write_text('''# Phase 9 evidence and reproduction

Start with [the engineering report](../phase9-engineering-report.md). All network actions are bounded, explicit and read-only; the server still rejects live mode.

```sh
npm test
npm run typecheck
npm run build
node --import tsx scripts/phase9-mainnet.ts --run --seconds 7200 --max-candidates 120 --output docs/phase9/new-run-directory
node --import tsx scripts/phase9-market-diagnostics.ts --run --output docs/phase9/new-diagnostics.json
node --import tsx scripts/phase9-protocol-review.ts --run --output-dir docs/phase9/new-protocol-review
node --import tsx scripts/phase9-provider-evidence.ts --run --output docs/phase9/new-provider-evidence.json
node --import tsx scripts/phase9-performance-benchmark.ts --before-root /tmp/mintbot-phase9-before --runs 3 --output docs/phase9/new-performance.json
```

The mainnet CLI requires a new ledger directory. Default service endpoints are Solana public and PublicNode; environment endpoint configuration does not prove independent operators. Progress files are interim only; `evidence.json` is emitted after stopping, draining, fsync and ledger reload. No operator-independence claims are fabricated. All automatic retry/page/transaction/time/storage populations are bounded. SIGINT/SIGTERM request graceful stop in the final controller; partial/failed runs must not be counted as the requested full window.

Render final reports with `python3 scripts/phase9-report.py --run-dir <directory-under-docs/phase9> --validation-dir <validation-directory-under-docs/phase9>`. Without final evidence, status is interrupted/unfinalized unless `--running` explicitly asserts an active process. A final artifact only satisfies the requested window when supervisor elapsed time reaches the requested duration.

Use `python3 scripts/phase9-regression-validation.py --output docs/phase9/new-validation-directory` to preserve older phase artifacts that legacy tests refresh; it copies new helper outputs here before restoring originals. The before source tarball can be extracted to a separate directory for comparison; link compatible dependencies explicitly and retain the shared-dependency limitation. The matching A/A harness-at-run and its stale-load-label correction are retained.

Early failed install, smoke/build attempts and the database probe overlapping destructive fault tests are retained as diagnostics. They are not successful validation. Source/fixture hashes, actual final gates and preservation records distinguish those attempts from release evidence. The research process source was snapshotted before later corrections; do not imply it hot-loaded edits.
''')
smoke_path=validation/'clock-release/mainnet-smoke/evidence.json'
if smoke_path.exists():
 smoke=json.loads(smoke_path.read_text());ss=smoke['supervisor']
 with (root/'long-duration-mainnet-report.md').open('a') as target:
  target.write('\n## Final-source short smoke\n\nA separate 15-second read-only run using the delivered clock guard completed with '+str(smoke['notifications'])+' notifications, '+f(ss['elapsedMs']/1000)+' monotonic seconds and '+f(ss.get('wallElapsedMs',0)/1000)+' wall seconds, with no fatal ingestion error. It is retained in [the short smoke evidence](phase9/'+args.validation_dir+'/clock-release/mainnet-smoke/evidence.json). This verifies normal callback integration after the fix; it does not satisfy the two-hour target or prove complete chain coverage.\n')
with (out/'README.md').open('a') as target:
 target.write('\nCurrent finalized report reproduction:\n\n```sh\npython3 scripts/phase9-report.py --run-dir '+args.run_dir+' --validation-dir '+args.validation_dir+' --test-log '+args.test_log+'\n```\n\nCurrent validation and limitations are recorded in [validation-summary.json]('+args.validation_dir+'/validation-summary.json). The extended attempt was interrupted by a host wall/monotonic discontinuity; its two-hour monitored target remains unmet.\n')
(out/'report-status.json').write_text(json.dumps({'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'experimentFinal':complete,'requestedWindowComplete':window_complete,'runDirectory':str(run),'validationDirectory':str(validation),'testLog':args.test_log,'hostClockDiscontinuity':bool(discontinuity),'supervisorElapsedMs':s.get('elapsedMs'),'reportScope':'Measured retained evidence only; incomplete coverage and no eligible opportunity remain explicit','liveTrading':False},indent=2)+'\n')
print(json.dumps({'reportsGenerated':True,'experimentFinal':complete,'requestedWindowComplete':window_complete,'runDirectory':str(run),'supervisorSeconds':s.get('elapsedMs',0)/1000,'notifications':e.get('notifications'),'trades':len(trades)}))
