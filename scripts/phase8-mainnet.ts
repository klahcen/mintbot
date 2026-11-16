import { loadResearchProviders, safeResearchIssue } from "../src/research/provider-config.js";
import { ResearchFeedHealth } from "../src/research/feed-health.js";
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
const seconds = Number(opt("--seconds", "900")), maxCandidates = Number(opt("--max-candidates", "60"));
if (!Number.isInteger(seconds) || seconds < 15 || seconds > 7200 || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 240) throw Error("Experiment bound");
const providerConfigs = await loadResearchProviders();
const consistency = new ProviderConsistency(providerConfigs);
const output = opt("--output", `docs/phase8/mainnet-${Date.now()}`);
await mkdir(output, {recursive: true});
try { await access(`${output}/ledger.json`); throw Error("Use a new experiment directory; existing ledger preserved"); }
catch(e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
const endpoint = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const ws = process.env.SOLANA_WS_URL ?? "wss://api.mainnet-beta.solana.com";
const metrics = new Telemetry(), startedAt = Date.now(), startMono = performance.now();
const captured: unknown[] = [], rows: any[] = [], samples:any[]=[], gaps:any[]=[], rpcIssues:any[]=[];
const feedHealth=new ResearchFeedHealth();
const cpuStart=process.cpuUsage(),resourceStart=process.resourceUsage(), delay=monitorEventLoopDelay({resolution:20});delay.enable();
let gcCount=0,gcMs=0,captureBytes=0,lastSelected=-Infinity,skippedSampling=0,creationNotifications=0,captureDropped=0,shuttingDown=false;
const gc=new PerformanceObserver(list=>{for(const e of list.getEntries()){gcCount++;gcMs+=e.duration;}});gc.observe({entryTypes:["gc"]});
function retain(record:unknown){const bytes=Buffer.byteLength(JSON.stringify(record));if(captureBytes+bytes>64*1024*1024||captured.length>=2000){captureDropped++;return;}captured.push(record);captureBytes+=bytes;}
function issue(stage:string,error:unknown){const e=error as any;rpcIssues.push({at:Date.now(),stage,message:safeResearchIssue(error),httpStatus:Number.isInteger(e?.httpStatus)?e.httpStatus:undefined,rpcCode:Number.isSafeInteger(e?.rpcCode)?e.rpcCode:undefined});if(rpcIssues.length>500)rpcIssues.shift();if(e?.httpStatus===429||/HTTP 429/.test(String(e?.message)))metrics.increment("research.rpc_rate_limits");}

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
const paper = new SimulationGatedPaper(new RealMarketPaper(store, metrics, marketPolicy("finalized-paper-research")),reader,new SimulationRpc(endpoint,metrics),{providerAgreement:async state=>{
 if(!feedHealth.snapshot(performance.now()).allowNewPaperWork)return{status:"unknown",reasons:["Research feed unavailable or receipt stale"]};
 const assessment=await consistency.inspect({signature:state.launch.signature,accounts:state.accounts.map(a=>a.address),minimumSlot:state.slot});
 providerAssessments.push(assessment);if(providerAssessments.length>100)providerAssessments.shift();
 const exactBank=assessment.observations.every(o=>o.state?.slot===state.slot);
 return {status:assessment.status==="verified"&&exactBank?"verified":assessment.status==="failed"?"failed":"unknown",reasons:[...assessment.reasons,...(exactBank?[]:["Provider comparison does not match the quote bank"])]};
}});
const market = new MarketService(paper, reader,metrics);
const verifier = new CaptureVerifier(endpoint);
const journal = await AsyncEventJournal.open({path:`${output}/ingestion.wal`},metrics);
let head = 0, notifications = 0, refused = 0;
const pipeline = new EventIngestion({ journal, metrics, capacity:8,enrichmentConcurrency:2,maxAttempts:1,
  enrich: async (event,_launches,freshness,timing) => {
    const row = rows.find(r => r.event.signature === event.signature)!;
    await market.observe(event,"confirmed",new URL(ws).host);
    try {
      const provisional = await metrics.measureAsync("phase8.confirmed_preparation_ms",()=>verifier.provisional(event.program,event.signature,event.slot));
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
    } while(Date.now()<deadline);
    row.verificationIssue="Finalized creation unavailable within bounded wait"; return [];
  },
  strategy:async (event,_launches,_identity,enrichment)=> {
    const row = rows.find(r=>r.event.signature===event.signature)!;
    for (const launch of enrichment as VerifiedLaunch[]) {
      row.decision = await market.evaluate(launch);
      row.decisionAgeMs=Date.now()-event.observedAt;
      row.receiptToDecisionMonoMs=performance.now()-(event.receivedAtMonoMs??(startMono+row.receivedMonoOffsetMs));
      metrics.observe("research.receipt_to_paper_decision_ms",row.receiptToDecisionMonoMs);
    }
  },
});
const monitor = new SolanaMonitor(ws,VERIFIED_PROGRAMS.filter(p=>p.name==="pump"),event=> {
  notifications++;feedHealth.receipt(performance.now()); head=Math.max(head,event.slot);pipeline.setChainHead(head);
  if(event.failed||!event.logs.some(l=>/^Program log: Instruction: CreateV2$/.test(l)))return;
  creationNotifications++;
  if(rows.length>=maxCandidates||performance.now()-lastSelected<seconds*1000/maxCandidates||rows.some(r=>r.event.signature===event.signature)){skippedSampling++;return;}
  lastSelected=performance.now();
  rows.push({event,finalityPolls:0,receiptCommitment:"confirmed",receivedMonoOffsetMs:performance.now()-startMono});
  void pipeline.acceptDurable(event).then(r=> { if(r.status!=="accepted" && r.status!=="deferred") refused++; }).catch(()=>refused++);
}, {telemetry:metrics, onDisconnect:context=>{feedHealth.disconnected();gaps.push({at:Date.now(),fromSlot:context.latestSlot,status:"unrecovered",reason:"Read-only research monitor disconnected; continuous coverage not established"});}, onReady:context=>{feedHealth.ready();if(context.reconnected)gaps.push({at:Date.now(),toSlot:context.latestSlot,status:"unrecovered",reason:"Reconnected; bounded research capture does not claim historical gap recovery"});}, onError:error=>{feedHealth.fail(error);issue("websocket",error);if(feedHealth.snapshot(performance.now()).exhausted)void store.paperTransaction(s=>{s.running=false;}).catch(e=>issue("feed-emergency-stop",e));}});
let polling=false;
async function sample(){
 if(polling||shuttingDown)return;polling=true;
 try{
  await market.poll();
  const report=metrics.report(),j=journal.status(),memory=process.memoryUsage();
  const entry={at:Date.now(),elapsedMs:performance.now()-startMono,notifications,candidates:rows.length,verifiedCreations:rows.reduce((n,r)=>n+(r.verifiedLaunches??0),0),memory,cpuMicroseconds:process.cpuUsage(cpuStart),eventLoopDelayMs:{p50:delay.percentile(50)/1e6,p95:delay.percentile(95)/1e6,p99:delay.percentile(99)/1e6,max:delay.max/1e6},gc:{count:gcCount,totalMs:gcMs},wal:j};
  if(samples.length<1500)samples.push(entry);
  const histogramEntries=Object.entries(report.histograms).filter(([name])=>/receipt_to|state_retrieval|quote_computation|risk|strategy|simulation|queue_wait|fsync/.test(name)).slice(0,80);
  const snapshot=ResearchSnapshotSchema.parse({schemaVersion:1,generatedAt:Date.now(),runStatus:feedHealth.snapshot(performance.now()).exhausted?"failed":"running",scope:"Current sampled read-only Pump monitoring; no funded execution or guaranteed eligible entry",notifications,verifiedCreations:entry.verifiedCreations,
   launches:researchLaunches(rows,store.state.marketReviews??[],paper.diagnostics),
   paper:{positions:store.state.positions.length,trades:store.state.trades.length,realizedPnlSol:String(store.state.realizedPnlSol)},providers:[{identity:`WS:${new URL(ws).host}`,status:feedHealth.snapshot(performance.now()).status,errors:rpcIssues.filter(i=>i.stage==="websocket").length,rateLimits:0},{identity:`RPC:${new URL(endpoint).host}`,status:"unknown",errors:report.counters["rpc.errors"]??0,rateLimits:report.counters["research.rpc_rate_limits"]??0}],
   wal:{status:j.writerFailure?"failed":"healthy",bytes:j.walBytes,queueDepth:j.pending,backlogAgeMs:j.oldestPendingAgeMs,recoveryGaps:gaps.length+j.gaps.length,detail:"Worker fsync ownership; research sampling is not complete feed/backfill coverage"},intents:[],latencies:histogramEntries.map(([name,h])=>({name,count:h.count,p50:h.p50,p95:h.p95,p99:h.p99})),readiness:[{name:"Funded execution",status:"blocked",detail:"No signer or broadcaster; live mode rejected"},{name:"Independent provider agreement",status:"unknown",detail:"Separate provider validation evidence required; notification head is not a finalized-provider agreement"},{name:"Qualifying real paper entry",status:store.state.trades.some(t=>t.side==="buy")?"verified":"unknown",detail:"No synthetic opportunities or mandatory-risk overrides"}]});
  await writeFile(`${output}/research-status.tmp`,JSON.stringify(snapshot));await rename(`${output}/research-status.tmp`,`${output}/research-status.json`);
 }catch(error){issue("research.sample",error);}finally{polling=false;}
}
const sampleTimer=setInterval(()=>void sample(),5000);
monitor.start();
await new Promise(r=>setTimeout(r,seconds*1000));
monitor.stop();
await pipeline.drain(90000);
clearInterval(sampleTimer);while(polling)await new Promise(r=>setTimeout(r,20));
await sample();shuttingDown=true;delay.disable();gc.disconnect();
await market.poll();
await store.paperTransaction(s=>{s.running=false;});
await market.close(); await pipeline.close();
const restarted = await load(`${output}/ledger.json`,initializeMarketLedger(initial(strategy)),metrics,true);
await writeFile(`${output}/evidence.json`,JSON.stringify(publicEvidence({startedAt,endedAt:Date.now(),seconds,
  maxCandidates,notifications,refused,creationNotifications,skippedSampling,captureDropped,captureBytes,samples,gaps,rpcIssues,feedHealth:feedHealth.snapshot(performance.now()),resources:{cpuMicroseconds:process.cpuUsage(cpuStart),resourceBefore:resourceStart,resourceAfter:process.resourceUsage(),memory:process.memoryUsage(),gcCount,gcMs},provider:new URL(endpoint).host,policy:paper.policy,rows,captured,
  journal:journal.status(),telemetry:metrics.report(), ledger:store.state,
  restart:{running:restarted.state.running,positions:restarted.state.positions.length,trades:restarted.state.trades.length,
    seenRetained:JSON.stringify(restarted.state.seen)===JSON.stringify(store.state.seen)},
  simulationDiagnostics:paper.diagnostics,providerAssessments,verificationRejectionCounts:Object.fromEntries([...new Set(rows.filter(r=>r.verificationIssue).map(r=>r.verificationIssue))].map(reason=>[reason,rows.filter(r=>r.verificationIssue===reason).length])),rejectionCounts:Object.fromEntries([...new Set((store.state.marketReviews??[]).flatMap(r=>r.reasons??[]))].map(reason=>[reason,(store.state.marketReviews??[]).filter(r=>r.reasons?.includes(reason)).length])),
  liveTrading:false,scope:"Bounded long-duration sampled Pump receipts, not exhaustive protocol coverage or historical recovery. No database pool is attached to this monitor; database responsiveness is separately validated. Current confirmed WebSocket receipts; strict finalized creation verification; current finalized accounts. Both actual buy and sell simulations required before an entry; mandatory-risk failures are durably rejected before simulation. No invented fill or risk overrides. Public RPC errors and unsupported variants are retained."}),null,2)+"\n");
console.log(JSON.stringify({notifications,candidates:rows.length,trades:store.state.trades.length,reviews:store.state.marketReviews?.length}));
