/** Offline build and injected-provider pipeline measurements, separate from real-mainnet simulation evidence. */
import{readFile,writeFile}from"node:fs/promises";import{createServer}from"node:http";import{performance}from"node:perf_hooks";import{createHash}from"node:crypto";import{cpus}from"node:os";
import{constructionCase}from"../tests/simulation-fixtures.js";import{Telemetry}from"../src/telemetry.js";import{localPostgres}from"./local-postgres.js";import{IntentLedger}from"../src/simulation/intent-ledger.js";import{SimulationRpc}from"../src/simulation/rpc.js";import{SimulationService}from"../src/simulation/service.js";import{validateUnsigned}from"../src/simulation/policy.js";import{SOL}from"../src/market/accounts.js";
const builds:any[]=[],database:any[]=[],bursts:any[]=[];
function refresh(c:Awaited<ReturnType<typeof constructionCase>>){const now=Date.now(),mono=performance.now();c.evidence.state.retrievedAt=c.evidence.batch.retrievedAt=now;c.evidence.state.retrievedMono=c.evidence.batch.retrievedMono=mono;c.evidence.quote.computedMono=mono;c.evidence.quote.expiresMono=mono+1500;c.authorization.expiresAt=now+1500;c.block.observedAt=now;for(const d of c.evidence.deployments)d.observedAt=now;}
for(let run=0;run<3;run++)for(const venue of["pump","pumpswap","raydium-cpmm","meteora-dlmm"]as const){const c=await constructionCase(venue),m=new Telemetry(),start=performance.now(),cpu=process.cpuUsage();let packetBytes=0;
 for(let i=0;i<50;i++){refresh(c);const p=await m.measureAsync("build_ms",c.plan);m.observe("serialization_ms",p.serializationMs);m.measure("wire_policy_ms",()=>validateUnsigned(p));packetBytes=Buffer.from(p.unsignedBase64,"base64").length;}
 const elapsedMs=performance.now()-start;builds.push({venue,run,builds:50,elapsedMs,buildsPerSecond:50000/elapsedMs,packetBytes,cpuMicroseconds:process.cpuUsage(cpu),telemetry:m.report()});}
const pg=await localPostgres();try{
 const setup=new IntentLedger(pg.pool);await setup.migrate();
 for(let run=0;run<3;run++){
  const scope=`UNIT-db-${run}`,wallet=`UNIT-wallet-${run}`;await setup.budget(`wallet:${wallet}`,SOL,1000000n);await setup.budget(`${wallet}:${scope}`,SOL,1000000n);
  const m=new Telemetry(),ledger=new IntentLedger(pg.pool,m),start=performance.now();
  for(let i=0;i<100;i++){const r=await ledger.reserve({opportunity:`UNIT-db-${run}-${i}`,strategy:scope,side:"buy",generation:"1",wallet},[{asset:SOL,atoms:"1"}],{scope:"UNIT database benchmark"});const owner=await ledger.claim(r.id,"benchmark-owner");await ledger.transition(r.id,owner.owner!,owner.fence,"RESERVED","CANCELLED",{scope:"No transaction simulated or submitted"});}
  const elapsedMs=performance.now()-start;database.push({run,intents:100,transactions:300,elapsedMs,intentsPerSecond:100000/elapsedMs,telemetry:m.report()});
 }
 for(let run=0;run<3;run++){
  const c=await constructionCase(),metrics=new Telemetry(),ledger=new IntentLedger(pg.pool,metrics);let simulatedCalls=0;
  const http=createServer(async(req,res)=>{let body="";for await(const b of req)body+=b;const q=JSON.parse(body);await new Promise(r=>setTimeout(r,15));let result:any;
   if(q.method==="getLatestBlockhash")result={context:{slot:c.evidence.state.slot},value:{blockhash:c.block.blockhash,lastValidBlockHeight:c.block.lastValidBlockHeight}};
   else if(q.method==="getMinimumBalanceForRentExemption")result=2039280;else if(q.method==="getBlockHeight")result=1;
   else if(q.method==="simulateTransaction"){if(++simulatedCalls%7===0){res.statusCode=429;res.end();return;}result={context:{slot:c.evidence.state.slot},value:{err:{InstructionError:[2,"UNIT injected failure"]},logs:["UNIT injected provider response"],unitsConsumed:1000,accounts:null}};}
   res.end(JSON.stringify({jsonrpc:"2.0",id:1,result}));
  });await new Promise<void>(r=>http.listen(0,"127.0.0.1",r));const port=(http.address()as any).port,service=new SimulationService(new SimulationRpc(`http://127.0.0.1:${port}`,metrics),ledger,()=>false,metrics);
  await ledger.budget(`wallet:${c.authorization.user}`,SOL,1000000000n);await ledger.budget(`${c.authorization.user}:${c.authorization.strategyVersion}`,SOL,1000000000n);refresh(c);
  const start=performance.now(),jobs=Array.from({length:64},(_,i)=>Promise.resolve().then(()=>{const e=structuredClone(c.evidence);e.state.launch.id=`UNIT-burst-${run}-${i}`;return service.review({opportunity:e.state.launch.id,strategy:c.authorization.strategyVersion,side:"buy",generation:`UNIT-${run}`,wallet:c.authorization.user},e,c.authorization);}));
  const result=await Promise.allSettled(jobs);await service.close();http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));
  const elapsedMs=performance.now()-start;bursts.push({run,offered:64,admitted:metrics.report().counters["simulation.pipeline.admitted"]??0,refused:result.filter(r=>r.status==="rejected"&&String(r.reason).includes("backlog")).length,providerFailures:result.filter(r=>r.status==="rejected"&&!String(r.reason).includes("backlog")).length,completed:result.filter(r=>r.status==="fulfilled").length,elapsedMs,telemetry:metrics.report(),scope:"15ms injected per read, protocol failure for every response and HTTP429 every seventh simulation. No real CU, fills or mainnet latency inferred."});
 }
}finally{await pg.close();}
const sourceSha256:Record<string,string>={};for(const file of["builders.ts","policy.ts","rpc.ts","types.ts","prepare.ts","accounting.ts","intent-ledger.ts","intent-schema.sql","service.ts"]){sourceSha256[file]=createHash("sha256").update(await readFile(`src/simulation/${file}`)).digest("hex");}
await writeFile("docs/phase6/simulation-benchmark.json",JSON.stringify({generatedAt:new Date().toISOString(),environment:{node:process.version,cpu:cpus()[0]?.model},builds,database,bursts,sourceSha256,scope:"Three repetitions. Real recorded market bytes plus UNIT execution-account evidence and refreshed UNIT clocks. Build preparation excluded. Database is actual local PostgreSQL16 with file durability enabled. Provider delays/failures are injected. No synthetic result is represented as real-chain simulation."},null,2)+"\n");
