/** Comparable warm review history cost; no mainnet latency or profitable fills claimed. */
import {readFile,writeFile,mkdtemp,rm} from "node:fs/promises";
import {pathToFileURL} from "node:url";
import {join,resolve} from "node:path";
import {tmpdir,cpus} from "node:os";
import {performance} from "node:perf_hooks";
import {createHash} from "node:crypto";
import {recorded} from "../tests/market-fixtures.js";
import {Telemetry} from "../src/telemetry.js";
import {publicEvidence} from "../src/market/types.js";
const args=process.argv.slice(2),opt=(n:string,d:string)=>args.includes(n)?args[args.indexOf(n)+1]!:d;
const before=resolve(opt("--before-root","/tmp/mintbot-phase5-before")),rows:any[]=[];
const fixture=await recorded("pump"),template=await fixture.adapter.read(fixture.launch,fixture.rpc),config=JSON.parse(await readFile("config/strategy.json","utf8"));
const unknown={status:"unknown",reason:"Recorded offline benchmark has no current external fee/deployment evidence"};
for(let run=0;run<3;run++)for(const durable of [false,true])for(const label of run%2?["after","before"]:["before","after"]) {
 const root=label==="before"?before:resolve("."),metrics=new Telemetry(),dir=await mkdtemp(join(tmpdir(),"mintbot-market-profile-"));
 const storeModule=await import(pathToFileURL(join(root,"src/store.ts")).href),paperModule=await import(pathToFileURL(join(root,"src/market/paper.ts")).href);
 const s=paperModule.initializeMarketLedger(storeModule.initial(config));
 s.marketReviews=Array.from({length:200},(_,i)=>({id:`warm-${i}`,at:Date.now(),reasons:["Historical fixture; no eligible entry"],evidence:publicEvidence({state:template})}));
 const store=new storeModule.Store(s,durable?join(dir,"ledger"):undefined,metrics,128,true),paper=new paperModule.RealMarketPaper(store,metrics);
 const start=performance.now(),cpu=process.cpuUsage();
 for(let i=0;i<100;i++) {
  const state=structuredClone(template);state.launch.id=`measured-${i}`;state.retrievedAt=Date.now();state.retrievedMono=performance.now();
  const buy=fixture.adapter.quote(state,"buy",10000n,100),sell=fixture.adapter.quote(state,"sell",buy.minimumOutput,100);
  await paper.review(state,buy,sell,unknown,unknown);
 }
 const elapsedMs=performance.now()-start;
 rows.push({label,run,durable,reviews:100,warmHistoryRows:200,elapsedMs,reviewsPerSecond:100000/elapsedMs,cpuMicroseconds:process.cpuUsage(cpu),trades:store.state.trades.length,telemetry:metrics.report()});
 await rm(dir,{recursive:true,force:true});
}
const sourceSha256:any={};for(const label of ["before","after"]){sourceSha256[label]={};for(const file of ["store.ts","model.ts","market/paper.ts","market/risk.ts"]){sourceSha256[label][file]=createHash("sha256").update(await readFile(join(label==="before"?before:resolve("."),"src",file))).digest("hex");}}
await writeFile("docs/phase5/market-benchmark.json",JSON.stringify({generatedAt:new Date().toISOString(),node:process.version,cpu:cpus()[0]?.model,rows,sourceSha256,
 scope:"Identical recorded historical Pump account template; 200 preloaded review rows, 100 rejected reviews per job, three interleaved repetitions, in-memory and file+directory-fsync Store. No RPC, no eligible entries, fixture clocks reset for offline quote arithmetic only. Measures warm bounded review history; not end-to-end mainnet latency."},null,2)+"\n");
