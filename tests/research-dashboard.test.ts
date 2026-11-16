import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { projectResearchStatus, readResearchStatus } from "../src/research/status.js";
const snapshot=(now=Date.now())=>({schemaVersion:1,generatedAt:now,scope:"Read-only test snapshot",runStatus:"stopped", notifications:3,verifiedCreations:1,
  launches:[{identity:"public-signature",protocol:"pump",slot:123,verification:"verified",market:"unknown",decision:"rejected",reasons:["Unknown mandatory evidence"]}],
  providers:[{identity:"public-provider",status:"unknown",errors:2,rateLimits:1}],
  readiness:[{name:"Funded execution",status:"blocked",detail:"No signing path"}],
});
test("research projection bounds and allowlists public evidence, preserves unknown and stale",()=>{
  const now=Date.now();const raw={...snapshot(now),walletSecret:"NEVER_EXPOSE",captured:[{password:"NEVER_EXPOSE"}],liveTrading:true};
  raw.launches[0]!.reasons.push("RPC https://user:password@rpc.example/?api_key=NEVER_EXPOSE bearer NEVER_EXPOSE");
  const result=projectResearchStatus(raw,now);
  assert.equal(result.status,"available");assert.equal(result.liveTrading,false);
  const serialized=JSON.stringify(result);assert.ok(!serialized.includes("NEVER_EXPOSE"));assert.ok(!serialized.includes("walletSecret"));
  if (!("evidence" in result)) throw Error("Missing evidence");
  assert.equal(result.evidence.launches[0]!.buySimulation,"unknown");
  assert.equal(projectResearchStatus(raw,now+30001).status,"stale");
  assert.equal(projectResearchStatus({...raw,generatedAt:now+10000},now).status,"unavailable");
  assert.equal(projectResearchStatus({...raw,launches:Array(101).fill(raw.launches[0])},now).status,"unavailable");
  assert.equal(projectResearchStatus({...raw,intents:[{id:"x",state:"CANCELLED",updatedAt:Number.MAX_SAFE_INTEGER}]},now).status,"unavailable");
});
test("research local reader refuses oversized, symlinked and absent snapshots without exposing paths",async()=>{
  const dir=await mkdtemp(join(tmpdir(),"mintbot-research-"));
  try {
    assert.equal((await readResearchStatus(undefined)).status,"unavailable");
    const path=join(dir,"status.json");await writeFile(path,JSON.stringify(snapshot()));
    assert.equal((await readResearchStatus(path)).status,"available");
    const linked=join(dir,"linked.json");await symlink(path,linked);
    assert.equal((await readResearchStatus(linked)).status,"unavailable");
    await writeFile(path," ".repeat(1024*1024+1));
    const result=await readResearchStatus(path);assert.equal(result.status,"unavailable");assert.ok(!JSON.stringify(result).includes(dir));
  }finally{await rm(dir,{recursive:true,force:true});}
});
test("research rendering labels unsigned evidence and escapes untrusted text without execution controls",async()=>{
  const componentPath="../frontend/src/research.tsx";
  const {ResearchEvidence}=await import(componentPath);
  const raw=snapshot();raw.launches[0]!.reasons=["<script>window.secret=1</script>"];
  const result=projectResearchStatus({...raw,paper:{positions:0,trades:0,realizedPnlSol:"0"}});
  const html=renderToStaticMarkup(React.createElement(ResearchEvidence,{result:result as any}));
  assert.ok(html.includes("Funded execution: disabled"));assert.ok(html.includes("Monitor: stopped"));assert.ok(html.includes("Simulation success alone is not a paper fill"));
  assert.ok(html.includes("&lt;script&gt;"));assert.ok(!html.includes("<script>"));assert.ok(!html.includes("<button"));
  assert.ok(html.includes("WAL and backfill status unknown"));assert.ok(html.includes("No measured latency samples"));
});
test("research API uses existing bearer and origin enforcement and ignores client filesystem paths",{timeout:20000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),"mintbot-research-http-"));const token=randomBytes(32).toString("hex");
  const port=32000+Math.floor(Math.random()*20000),url=`http://127.0.0.1:${port}`;const path=join(dir,"status.json");
  await writeFile(path,JSON.stringify(snapshot()));
  let output="";
  const child=spawn(process.execPath,["--import","tsx","src/server.ts"],{env:{...process.env,API_TOKEN:token,PORT:String(port),HOST:"127.0.0.1",STATE_PATH:join(dir,"state.json"),MODE:"paper",REAL_MARKET_PAPER:"false",DATABASE_URL:"",MONITOR_PROGRAMS:"",TELEGRAM_BOT_TOKEN:"",TELEGRAM_CHAT_ID:"",RESEARCH_STATUS_PATH:path},stdio:["ignore","pipe","pipe"]});
  child.stdout.on("data",b=>output+=String(b));child.stderr.on("data",b=>output+=String(b));
  try {
    let ready=false;
    for(let i=0;i<150;i++){try{if((await fetch(url+"/health")).ok){ready=true;break;}}catch{}if(child.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,50));}
    assert.ok(ready,output);
    assert.equal((await fetch(url+"/api/research/status")).status,401);
    assert.equal((await fetch(url+"/api/research/status",{headers:{Authorization:`Bearer ${token}`,Origin:"https://other.example"}})).status,403);
    const response=await fetch(url+"/api/research/status?path=/etc/passwd",{headers:{Authorization:`Bearer ${token}`}});
    assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"no-store");
    const result=await response.json() as any;assert.equal(result.status,"available");assert.equal(result.evidence.notifications,3);assert.equal(result.liveTrading,false);
    assert.equal((await fetch(url+"/api/research/status",{method:"POST",headers:{Authorization:`Bearer ${token}`}})).status,404);
  }finally{if(child.exitCode===null){const exited=new Promise<void>(r=>child.once("exit",()=>r()));child.kill("SIGTERM");await exited;}await rm(dir,{recursive:true,force:true});}
});
