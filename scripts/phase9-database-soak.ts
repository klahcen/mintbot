import {mkdir,writeFile} from "node:fs/promises";import {monitorEventLoopDelay} from "node:perf_hooks";
import {authenticatedPostgres} from "./phase8-authenticated-postgres.js";
const arg=(name:string,fallback:string)=>{const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1];};
if(!process.argv.includes("--run"))throw Error("Explicit --run required");
const seconds=Number(arg("--seconds","300"));if(!Number.isInteger(seconds)||seconds<5||seconds>3600)throw Error("Database soak seconds must be 5..3600");
const pg=await authenticatedPostgres(arg("--cluster-root","")||undefined),startedAt=new Date().toISOString(),start=performance.now(),cpu=process.cpuUsage(),loop=monitorEventLoopDelay({resolution:20});
const samples:unknown[]=[],latencies:number[]=[],errors:unknown[]=[],alerts:unknown[]=[];let stop=false;process.once("SIGINT",()=>{stop=true;});process.once("SIGTERM",()=>{stop=true;});loop.enable();
console.log(JSON.stringify({event:"start",startedAt,seconds,cluster:pg.root,runtimeMaximum:2,mode:"read-only authenticated SELECT health; concurrent host workloads uncontrolled"}));
try {
 while(!stop){
  const sampleStart=performance.now();
  try{const health=await pg.health();latencies.push(health.roundTripMs);const s={elapsedMs:performance.now()-start,...health,pool:{total:pg.runtimePool.totalCount,idle:pg.runtimePool.idleCount,waiting:pg.runtimePool.waitingCount},rssBytes:process.memoryUsage().rss};samples.push(s);if(health.roundTripMs>2000)alerts.push({elapsedMs:s.elapsedMs,reason:"DB heartbeat exceeds 2 seconds"});console.log(JSON.stringify({event:"heartbeat",...s}));}
  catch{const e={elapsedMs:performance.now()-start,reason:"Authenticated database heartbeat failed or timed out"};errors.push(e);alerts.push(e);console.log(JSON.stringify({event:"error",...e}));}
  const remaining=seconds*1000-(performance.now()-start);if(remaining<=0||stop)break;
  await new Promise(r=>setTimeout(r,Math.min(Math.max(1,5000-(performance.now()-sampleStart)),remaining)));
 }
}finally{
 loop.disable();const elapsedMs=performance.now()-start,usage=process.cpuUsage(cpu),sorted=[...latencies].sort((a,b)=>a-b),at=(p:number)=>sorted.length?sorted[Math.floor((sorted.length-1)*p)]:null;
 const evidence={generatedAt:new Date().toISOString(),startedAt,requestedSeconds:seconds,durationMs:elapsedMs,endedBySignal:stop,cluster:pg.root,retainedAfterStop:true,mode:"SELECT-only authenticated runtime heartbeat",sampleIntervalMs:5000,successfulSamples:samples.length,failedSamples:errors.length,latencyMs:{p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)},eventLoopDelayMs:{p50:loop.percentile(50)/1e6,p95:loop.percentile(95)/1e6,p99:loop.percentile(99)/1e6,max:loop.max/1e6},nodeProcessCpuMicroseconds:usage,nodeProcessCpuScope:"heartbeat process only; excludes PostgreSQL and concurrent benchmark/monitor processes",samples,errors,alerts,highAvailability:false,liveAuthorized:false,submitted:false};
 let shutdownIssue:string|undefined;try{await pg.close();}catch(error){shutdownIssue=(error as Error).message.slice(0,300);process.exitCode=1;}await mkdir("docs/phase9",{recursive:true});await writeFile(arg("--output","docs/phase9/database-soak.json")!,JSON.stringify({...evidence,shutdownSucceeded:!shutdownIssue,shutdownIssue},null,2));console.log(JSON.stringify({event:"completed",durationMs:elapsedMs,successfulSamples:samples.length,failedSamples:errors.length,latencyMs:evidence.latencyMs}));
}
