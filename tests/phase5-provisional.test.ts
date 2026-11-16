import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { VerifiedReadRpc } from "../src/verified-rpc.js";
import { json,paperCase } from "./market-fixtures.js";
import { coalescingReader } from "../src/market/reader.js";
test("Confirmed preparation uses actual commitment and returns no finalized launch or eligibility",async()=>{
 const fixture=await json("docs/phase3/fixtures/pump-creation.json"),methods:any[]=[];
 const http=createServer(async(req,res)=>{let body="";for await(const b of req)body+=b;const q=JSON.parse(body);methods.push(q);res.end(JSON.stringify({jsonrpc:"2.0",id:1,result:fixture.result}));});
 await new Promise<void>(r=>http.listen(0,"127.0.0.1",r));
 try{
 const port=(http.address() as any).port,rpc=new VerifiedReadRpc(`http://127.0.0.1:${port}`);
 const p=await rpc.provisional("pump",fixture.result.transaction.signatures[0],fixture.result.slot);
 assert.equal(p!.commitment,"confirmed");assert.equal(p!.executionEligible,false);assert(p!.keys.length>0);
 assert.equal("creationCommitment" in p!,false);assert.equal(methods[0].params[1].commitment,"confirmed");
 await assert.rejects(rpc.provisional("pump",fixture.result.transaction.signatures[0],fixture.result.slot+1),/conflict/);
 }finally{http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));}
});
test("Account retrieval burst enforces four concurrent reads and a total bounded queue under injected delay",async()=>{
 const c=await paperCase();let active=0,peak=0,release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const reader=coalescingReader({...c.rpc,accounts:async(keys,slot)=>{active++;peak=Math.max(peak,active);await gate;const b=await c.rpc.accounts(keys,slot);active--;return b;}});
 const jobs=Array.from({length:64},(_,i)=>reader.accounts([`unit-${i}`],0));
 const results=Promise.allSettled(jobs);await new Promise(r=>setImmediate(r));assert.equal(peak,4);release();
 const settled=await results;assert.equal(settled.filter(r=>r.status==="fulfilled").length,32);assert.equal(settled.filter(r=>r.status==="rejected").length,32);assert.equal(active,0);
});
