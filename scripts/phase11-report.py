"""Render only retained Phase11 measurements; no missing final artifact becomes a success."""
from pathlib import Path
import json,re,statistics,datetime,collections
D=Path('docs');O=D/'phase11';R=O/'runtime/mainnet-validated'
def read(path,default=None):
 p=O/path
 return json.loads(p.read_text()) if p.exists() else default
def table(headers,rows):
 cell=lambda x:str(x).replace('|','\\|').replace('\n',' ')
 return '| '+' | '.join(headers)+' |\n|'+'|'.join(['---']*len(headers))+'|\n'+'\n'.join('| '+' | '.join(cell(x) for x in row)+' |' for row in rows)
def write(name,text):(D/name).write_text(text.strip()+'\n')
final=read('runtime/mainnet-validated/evidence.json');e=final or read('runtime/mainnet-validated/run-progress.json',{});s=e.get('supervisor',{});j=e.get('journal',{});rows=e.get('rows',[])
ledger=e.get('ledger') or read('runtime/mainnet-validated/ledger.json',{});reviews=ledger.get('marketReviews',[]);trades=ledger.get('trades',[])
network=read('current-network-final/evidence.json',{});pump=read('pump-deployment/evidence.json',{});binary=next((x for x in pump.get('observations',[]) if x.get('programDataSha256')),{});layout=read('global-layout-review.json',{})
prior=read('phase10-forensics.json',{});providers=read('provider-validation.json',{});schema=read('official-schemas/evidence.json',{});profile=read('performance-instrumented.json',{});perf=read('performance-node22.json',{})
audit=read('dependency-audit.json',{}).get('metadata',{}).get('vulnerabilities',{}).get('total','unavailable')
tests=(O/'delivery-validation/after-tests.log').read_text() if (O/'delivery-validation/after-tests.log').exists() else ''
m=re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)',tests,re.S);testtext=f'{m[2]}/{m[1]} pass, {m[3]} fail' if m else 'Final full suite pending'
seconds=s.get('elapsedMs',0)/1000;duration=bool(final) and seconds>=1800 and abs(s.get('clockDiscontinuityMs',0))<=5000;status=('TERMINAL: host clock discontinuity; partial evidence retained' if s.get('state')=='terminal' else 'Final stopped experiment') if final else 'INTERIM; final evidence required'
counts=e.get('venueCounts',{});outcomes=read('candidate-outcomes.json',{});current_reconciliation=read('runtime-reconciliation.json',{})
mon=table(['Measure','Result'],[['Run',status],['Monotonic supervisor seconds',f'{seconds:.6f}'],['Wall supervisor seconds',s.get('wallElapsedMs',0)/1000],['Open / fully ACKed / disconnected seconds',' / '.join(f'{s.get(k,0)/1000:.3f}' for k in ['connectedMs','acknowledgedMs','disconnectedMs'])],['Clock discrepancy ms',s.get('clockDiscontinuityMs','unavailable')],['Connections / incidents',f"{s.get('connections',0)} / {s.get('incidents',0)}"],['Notifications',e.get('notifications',0)],['Selected candidates',len(rows) if final else e.get('candidates',0)],['Verified creations',sum(x.get('verifiedLaunches',0) for x in rows) if final else e.get('sample',{}).get('verifiedCreations',0)],['Paper reviews',len(reviews)],['Paper entries / exits',f"{sum(t.get('side')=='buy' for t in trades)} / {sum(t.get('side')=='sell' for t in trades)}"],['Active pending / quarantined',f"{j.get('activePending','unknown')} / {j.get('quarantined','unknown')}"],['Admission refusals',e.get('refused',0)],['Writer / pipeline fatal',f"{j.get('writerFailure')} / {e.get('pipeline',{}).get('fatal')}"],['1,800-second target met',duration],['Continuous coverage / independent providers / epoch policy','UNMET / UNMET / UNMET'],['Signing / broadcast / spending',False]])
venue_rows=[]
for venue in ['pump','pumpswap','raydium-cpmm','meteora-dlmm']:
 c=counts.get(venue,{});selected=[r for r in rows if r.get('event',{}).get('program')==venue]
 venue_rows.append([venue,c.get('notifications',0),c.get('creationHints',0),c.get('selected',0),sum(r.get('verifiedLaunches',0) for r in selected),sum(bool(r.get('evidence',{}).get('state')) for r in reviews if (r.get('evidence',{}).get('launch') or r.get('evidence',{}).get('state',{}).get('launch',{})).get('program')==venue)])
venue_table=table(['Venue','Notifications','Creation hints','Selected','Verified creations','Reviews with parsed state'],venue_rows)
source_rows=[[x['repository'],x.get('commit','unavailable'),x['path'],x.get('sha256',x.get('issue'))] for x in schema.get('sources',[]) if 'path' in x]
diagnostics=[]
for file,side in [('current-buy-simulations.json','buy'),('current-sell-simulations.json','sell'),('raydium-buy-simulation.json','buy with observed public inventory owner'),('raydium-buy-public-creator-simulation.json','buy with observed public creation payer')]:
 for r in (read(file,{}) or {}).get('rows',[]):
  success=bool(r.get('result',{}).get('simulation',{}).get('success')) or any(a.get('simulation',{}).get('success') for a in r.get('attempts',[]))
  diagnostics.append([r['venue'],side,'Actual unsigned simulation succeeded' if success else r.get('issue','See retained attempts; no successful simulation claimed'),file])
reason_counts=collections.Counter(reason for r in reviews for reason in r.get('reasons',[]))
verification=e.get('verificationRejectionCounts',{})
bench=[]
for scenario in sorted(set(r['scenario'] for r in perf.get('rows',[]))):
 values={side:[r for r in perf['rows'] if r['scenario']==scenario and r['adapter']==side] for side in ['before','after']}
 med={side:statistics.median(r['completedPerSecond'] for r in values[side]) for side in values}
 for side,rs in values.items():bench.append([scenario,side,len(rs),round(med[side],3),round(statistics.median(r['latencies']['end_to_end_ms']['p95'] for r in rs),3),round(statistics.median(r['latencies']['end_to_end_ms']['p99'] for r in rs),3)])
 bench.append([scenario,'after/before change','',f"{(med['after']/med['before']-1)*100:.3f}%",'',''])
latencies=table(['Actual run timer','Count','p50 ms','p95 ms','p99 ms'],[[name,h['count'],round(h['p50'],3),round(h['p95'],3),round(h['p99'],3)] for name,h in e.get('telemetry',{}).get('histograms',{}).items() if any(k in name for k in ['receipt_to_paper_decision','state_retrieval','queue_wait','fsync_ms'])])
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
write('phase11-engineering-report.md',f'''# Phase 11 engineering report

Generated {now}. **Working integration changes are delivered; end-to-end current-chain paper trading is not validated. Funded execution remains disabled.**

The final simulation wrapper also propagates the shared decision fence to inherited exits. The primary clock-discontinuity dataset predates that final two-module correction; its snapshots remain immutable. The final [release stop/owner probe](phase11/release-stop-owner-smoke.json) executes the delivered code, with [exact compiled core comparisons](phase11/loaded-runtime-coherence.json) and [earlier-run differences](phase11/primary-runtime-coherence.json). Its roughly ten seconds and the earlier control probe are excluded from the primary duration. No hot reload or final-code full monitoring window is claimed.

The existing research runner now supports all four registered venues with bounded per-venue candidate sampling and gap/recovery requests. A sampling hint never replaces strict finalized transaction verification. The final release probe is a separate ten-second stop/owner check, not an extension of the primary run. Matching uses program plus signature, preventing a multi-venue transaction from being assigned to the wrong selected receipt. Default legacy server selection and Phase10 CLI defaults remain available; the explicit research profile selects the Phase11 entrypoint.

Coverage epochs durably retain historical coverage evidence by hash, separately measure the new window, and remain unauthorized pending independent policy review. Offline quarantine retries require a current WAL/plan-bound, expiring authority artifact and expected event fingerprints. Durable authorization and per-review JSONL audit records precede/follow the WAL mutations. A shared exclusive decision-owner fence refuses automatic stale-container takeover. Authenticated global stop writes a sticky file, fences queued paper commits, and stops the research controller at its next sampling poll.

{mon}

{venue_table}

Validation: **{testtext}**, including all original 299 tests. New tests cover shared-signature identities, sampling boundaries, retained coverage epochs, operator authority, durable CLI review/replay, queued-commit stop fencing, inherited simulation-wrapper exit fencing, and refusal to steal a foreign owner lock. Node22 clean install/build, authenticated API/dashboard/live-mode rejection, PostgreSQL faults/recovery, current RPC reads, isolated SDK comparisons and disk-backed performance controls are retained under [Phase11 evidence](phase11/README.md). Audit: **{audit} findings at capture**.

The first full suite had a server-startup timeout during concurrent build work; a subsequent run had `EADDRINUSE`. Both logs remain in `validation` and `final-validation`. The clean Docker attempt first exposed an incorrect diagnostic import; the corrected uncached build and later runtime build passed. The first research bootstrap rejected oversized history before monitoring; it is excluded. No failed result was overwritten as a pass.

Current Pump still has deployment slot {binary.get('observedDeploymentSlot')} and ELF SHA-256 `{binary.get('elfReferencedSha256')}`. The 1096-byte Global leaves a nonzero eight-byte tail after the official 1088-byte schema. Pin, schema acceptance and financial assumptions remain unchanged. Current alternate-venue loader pins match; publication of an IDL or matching header is not new source/binary equivalence proof. The primary run terminated on a host clock discontinuity after 584.319388 monotonic seconds across 7854.626 supervisor wall seconds. Its 7270.307-second discrepancy is excluded from monitored coverage; the 1800-second target is unmet. The separate 10-second operational control probe is never added to that window.

Required reports: [Pump](current-pump-compatibility.md), [venues](market-venue-coverage.md), [current paper results](current-chain-paper-validation.md), [coverage/quarantine policy](coverage-and-quarantine-policy.md), [providers](provider-agreement-validation.md), [performance](performance-validation.md), [operations](operational-integration.md), [security/blockers](security-and-release-blockers.md).
''')
write('current-pump-compatibility.md',f'''# Current Pump compatibility

**BLOCKED.** Reviewed deployment slot remains 458921440. Refreshed finalized Program/ProgramData capture observes {binary.get('observedDeploymentSlot')}. Full allocation SHA-256: `{binary.get('programDataSha256')}`. ELF referenced extent SHA-256: `{binary.get('elfReferencedSha256')}`. Captured bytes match Phase10; no deployment whitelist update occurred. [Raw loader evidence, full binary, ELF and official revisions](phase11/pump-deployment/evidence.json).

The official Global schema occupies {layout.get('serializedSchemaBytes')} bytes including its discriminator; current allocation is {layout.get('actualBytes')}. Unknown tail: `{layout.get('unparsedTailHex')}`; zero tail: {layout.get('allTailZero')}. [Field offsets and exact retained tail](phase11/global-layout-review.json), [finalized account owner/context and diagnostic decode](phase11/current-network-final/evidence.json). The tail is not labeled as a field, padding, fee or reserve without authoritative linkage. The production adapter still rejects this allocation.

Official Pump docs/IDL remain at `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`. Prior Mayhem supply examples, native/non-native quotes, depth, configurable creator fees, reward/retained-fee custody and changed creation contracts remain investigable but unsupported for financial execution. A 2e15 mint supply versus 1e15 curve total is neither automatically malicious nor automatically safe. New creation names are sampling hints only; unknown layouts fail strict verification. No concentration, authority, liquidity, transfer, identity or sell-route rule changed.

Defensibly known: finalized provider-reported loader identity, deployment slot, exact binary/account bytes, official published schemas and recorded fixture behavior. Unknown: verified source-to-binary build correspondence and every changed supply/custody/fee/quote/wire behavior. Successful current compatible two-sided Pump simulation remains unavailable. No variant is enabled until that entire proof chain and safety regressions pass. Official [Pump repository](https://github.com/pump-fun/pump-public-docs) and [Solana loader documentation](https://solana.com/docs/core/programs/program-deployment) explain published contracts and loader structure, not this binary's financial equivalence.
''')
write('market-venue-coverage.md',f'''# Market venue coverage

{venue_table}

All four programs share the approved bounded supervisor and the existing finalized verifier, MarketService, integer adapters, simulation gate and durable file-backed paper ledger. Fair sampling has per-venue spacing/caps; notification count is not creation coverage. Hints include newer initializer names so unsupported variants are visible and rejected rather than silently whitelisted. Missing or malformed attribution remains quarantined or strictly rejected. Confirmed receipts never become finalized proof by age or name alone.

{table(['Program','Observed deployment slot','Reviewed pin','Header matches'],[[x['program'],x.get('observedSlot'),x['reviewedSlot'],x['reviewedPinMatches']] for x in network.get('deployments',{}).get('observations',[])])}

A genuine current PumpSwap creation was verified and rejected by market parsing. Its 287-byte account exactly matches the official Pool schema, but it has a non-native quote with SOL as base and negative virtual quote reserves; this route is outside reviewed support. [Original launch, finalized transaction and subsequent account inspection](phase11/alternate-candidate-inspections.json) retain the failed case without treating the subsequent read as fresh eligibility. The account-length match alone does not authorize its financial path.

Current inspection of historical addresses parses native-quote PumpSwap and Raydium accounts, fees, vaults and integer buy/sell quotes; selected DLMM inspection rejects for insufficient liquidity or unsupported fees. These are current-state diagnostics with historical subjects, never new launch events. Current captured liquidity/fees/owners/accounts and timings are in [current network evidence](phase11/current-network-final/evidence.json). A successful diagnostic on one pool does not generalize to every pool or initializer.

{table(['Venue','Read-only route','Outcome','Artifact'],diagnostics)}

{table(['Official repository','Captured revision','File','SHA-256 or issue'],source_rows)}

[Official source bytes and URLs](phase11/official-schemas/evidence.json) are retained alongside existing reviewed schemas. Raydium source remains at its reviewed revision; current DLMM SDK repository revision is `1532e540db41ac405dbf4c5bb2ddfceaa1f98ff1` versus reviewed decoder revision `af36dd53ab180783ccecda306926189a4700953c`. Its selected LbPair/BinArray/Bin schemas and PumpSwap Pool/GlobalConfig compare equal ignoring documentation in [schema comparison](phase11/official-schema-diff.json). Equality of those types does not validate every changed instruction or financial behavior. No changed DLMM instruction/layout is enabled from an SDK revision alone. Exact fixture comparisons are [wire](phase11/builder-reference.json) and [quotes](phase11/quote-reference.json); these do not prove fresh opportunity safety. Receipt-to-decision histograms belong to the live run, while inspection elapsed times are separate.
''')
write('current-chain-paper-validation.md',f'''# Current-chain paper validation

**End-to-end genuine fresh paper entry and exit remain UNMET.** No old pool, public-account impersonation, SDK vector or unit fixture is counted as a fresh launch or trade.

{mon}

{table(['Recorded market review reason occurrences','Count'],sorted(reason_counts.items()))}

{table(['Strict creation verification failure','Count'],sorted(verification.items()))}

[Final per-selected-receipt accounting](phase11/candidate-outcomes.json) is generated only after the final WAL is stopped and replayed. Current finalized distribution: {outcomes.get('counts','Pending final evidence')}. This population is distinct from all delivered notifications, refusal records and quarantine ownership.

{table(['Venue','Read-only route','Outcome','Artifact'],diagnostics)}

The current pipeline preserves the receipt/program/signature/time, verifies finalized creation and custody, retrieves fresh market/safety/holder data, checks quotes, strategy/capital, current coverage/independent provider agreement, and both unsigned simulations before the existing exact ledger can record an entry. Original exit rules and fresh quote accounting remain; no new claim of independently simulated actual exit execution is made. The primary run ended after clock-discontinuity detection, not after its requested duration. Unknown provider authorization or unreviewed epoch policy cannot be bypassed to manufacture a fill. Current non-Pump simulation success is route evidence only; public inventory is real, never allocated to paper positions.

[Buy diagnostics](phase11/current-buy-simulations.json), [sell diagnostics](phase11/current-sell-simulations.json). Raydium buy diagnostics failed reservation capacity for two real public payers and payer balance/ownership checks for a third; that is not a failed RPC swap or token-risk conclusion. A construction/inventory/liquidity failure is distinguished from a simulation executed with an error. No positive current-chain P&L or validated real entry→exit cycle is claimed.
''')
write('coverage-and-quarantine-policy.md',f'''# Coverage epochs and quarantine policy

Phase10 evidence is immutable. Its 79 quarantines reproduce 78 truncated invocation histories and one incomplete invocation stack. All 357 refusal records are retained: 354 fingerprint conflicts and three capacity refusals; six duplicates are separate. Only {prior.get('conflictsWithRetainedPayload')} refusals retain the older payload, so most conflicts cannot be assigned to a fork, provider corruption, truncation or malicious token. [Full per-record analysis](phase11/phase10-forensics.json).

A compact [historical coverage index](phase11/coverage-history.json) retains the complete original evidence file's SHA-256, final gap and pending ownership. A new `coverage-epoch.json` is created with exclusive write and file/directory fsync; it records its own UUID, source-index hash, original artifact reference, selected programs and unresolved history. Bounded finalized rereads of all 79 old signatures are retained in [RPC evidence](phase11/quarantine-finalized-rpc.json); none was retrievable in that capture, and original bytes/time remain unchanged. A clean local current window can be measured separately, but **independent policy review is UNMET and authorization always remains unknown** in this implementation. A new directory/UUID, cleared current queue or operator name never grants paper/funded permission.

Before any future policy permits current-window research, an independent review must define exact epoch start/finalized anchors, startup lookback, per-venue completeness, maximum gap/recovery bounds, attribution of shared-signature conflicts, stale replay exclusion, independent same-snapshot evidence and stop/restart ownership. This delivery does not supply or self-approve that policy. Historical gaps stay visible even if a future current window is clean; funded permission is always separate.

The offline `phase11-quarantine-review.ts --apply --journal <stopped-copy> --plan <plan> --output <new-audit.jsonl>` acquires the existing exclusive WAL lock. Every expected event fingerprint must match retained bytes. Retain never drops ownership. Retry additionally requires `--retry-authority <artifact>`: exact WAL/plan SHA-256, explicit distinct named approver, one-hour maximum validity and `liveAuthorized:false`. Names are operator configuration, not verified independent human identities. Header authority and per-commit JSONL records are fsynced; WAL reviews preserve original observations/timestamps and lifetime attempts, with at most three reviews/ten attempts. Retry reopens coverage before releasing quarantine, and restarted ingestion labels the original receipt as restart/history, never live freshness.

[Durable retain audit on a forensic copy](phase11/quarantine-review-audit.jsonl) leaves all 79 quarantines and pending identities owned. Originals remain untouched. The current stopped-run forensic reconstruction also accounts for all 260 fingerprint refusals and the single truncated-log quarantine in [per-record current analysis](phase11/current-run-forensics.json). None of these conflicts has a retained older payload, so the reason for the byte mismatch remains unproven. New retry CLI tests exercise missing authority, exact bindings, checkpoint/reload and pending gap retention. The full stopped current WAL is diagnosed in [runtime reconciliation](phase11/runtime-reconciliation.json); current quarantines: {j.get('quarantined','pending')}, active work: {j.get('activePending','pending')}.

Current gaps:

```json
{json.dumps(j.get('gaps',[]),indent=2)}
```

Partial/unrecoverable pagination remains incomplete. Recovery cursors and admitted anchors are provider observations, not proof of all missing events. Unavailable finalized transactions are not proof that the transaction never existed. No diagnostic replaces original WAL payloads or timestamps.
''')
write('provider-agreement-validation.md',f'''# Provider agreement validation

**UNMET.** No authenticated independent-provider configuration is present in the relevant environment or local configuration. [Configuration-presence audit](phase11/provider-configuration.json) excludes credentials and endpoint values. The two public endpoint diagnostics report {providers.get('status','unavailable')} and eligibility {providers.get('eligible',False)}. Reasons: {'; '.join(providers.get('reasons',[]))}.

[Provider-specific genesis, statuses, banks, owners/digests and failures](phase11/provider-validation.json), [per-method account/transaction evidence](phase11/provider-method-evidence.json). Distinct hostnames, attribution labels, matching genesis, equal bytes at different banks, availability or an SDK quote do not establish independent operators or exact bank equality. `minContextSlot` is only a lower bound. Unknown/disagreement remains blocked; no candidate quote-bank authorization is claimed. Source publication and loader matches do not provide infrastructure authentication.
''')
write('performance-validation.md',f'''# Phase 11 performance validation

{table(['Scenario','Side','Runs','Median completed/s','Median per-run p95 ms','Median per-run p99 ms'],bench)}

The exact Phase10 delivered source was reconstructed from the Phase11 source-at-start archive, using the same dependencies. The tested ingestion/engine module graph is unchanged: these are **A/A controls**, not evidence that new selection, stop or coverage code speeds up ingestion. Three alternating pairs on Node22 use a real host-filesystem `/tmp` bind with file and directory fsync unchanged. An API smoke briefly overlapped benchmark setup; other host processes remain uncontrolled. The live mainnet observer began after both benchmark populations finished. [Exact command, filesystem/device and load scope](phase11/performance-command.json), [raw jobs, queues/latencies/fsync/CPU/GC](phase11/performance-node22.json).

A separate [instrumented pair](phase11/performance-instrumented.json) captures JSON call/time, GC, scheduling observations and journal grouping; [command](phase11/performance-instrumented-command.json). Instrumentation changes absolute performance and must not be mixed with unprofiled controls. Positive or negative A/A differences are variability signals; no speedup or stable root cause is claimed. The original Phase9 13.4% and Phase10 Node20 15.5% / disk-backed Node22 4.9% decreases remain disclosed; Phase10 RAM-backed controls remain excluded from storage-durability claims.

Phase10's 110 incidents split into 107 transport faults plus three backpressure pauses. Of the transport faults, 92 report `WS_ERR_INVALID_CLOSE_CODE`, five HTTP429 handshakes, six handshake timeouts, three stale-receipt incidents and one heartbeat timeout. [Exact retained analysis](phase11/phase10-forensics.json). Invalid close frames are an observed protocol/transport error, not proof of a specific provider root cause. No ws parser validation or reconnect safety budget was relaxed.

{latencies}

Current p50/p95/p99 receipt-to-decision, market retrieval, queue/fsync grouping, CPU/memory, GC, rate limits and event-loop samples are retained in [the actual run](phase11/runtime/mainnet-validated/). Backfill and live share existing bounded scheduling and fsync acknowledgement. A decoded count, open socket or throughput benchmark is not continuous chain coverage. No risk, liquidity or durability threshold changed.
''')
write('operational-integration.md',f'''# Supported operational integration

Use `npm run research:monitor:all -- --run --seconds 1800 --output <new-directory>` or the explicit `compose.research.yaml` profile. The Phase11 wrapper seals compiled Node22 sources/config/lock and an epoch before importing the shared Phase9 pipeline; there is no parallel research engine. [Actual launch/image/arguments](phase11/runtime-launch.json), [runtime manifest](phase11/runtime/mainnet-validated/runtime-manifest.json), [Compose expansion](phase11/compose-validation.json).

| Component | Supported role/ownership |
|---|---|
| Default server monitor | Existing opt-in legacy lifecycle; unchanged unless the explicit research overlay is used |
| Research sidecar | One bounded four-venue decision owner, fsynced WAL and isolated file-backed paper ledger |
| Dashboard server in overlay | Authenticated projections/control, `MONITOR_PROGRAMS` empty, `REAL_MARKET_PAPER=false` |
| Research data mount | Read-only to dashboard; writable only to the research owner |
| Research control mount | Shared writable stop/owner namespace, separate from ledger/status volume |
| PostgreSQL intents | Separate read-only simulation diagnostics and fault tests; no second live paper decision owner |

`RESEARCH_OWNER_PATH` is exclusively created, file/directory fsynced and token-checked on graceful release. It never interprets a foreign PID as a dead container and never automatically steals a stale lock. Crash recovery requires stopping every possible owner, preserving the lock/ledger/audit, inspecting in-flight effects and explicitly clearing the abandoned scope offline. A second run name does not bypass a shared owner lock. Different deliberately configured namespaces require separate operational review.

Authenticated `/api/control` stop/kill also persists `RESEARCH_STOP_PATH`. Its response says **requested**, not completed. The sidecar notices at its next five-second sample, stops intake, marks its ledger stopped/killed and drains. The sticky file is checked synchronously inside paper entry/exit transactions, including queued work. A transaction already executing before the file exists can finish; operators must confirm the stopped snapshot and process exit. Stop intent does not auto-clear on API reset/start or a new run name. Restarts need a fresh retained output directory and deliberate offline control review. Startup rejects simultaneous legacy monitor/server market decisions when shared research control is selected.

[Authenticated dashboard reading real updates](phase11/dashboard-sidecar-smoke.json), [final production API/live rejection](phase11/production-delivery-smoke.json), [authenticated sticky stop/reset and conflicting topology](phase11/control-api-smoke.json), [earlier compiled owner refusal and API stop/drain](phase11/operational-stop-owner-smoke.json), [final corrected-wrapper release probe](phase11/release-stop-owner-smoke.json), [fault/regression tests](phase11/delivery-validation/after-tests.log). Compose defaults to 1,800 seconds and all four venues, no automatic sidecar restart, init, read-only root, dropped capabilities and a coverage/policy-gated health check. A healthy HTTP server is not authorized research coverage.

The original file-backed ledger and SQL intent ledger are separate durability domains. Tests/diagnostics do not establish atomic file/SQL ownership or production HA/PITR. No signer, broadcaster, funding route or automatic promotion exists.
''')
write('security-and-release-blockers.md',f'''# Security validation and release blockers

Full suite: **{testtext}**, original 299 preserved. Audit: **{audit} advisories at capture**. The reviewed local bigint tarball, integrity/license and narrow overrides remain unchanged. Node22 uncached two-stage build and actual image/API/live-mode rejection are retained. Failed initial build/test/bootstrap evidence remains visible. PostgreSQL authenticated fault/rotation/fencing/backup and private-cluster crash/restart tests run in the complete suite; read-only simulation SQL diagnostics use isolated temporary clusters and do not operate production databases.

No current Pump variant/pin/Global size is enabled without source/build, finalized creation/custody/supply/fees, exact integer quotes/SDK metas/wire and real two-sided simulation evidence. No private key, live signature, broadcast or spending occurs. Public-account simulation with `sigVerify:false` is a diagnostic, not authorization or inventory ownership for paper funds.

Remaining release blockers:

- Current Pump source-to-binary/financial correspondence and the nonzero Global tail remain unknown.
- Current and historical gaps/quarantines remain unresolved. New epochs cannot authorize themselves; independent current-window research policy review is unmet.
- Authenticated independently operated providers and a defensible common snapshot/quote-bank comparison remain unavailable.
- Genuine current creation→safe two-sided simulation→durable paper entry→fresh executable exit/P&L remains unproven when no eligible event qualifies. Historical pool diagnostics do not satisfy it.
- Performance signs vary across A/A controls; historical causal attribution and production latency SLO remain unproven.
- Shared-filesystem ownership/stop procedures require operational review; no distributed lease or automatic crash takeover is claimed. SQL/file atomic ownership and production backup/HA remain separate work.
- Independent code/security review, isolated spend/signing authorization and separately authorized funded settlement validation remain outside this delivery. No funded capability was introduced.
''')
(O/'report-status.json').write_text(json.dumps({'generatedAt':now,'finalEvidence':bool(final),'durationTargetMet':duration,'seconds':seconds,'continuousCoverage':False,'independentProviders':'unmet','epochPolicyReview':'unmet','paperEntries':sum(t.get('side')=='buy' for t in trades),'paperExits':sum(t.get('side')=='sell' for t in trades),'endToEndPaperValidated':False,'liveTrading':False},indent=2)+'\n')
print(json.dumps({'final':bool(final),'seconds':seconds,'notifications':e.get('notifications',0),'tests':testtext,'paperTrades':len(trades)}))
