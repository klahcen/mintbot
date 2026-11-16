/** Sustained deterministic paper-engine unit replay; never represented as current mainnet trades. */
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {performance,monitorEventLoopDelay} from "node:perf_hooks";
import {paperCase,json} from "../tests/market-fixtures.js";
import {Store,initial,load} from "../src/store.js";
import {initializeMarketLedger,RealMarketPaper} from "../src/market/paper.js";
import {Telemetry} from "../src/telemetry.js";
const args=process.argv.slice(2),idx=args.indexOf("--seconds"),seconds=idx<0?60:Number(args[idx+1]);
if(!Number.isInteger(seconds)||seconds<30||seconds>600)throw Error("Soak duration 30..600 seconds");
const dir=await mkdtemp(join(tmpdir(),"mintbot-paper-soak5-")),metrics=new Telemetry(),config=await json("config/strategy.json");
Object.assign(config,{tradeSol:.00001,minLiquiditySol:0,maxDailySpendSol:10});
const state=initializeMarketLedger(initial(config));state.running=true;
let paper=new RealMarketPaper(new Store(state,join(dir,"ledger"),metrics,32,true)),cycles=0,duplicates=0,restarts=0,staleRetained=0;
const start=performance.now(),cpu=process.cpuUsage(),loop=monitorEventLoopDelay({resolution:10});loop.enable();let peakRss=0;
try{
 while(performance.now()-start<seconds*1000&&cycles<2000){
  const c=await paperCase();c.state.launch.id=`unit-soak-${cycles}`;
  const result=await paper.review(c.state,c.buy,c.sell,c.fees,c.version);
  if(!("positionId"in result))throw Error("Unit replay entry failed");
  const dupe=await paper.review(c.state,c.buy,c.sell,c.fees,c.version);if(!("duplicate"in dupe))throw Error("Duplicate fill");duplicates++;
  const id=result.positionId!;
  if(cycles%10===0){try{await paper.exit(id,c.state,{...c.sell,expiresMono:performance.now()-1},c.fees,c.version);}catch{staleRetained++;}if(!paper.store.state.positions.some(p=>p.id===id))throw Error("Stale exit lost position");}
  await paper.exit(id,c.state,c.sell,c.fees,c.version);
  cycles++;
  if(cycles%50===0){const restored=await load(join(dir,"ledger"),state,metrics,true);if(restored.state.running)throw Error("Restart resumed trading");paper=new RealMarketPaper(restored);await restored.paperTransaction(s=>{s.running=true;});restarts++;if(!("duplicate"in await paper.review(c.state,c.buy,c.sell,c.fees,c.version)))throw Error("Restart duplicate fill");}
  peakRss=Math.max(peakRss,process.memoryUsage().rss);
  await new Promise(r=>setTimeout(r,100));
 }
 await paper.store.paperTransaction(s=>{s.running=false;});loop.disable();
 const ledger=paper.store.state.marketLedger!;
 if(paper.store.state.positions.length||BigInt(ledger.balanceLamports)!==10000000000n+BigInt(ledger.realizedPnlLamports))throw Error("Exact cost-basis reconciliation failed");
 await writeFile("docs/phase5/paper-soak.json",JSON.stringify({startedAt:new Date(Date.now()-(performance.now()-start)).toISOString(),elapsedMs:performance.now()-start,requestedSeconds:seconds,cycles,duplicates,restarts,staleRetained,peakRssBytes:peakRss,cpuMicroseconds:process.cpuUsage(cpu),
  eventLoopDelayMs:{p50:loop.percentile(50)/1e6,p95:loop.percentile(95)/1e6,p99:loop.percentile(99)/1e6,max:loop.max/1e6},ledger,positions:paper.store.state.positions.length,retainedTrades:paper.store.state.trades.length,telemetry:metrics.report(),liveTrading:false,
  scope:"Sustained fsynced dedicated paper-engine replay using explicit UNIT safety/fee overrides and perturbed receipt identity. Not current mainnet evidence, fills, return estimates, or network/provider endurance proof. Entry/exit, stale-quote retention, restart stop and deduplication exercised."},null,2)+"\n");
 console.log({cycles,duplicates,restarts,staleRetained});
}finally{await rm(dir,{recursive:true,force:true});}
