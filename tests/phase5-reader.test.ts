import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { coalescingReader } from "../src/market/reader.js";
import { BoundedStage } from "../src/stages.js";
import { paperCase } from "./market-fixtures.js";
test("Slot-aware cache coalesces concurrent reads, preserves original age and isolates returned objects",async()=>{
 const c=await paperCase();let calls=0;
 const r=coalescingReader({...c.rpc,accounts:async(k,s)=>{calls++;await new Promise(r=>setImmediate(r));return c.rpc.accounts(k,s);}});
 const [a,b]=await Promise.all([r.accounts([c.state.mint],0),r.accounts([c.state.mint],0)]);
 assert.equal(calls,1);assert.equal(a.retrievedAt,b.retrievedAt);
 a.accounts[c.state.mint]=null;
 const hit=await r.accounts([c.state.mint],0);assert(hit.accounts[c.state.mint]);assert.equal(calls,1);assert.equal(hit.retrievedMono,b.retrievedMono);
 await r.accounts([c.state.mint],0,{fresh:true});assert.equal(calls,2);
 await assert.rejects(r.accounts([c.state.mint],c.fixture.contextSlot+1),/Inconsistent/);assert.equal(calls,3);
});
test("Cache failures are not retained; expired snapshots force retrieval and outages propagate",async()=>{
 const c=await paperCase();let calls=0,fail=true;
 const r=coalescingReader({...c.rpc,accounts:async(k,s)=>{calls++;if(fail)throw Error("outage");const b=await c.rpc.accounts(k,s);b.retrievedMono=performance.now()-300;return b;}});
 await assert.rejects(r.accounts([c.state.mint],0),/outage/);fail=false;
 await r.accounts([c.state.mint],0);await r.accounts([c.state.mint],0);assert.equal(calls,3);
});
test("Fresh queued work receives priority, total admission stays bounded, older work is eventually served",async()=>{
 const stage=new BoundedStage("unit.priority",12,1),order:string[]=[];
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 const active=stage.trySubmit(()=>gate)!;await new Promise(r=>setImmediate(r));
 const low=stage.trySubmit(()=>{order.push("old");},performance.now(),0)!;
 const highs=Array.from({length:9},(_,i)=>stage.trySubmit(()=>{order.push(`fresh${i}`);},performance.now(),1)!);
 assert.equal(stage.pending,11);assert(stage.trySubmit(()=>undefined));assert.equal(stage.trySubmit(()=>undefined),undefined);
 release();await Promise.all([active,low,...highs]);await stage.drain();
 assert.equal(order[0],"fresh0");assert(order.indexOf("old")<=8);stage.close();assert.equal(stage.trySubmit(()=>undefined),undefined);
});
