import { loadResearchProviders, safeResearchIssue } from "../src/research/provider-config.js";
import { paperValuation } from "../src/market/projection.js";
import { creationHint, researchPrograms, researchIdentityIssue } from '../src/research/candidates.js';
import { epochCoverage, type CoverageEpoch } from '../src/research/epochs.js';
import { assertResearchNotStopped } from '../src/research/stop-control.js';
import { MonitorSupervisor } from "../src/research/monitor-supervisor.js";
import { ResearchAdmission } from "../src/research/admission.js";
import { researchCoverage } from "../src/research/coverage.js";
import {RecoveryCoordinator,HttpRecoveryRpc}from"../src/backfill.js";
import { eventIdentity } from "../src/event-journal.js";
import { createHash } from "node:crypto";
import{RotatingJsonl}from"../src/rotating-jsonl.js";
import{open}from"node:fs/promises";
import { researchLaunches } from "../src/research/projection.js";
/** Explicitly bounded real-time mainnet observation. Dedicated fsynced paper ledger; no signing/submission. */
import { SimulationGatedPaper } from "../src/simulation/paper-gate.js";
import { SimulationRpc } from "../src/simulation/rpc.js";
import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import { rename, stat } from "node:fs/promises";
import { ProviderConsistency, boundedProviderRead, MAINNET_GENESIS } from "../src/research/providers.js";
import { ResearchSnapshotSchema } from "../src/research/status.js";
import { mkdir, writeFile, access } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { SolanaMonitor, VERIFIED_PROGRAMS, type ProgramObservation } from "../src/chain.js";
import { AsyncEventJournal } from "../src/async-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import { VerifiedReadRpc } from "../src/verified-rpc.js";
import { MarketRpc } from "../src/market/rpc.js";
import { MarketService } from "../src/market/service.js";
import { RealMarketPaper, initializeMarketLedger } from "../src/market/paper.js";
import { marketPolicy } from "../src/market/policy.js";
import { initial, Store, load } from "../src/store.js";
import { StrategySchema } from "../src/model.js";
import { readFile } from "node:fs/promises";
import { Telemetry } from "../src/telemetry.js";
import { publicEvidence, type MarketBatch } from "../src/market/types.js";
import type { AccountEvidence, ParsedChainTransaction, VerifiedLaunch } from "../src/verified-decoders.js";
const args = process.argv.slice(2);
if (!args.includes("--run")) throw Error("Use --run for bounded read-only network experiment");
const opt = (n: string, d: string) => args.includes(n) ? args[args.indexOf(n)+1]! : d;
const seconds = Number(opt("--seconds", "7200")), maxCandidates = Number(opt("--max-candidates", "120"));
if (!Number.isInteger(seconds) || seconds < 15 || seconds > 7200 || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 240) throw Error("Experiment bound");
const venueNames=researchPrograms(opt('--venues','pump'),VERIFIED_PROGRAMS);
const selectedPrograms=VERIFIED_PROGRAMS.filter(p=>venueNames.includes(p.name));
const epochPath=opt('--coverage-epoch','');
const epoch:CoverageEpoch|undefined=epochPath?JSON.parse(await readFile(epochPath,'utf8')):undefined;
const stopPath=process.env.RESEARCH_STOP_PATH;
assertResearchNotStopped(stopPath);
const lastByVenue=new Map<string,number>();
const venueCounts:Record<string,{notifications:number;creationHints:number;selected:number;unverifiableIdentities:number}>=Object.fromEntries(venueNames.map(v=>[v,{notifications:0,creationHints:0,selected:0,unverifiableIdentities:0}]));
const providerConfigs = await loadResearchProviders();
const consistency = new ProviderConsistency(providerConfigs);
const output = opt("--output", `docs/phase9/mainnet-${Date.now()}`);
await mkdir(output, {recursive: true});
try { await access(`${output}/ledger.json`); throw Error("Use a new experiment directory; existing ledger preserved"); }
catch(e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
const endpoint = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const ws = process.env.SOLANA_WS_URL ?? "wss://api.mainnet-beta.solana.com";
const identityRefusalCount=()=>Object.values(venueCounts).reduce((n,v)=>n+v.unverifiableIdentities,0);
const coverageJournal=(j:Parameters<typeof researchCoverage>[1])=>({...j,unverifiableIdentities:identityRefusalCount()});
const metrics = new Telemetry(), startedAt = Date.now(), startMono = performance.now();
const captured: unknown[] = [], rows: any[] = [], samples:any[]=[], gaps:any[]=[], rpcIssues:any[]=[];
const cpuStart=process.cpuUsage(),resourceStart=process.resourceUsage(), delay=monitorEventLoopDelay({resolution:20});delay.enable();
let gcCount=0,gcMs=0,captureBytes=0,lastSelected=-Infinity,skippedSampling=0,creationNotifications=0,captureDropped=0,shuttingDown=false,stopRequested=false;
const gc=new PerformanceObserver(list=>{for(const e of list.getEntries()){gcCount++;gcMs+=e.duration;}});gc.observe({entryTypes:["gc"]});
function retain(record:unknown){const bytes=Buffer.byteLength(JSON.stringify(record));if(captureBytes+bytes>64*1024*1024||captured.length>=2000){captureDropped++;return;}captured.push(record);captureBytes+=bytes;}
function issue(stage:string,error:unknown){const e=error as any;rpcIssues.push({at:Date.now(),stage,message:safeResearchIssue(error),httpStatus:Number.isInteger(e?.httpStatus)?e.httpStatus:undefined,rpcCode:Number.isSafeInteger(e?.rpcCode)?e.rpcCode:Number.isSafeInteger(e?.code)?e.code:undefined,transportCode:undefined});if(rpcIssues.length>500)rpcIssues.shift();if(e?.httpStatus===429||/\b(?:HTTP\s+429|Unexpected server response:\s*429)\b/.test(String(e?.message)))metrics.increment("research.rpc_rate_limits");}

class CaptureVerifier extends VerifiedReadRpc {
  override async transaction(signature: string): Promise<ParsedChainTransaction | null> {
    const result = await super.transaction(signature);
    if (result) retain({method:"getTransaction", commitment:"finalized", observedAt:Date.now(), signature,result});
    return result;
  }
  override async accounts(keys: string[]): Promise<AccountEvidence> {
    const result = await super.accounts(keys); retain({method:"getMultipleAccounts",keys,result,observedAt:Date.now()}); return result;
  }
}
class CaptureMarket extends MarketRpc {
  override async accounts(keys: string[], slot: number): Promise<MarketBatch> {
    try {const result = await super.accounts(keys,slot); retain({method:"market.getMultipleAccounts",keys,result}); return result;}catch(error){issue("market.accounts",error);throw error;}
  }
  override async holders(mint:string,program:string,slot:number) {
    const addresses = await super.holders(mint,program,slot);
    retain({method:"market.getProgramAccounts",mint,program,minimumSlot:slot,addresses,observedAt:Date.now()}); return addresses;
  }
  override async deployment(program:string,slot:number){try{return await super.deployment(program,slot);}catch(error){issue("market.deployment",error);throw error;}}
  override async fees(addresses:string[]){try{return await super.fees(addresses);}catch(error){issue("market.fees",error);throw error;}}
}
const strategy = StrategySchema.parse(JSON.parse(await readFile("config/strategy.json","utf8")));
// Original strategy safety/capital settings preserved. Only entry age policy is explicitly selected below.
const state = initializeMarketLedger(initial(strategy));
state.running = true;
const store = new Store(state, `${output}/ledger.json`, metrics, 64, true);
await store.paperTransaction(() => undefined);
const chainIdentity=await boundedProviderRead({id:"primary",endpoint},"getGenesisHash",[]);
if(chainIdentity!==MAINNET_GENESIS)throw Error("Read-only monitor requires verified mainnet genesis");
retain({method:"getGenesisHash",provider:new URL(endpoint).host,observedAt:Date.now(),result:chainIdentity});
const reader=new CaptureMarket(endpoint,metrics);

const providerAssessments:unknown[]=[];
const paper = new SimulationGatedPaper(new RealMarketPaper(store, metrics, marketPolicy("finalized-paper-research"),()=>assertResearchNotStopped(stopPath)),reader,new SimulationRpc(endpoint,metrics),{providerAgreement:async state=>{
 const coverage=epoch?epochCoverage(epoch,monitor.snapshot(),coverageJournal(journal.status()),pipeline.status().fatal):researchCoverage(monitor.snapshot(),coverageJournal(journal.status()),pipeline.status().fatal);
 if(coverage.status!=="verified")return coverage;
 const assessment=await consistency.inspect({signature:state.launch.signature,accounts:state.accounts.map(a=>a.address),minimumSlot:state.slot});
 providerAssessments.push(assessment);if(providerAssessments.length>100)providerAssessments.shift();
 const exactBank=assessment.observations.every(o=>o.state?.slot===state.slot);
 return {status:assessment.status==="verified"&&exactBank?"verified":assessment.status==="failed"?"failed":"unknown",reasons:[...assessment.reasons,...(exactBank?[]:["Provider comparison does not match the quote bank"])]};
}});
const market = new MarketService(paper, reader,metrics);
const verifier = new CaptureVerifier(endpoint,process.env.RESEARCH_BOUNDED_VERIFICATION==='true'?{minimumIntervalMs:350,deadlineMs:8000,maximumAttempts:2,capacity:16,metrics}:undefined);
const journal = await AsyncEventJournal.open({path:`${output}/ingestion.wal`},metrics);
const raw=await RotatingJsonl.open(`${output}/observations.jsonl`,{maxBytes:8*1024*1024,maxArchives:2,capacity:128},metrics);
const refusalAudit=await RotatingJsonl.open(`${output}/refusals.jsonl`,{maxBytes:4*1024*1024,maxArchives:2,capacity:256},metrics);
const identityAudit=process.env.RESEARCH_IDENTITY_DIAGNOSTICS==='true'
 ?await RotatingJsonl.open(`${output}/wire-identity.jsonl`,{maxBytes:16*1024*1024,maxArchives:2,capacity:256},metrics):undefined;
let identityAuditBytes=0,identityAuditDropped=0,identityAuditRecords=0;
function identityTrace(record:Record<string,unknown>){
 if(!identityAudit)return;
 const bytes=Buffer.byteLength(JSON.stringify(record))+1;
 if(identityAuditBytes+bytes>32*1024*1024){identityAuditDropped++;return;}
 identityAuditBytes+=bytes;identityAuditRecords++;
 void identityAudit.append(record).catch(failIngestion);
}
const identityAuditStatus=()=>({enabled:!!identityAudit,records:identityAuditRecords,bytes:identityAuditBytes,dropped:identityAuditDropped,storage:identityAudit?.status(),scope:'Bounded first/every-1000th/invalid wire population and linked admission results; public incoming envelopes only. Sanitized captures expose byteExact and original SHA; no raw endpoint credentials.'});
const refusalCounts:Record<string,number>={};
async function recordRefusal(event:ProgramObservation,status:string,reason?:string){
 const category=reason??status;refusalCounts[category]=(refusalCounts[category]??0)+1;
 const id=eventIdentity(event),previous=journal.pending.get(id),completed=journal.completed.get(id);
 await refusalAudit.append({at:Date.now(),id,status,reason,event,observedFingerprint:createHash("sha256").update(JSON.stringify([event.slot,event.failed,event.logs])).digest("hex"),retainedObservation:previous?.observation,retainedFingerprint:completed?.fingerprint,wireIdentitySha256:event.wireIdentitySha256,scope:"Original refusal diagnostic; fork versus provider corruption/truncation is not inferred. WAL gap remains authoritative."});
}
const recoveryProgress:unknown[]=[];
async function persistProgress(record:unknown){recoveryProgress.push(record);if(recoveryProgress.length>128)recoveryProgress.shift();const f=await open(`${output}/recovery-progress.tmp`,"w",0o600);try{await f.writeFile(JSON.stringify(recoveryProgress));await f.sync();}finally{await f.close();}await rename(`${output}/recovery-progress.tmp`,`${output}/recovery-progress.json`);const d=await open(output,"r");try{await d.sync();}finally{await d.close();}}

let head = 0, notifications = 0, refused = 0;
const pipeline = new EventIngestion({ journal, metrics, capacity:8,enrichmentConcurrency:2,maxAttempts:1,observationIssue:researchIdentityIssue,
  enrich: async (event,_launches,freshness,timing) => {
    const row = rows.find(r => r.event.program === event.program && r.event.signature === event.signature);
    if(!row)return [];
    await market.observe(event,"confirmed",row.receiptProvider);
    try {
      const provisional = await metrics.measureAsync("phase9.confirmed_preparation_ms",()=>verifier.provisional(event.program,event.signature,event.slot));
      if (provisional) { retain({method:"confirmedPreparation",...provisional}); row.confirmedPreparationAgeMs=Date.now()-event.observedAt; }
    } catch(e) { row.preparationIssue=safeResearchIssue(e);issue("confirmed-verification",e); }
    const deadline = Math.min(startedAt + seconds*1000+45000,event.observedAt+50000);
    do {
      try {
        const launches = await metrics.measureAsync("market.transaction_verification_ms",()=>verifier.verify(event.program,event.signature,event.slot));
        row.finalityPolls++;
        if (launches !== null) {
          row.finalizedVerificationAgeMs=Date.now()-event.observedAt;
          row.verifiedLaunches=launches.length;
          return launches.map(l=>Object.defineProperty({...l,freshness:{...freshness, chainHeadSlot:head,
            ...(l.blockTimeMs !== undefined ? {eventTimeMs:l.blockTimeMs}: {})}},"receiptMonoMs",{value:timing.receiptMonoMs,enumerable:false}));
        }
      } catch(e) { row.verificationIssue=safeResearchIssue(e);issue("finalized-verification",e); return []; }
      await new Promise(r=>setTimeout(r,2000));
    } while(Date.now()<deadline&&!stopRequested);
    row.verificationIssue="Finalized creation unavailable within bounded wait"; return [];
  },
  persist:async event=>{await raw.append({...event});},
  strategy:async (event,_launches,_identity,enrichment)=> {
    const row = rows.find(r=>r.event.program===event.program&&r.event.signature===event.signature);
    if(!row)return;
    for (const launch of enrichment as VerifiedLaunch[]) {
      row.decision = await market.evaluate(launch);
      row.decisionAgeMs=Date.now()-event.observedAt;
      row.receiptToDecisionMonoMs=performance.now()-(event.receivedAtMonoMs??(startMono+row.receivedMonoOffsetMs));
      metrics.observe("research.receipt_to_paper_decision_ms",row.receiptToDecisionMonoMs);
    }
  },
});
const admission=new ResearchAdmission(pipeline,metrics);
let resolveFailure!:()=>void;const failureSignal=new Promise<void>(resolve=>{resolveFailure=resolve;});
function failIngestion(error:unknown){issue("ingestion.fatal",error);monitor.failClosed();resolveFailure();}
const recoveryRpcs=[new HttpRecoveryRpc(endpoint,5000,4*1024*1024,"finalized"),new HttpRecoveryRpc(process.env.SOLANA_SECONDARY_RPC_URL??"https://solana-rpc.publicnode.com",5000,4*1024*1024,"finalized")];
let recoveryProvider=0;
const recovery = new RecoveryCoordinator(pipeline,{getSlot:()=>{recoveryProvider=monitor.snapshot().provider;return recoveryRpcs[recoveryProvider]!.getSlot();},getSignaturesForAddress:(a,o)=>recoveryRpcs[recoveryProvider]!.getSignaturesForAddress(a,o),getTransaction:s=>recoveryRpcs[recoveryProvider]!.getTransaction(s)},
 {pageSize:100,maxPages:10,maxTransactions:1000,maxWindowSlots:2000,retries:1,deadlineMs:20000,onProgress:async r=>persistProgress({...r,provider:recoveryProvider,observedAt:Date.now(),scope:"Finalized provider-reported scan; persisted cursor is audit progress, restart safely rescans/deduplicates from head"})});
const monitor = new MonitorSupervisor([ws,process.env.SOLANA_SECONDARY_WS_URL??"wss://solana-rpc.publicnode.com"],selectedPrograms,event=> {
 notifications++;venueCounts[event.program]!.notifications++;const identityIssue=researchIdentityIssue(event);
 if(identityIssue)venueCounts[event.program]!.unverifiableIdentities++;else{head=Math.max(head,event.slot);pipeline.setChainHead(head);}
 if(!identityIssue&&creationHint(event)){creationNotifications++;venueCounts[event.program]!.creationHints++;
  if(rows.length<maxCandidates&&venueCounts[event.program]!.selected<Math.ceil(maxCandidates/venueNames.length)&&performance.now()-(lastByVenue.get(event.program)??-Infinity)>=seconds*1000*venueNames.length/maxCandidates&&!rows.some(r=>r.event.program===event.program&&r.event.signature===event.signature)){
   lastSelected=performance.now();lastByVenue.set(event.program,lastSelected);venueCounts[event.program]!.selected++;rows.push({event,wireIdentitySha256:event.wireIdentitySha256,receiptProvider:monitor.snapshot().providerHosts[monitor.snapshot().provider],finalityPolls:0,receiptCommitment:"confirmed",receivedMonoOffsetMs:performance.now()-startMono});
  }else skippedSampling++;
 }
 const job=admission.offer(event);
 if(!job){refused++;void recordRefusal(event,"admission-capacity").catch(failIngestion);const anchor=journal.anchors.get(event.program);pipeline.recordGap(event.program,Math.max(0,(anchor?.slot??event.slot)-32),event.slot,"research-admission-capacity",anchor,1);monitor.pauseForBackpressure();return;}
 void job.then(async r=>{if(event.wireIdentitySha256)identityTrace({stage:'stable-identity-and-wal-admission',at:Date.now(),program:event.program,signature:event.signature,slot:event.slot,wireIdentitySha256:event.wireIdentitySha256,stableIdentity:eventIdentity(event),result:r,durable:journal.status().durable});if(!["accepted","deferred","duplicate"].includes(r.status)){refused++;await recordRefusal(event,r.status,r.reason);}}).catch(error=>{refused++;failIngestion(error);});
}, {onIdentityTrace:identityAudit?(record=>identityTrace({...record})):undefined,strictRpcNotifications:!!identityAudit,metrics,maxDurationMs:seconds*1000,maxConnections:512,maxIncidents:512,attemptsPerIncident:3,cooldownMs:30000,
 onStopped:()=>resolveFailure(),
 onDisconnect:context=>{for(const program of venueNames){const anchor=journal.anchors.get(program);pipeline.recordGap(program,Math.max(0,(anchor?.slot??context.latestSlot)-32),Math.max(context.latestSlot,anchor?.slot??0),(monitor.snapshot().state==="paused"?"ingestion-backpressure-pause":"supervised-websocket-disconnect"),anchor);gaps.push({program,at:Date.now(),fromSlot:anchor?.slot??context.latestSlot,status:"pending",reason:"Transport incident; paper admission suspended until provider-reported recovery"});}while(gaps.length>1000)gaps.shift();},
 onReady:context=>{if(context.reconnected)for(const program of venueNames)recovery.request(program,journal.gaps.get(program)?.anchor);},onError:error=>issue("websocket",error)});

let polling=false;
async function sample(){
 if(polling||shuttingDown)return;polling=true;
 try{
  try{assertResearchNotStopped(stopPath);}catch{stopRequested=true;monitor.stop();resolveFailure();await store.paperTransaction(state=>{state.running=false;state.killed=true;});}
  await market.poll();
  if(pipeline.status().fatal){failIngestion(Error(pipeline.status().fatal!));}
  if(monitor.snapshot().state==="paused"&&admission.pending<=16&&journal.status().unacknowledged<=16&&journal.pending.size<journal.maxPending/2&&!pipeline.status().fatal)monitor.resumeAfterBackpressure();
  const status=journal.status();if(status.walBytes>status.maxBytes*.5){await journal.checkpoint();metrics.increment("research.wal_checkpoints");}
  for(const gap of journal.gaps.values())if(["partial","pending"].includes(gap.status)&&gap.attempts<3)recovery.request(gap.program,gap.anchor);
  const report=metrics.report(),j=journal.status(),memory=process.memoryUsage();
  const entry={pipeline:{fatal:pipeline.status().fatal,inFlight:pipeline.status().inFlight,admissionPending:admission.pending,admissionBytes:admission.pendingBytes},at:Date.now(),elapsedMs:performance.now()-startMono,notifications,candidates:rows.length,verifiedCreations:rows.reduce((n,r)=>n+(r.verifiedLaunches??0),0),memory,cpuMicroseconds:process.cpuUsage(cpuStart),eventLoopDelayMs:{p50:delay.percentile(50)/1e6,p95:delay.percentile(95)/1e6,p99:delay.percentile(99)/1e6,max:delay.max/1e6},gc:{count:gcCount,totalMs:gcMs},wal:j,supervisor:monitor.snapshot(),recoveryProvider};
  if(samples.length<1500)samples.push(entry);
  const histogramEntries=Object.entries(report.histograms).filter(([name])=>/receipt_to|state_retrieval|quote_computation|risk|strategy|simulation|queue_wait|fsync/.test(name)).slice(0,80);
  const snapshot=ResearchSnapshotSchema.parse({schemaVersion:1,generatedAt:Date.now(),runStatus:monitor.snapshot().state==="terminal"?"failed":monitor.snapshot().state==="stopped"?"stopped":"running",scope:`Current sampled read-only ${venueNames.join(", ")} monitoring; no funded execution or guaranteed eligible entry`,notifications,verifiedCreations:entry.verifiedCreations,
   launches:researchLaunches(rows,store.state.marketReviews??[],paper.diagnostics),
   paper:paperValuation(store.state),providers:[{identity:`WS:${monitor.snapshot().providerHosts[monitor.snapshot().provider]}`,status:monitor.snapshot().liveReady?"healthy":"unknown",errors:rpcIssues.filter(i=>i.stage==="websocket").length,rateLimits:0},{identity:`RPC:${new URL(endpoint).host}`,status:verifier.health.snapshot().status!=="healthy"?verifier.health.snapshot().status:reader.health.snapshot().status,errors:reader.health.snapshot().errors+verifier.health.snapshot().errors,rateLimits:reader.health.snapshot().rateLimits+verifier.health.snapshot().rateLimits}],
   wal:{status:j.writerFailure?"failed":"healthy",bytes:j.walBytes,queueDepth:j.pending,backlogAgeMs:j.oldestPendingAgeMs,recoveryGaps:j.gaps.filter(g=>g.status!=="recovered").length,detail:"Worker fsync ownership; pending age includes quarantined work; transport receipt is not complete chain coverage"},intents:[],latencies:histogramEntries.map(([name,h])=>({name,count:h.count,p50:h.p50,p95:h.p95,p99:h.p99})),readiness:[...(epoch?[{name:"Epoch research policy",status:"unknown",detail:"Independent policy review unmet; new window never clears historical authorization"}]:[]),{name:"Research coverage",status:researchCoverage(monitor.snapshot(),coverageJournal(j),pipeline.status().fatal).status,detail:researchCoverage(monitor.snapshot(),coverageJournal(j),pipeline.status().fatal).reasons.join("; ")||"Current receipt and configured processing coverage checks passed; independent agreement still required"},{name:"Funded execution",status:"blocked",detail:"No signer or broadcaster; live mode rejected"},{name:"Independent provider agreement",status:"unknown",detail:"Separate provider validation evidence required; notification head is not a finalized-provider agreement"},{name:"Qualifying real paper entry",status:store.state.trades.some(t=>t.side==="buy")?"verified":"unknown",detail:"No synthetic opportunities or mandatory-risk overrides"}]});
  await writeFile(`${output}/run-progress.tmp`,JSON.stringify(publicEvidence({startedAt,updatedAt:Date.now(),seconds,notifications,venueCounts,unverifiableIdentities:identityRefusalCount(),identityAudit:identityAuditStatus(),coverageEpoch:epoch,refused,refusalCounts,creationNotifications,candidates:rows.length,supervisor:monitor.snapshot(),journal:j,recoveryProgress,rpcIssues,sample:entry,telemetry:report,paper:{trades:store.state.trades.length,reviews:store.state.marketReviews?.length??0},pipeline:{fatal:pipeline.status().fatal,inFlight:pipeline.status().inFlight,admissionPending:admission.pending,admissionBytes:admission.pendingBytes},scope:"Interim observation only; transport duration is not recovered chain coverage",liveTrading:false})));await rename(`${output}/run-progress.tmp`,`${output}/run-progress.json`);
  await writeFile(`${output}/research-status.tmp`,JSON.stringify(snapshot));await rename(`${output}/research-status.tmp`,`${output}/research-status.json`);
 }catch(error){issue("research.sample",error);}finally{polling=false;}
}
const sampleTimer=setInterval(()=>void sample(),5000);
const requestStop=()=>{stopRequested=true;monitor.stop();resolveFailure();};process.once("SIGINT",requestStop);process.once("SIGTERM",requestStop);
monitor.start();
let runTimer:ReturnType<typeof setTimeout>;await Promise.race([new Promise<void>(r=>{runTimer=setTimeout(r,seconds*1000);}),failureSignal]);clearTimeout(runTimer!);process.off("SIGINT",requestStop);process.off("SIGTERM",requestStop);
monitor.stop();
admission.close();await admission.drain();
await recovery.close().catch(error=>issue("shutdown.recovery",error));
await pipeline.drain(90000).catch(error=>issue("shutdown.drain",error));
clearInterval(sampleTimer);while(polling)await new Promise(r=>setTimeout(r,20));
await sample();shuttingDown=true;delay.disable();gc.disconnect();
await market.poll().catch(error=>issue("shutdown.poll",error));
await store.paperTransaction(s=>{s.running=false;});
await market.close().catch(error=>issue("shutdown.market",error)); await pipeline.close().catch(error=>issue("shutdown.pipeline",error));await raw.close().catch(error=>issue("shutdown.raw",error));await identityAudit?.close().catch(error=>issue("shutdown.identity-audit",error));await refusalAudit.close().catch(error=>issue("shutdown.refusals",error));
const restarted = await load(`${output}/ledger.json`,initializeMarketLedger(initial(strategy)),metrics,true);
await writeFile(`${output}/evidence.json`,JSON.stringify(publicEvidence({startedAt,endedAt:Date.now(),seconds,
  stopRequested,maxCandidates,notifications,venueCounts,unverifiableIdentities:identityRefusalCount(),identityAudit:identityAuditStatus(),coverageEpoch:epoch,refused,refusalCounts,creationNotifications,skippedSampling,captureDropped,captureBytes,samples,gaps,rpcIssues,supervisor:monitor.snapshot(),recoveryProgress,rawStorage:raw.status(),refusalStorage:refusalAudit.status(),resources:{cpuMicroseconds:process.cpuUsage(cpuStart),resourceBefore:resourceStart,resourceAfter:process.resourceUsage(),memory:process.memoryUsage(),gcCount,gcMs},provider:new URL(endpoint).host,policy:paper.policy,rows,captured,
  pipeline:{fatal:pipeline.status().fatal,inFlight:pipeline.status().inFlight,admissionPending:admission.pending,admissionBytes:admission.pendingBytes},journal:journal.status(),telemetry:metrics.report(), ledger:store.state,
  restart:{running:restarted.state.running,positions:restarted.state.positions.length,trades:restarted.state.trades.length,
    seenRetained:JSON.stringify(restarted.state.seen)===JSON.stringify(store.state.seen)},
  simulationDiagnostics:paper.diagnostics,providerAssessments,verificationRejectionCounts:Object.fromEntries([...new Set(rows.filter(r=>r.verificationIssue).map(r=>r.verificationIssue))].map(reason=>[reason,rows.filter(r=>r.verificationIssue===reason).length])),rejectionCounts:Object.fromEntries([...new Set((store.state.marketReviews??[]).flatMap(r=>r.reasons??[]))].map(reason=>[reason,(store.state.marketReviews??[]).filter(r=>r.reasons?.includes(reason)).length])),
  liveTrading:false,scope:"Supervised bounded mainnet transport and WAL of delivered notifications; market candidates sampled. Connected transport is not proof of chain coverage. Recovery status is explicit provider-reported evidence.  No database pool is attached to this monitor; database responsiveness is separately validated. Current confirmed WebSocket receipts; strict finalized creation verification; current finalized accounts. Both actual buy and sell simulations required before an entry; mandatory-risk failures are durably rejected before simulation. No invented fill or risk overrides. Public RPC errors and unsupported variants are retained."}),null,2)+"\n");
console.log(JSON.stringify({notifications,candidates:rows.length,trades:store.state.trades.length,reviews:store.state.marketReviews?.length}));
