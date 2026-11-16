import test from "node:test";import assert from "node:assert/strict";
import {ProviderConsistency,MAINNET_GENESIS,type ProviderTransport} from "../src/research/providers.js";
const providers=[{id:"first",endpoint:"https://a.example",operator:{name:"A",attribution:"https://a.example/operator"}},{id:"second",endpoint:"https://b.example",operator:{name:"B",attribution:"https://b.example/operator"}}];
const account="11111111111111111111111111111111",signature="1".repeat(88);
const fake=(change:(id:string,method:string,value:any)=>any=(_i,_m,v)=>v):ProviderTransport=>async(p,m)=>change(p.id,m,m==="getGenesisHash"?MAINNET_GENESIS:m==="getSlot"?100:m==="getSignatureStatuses"?{context:{slot:100},value:[{slot:90,confirmationStatus:"finalized",err:null}]}:{context:{slot:100},value:[{owner:account,lamports:100,data:["AA==","base64"],executable:false,rentEpoch:0}]});
test("Phase8 attributed providers agree on finalized status and identical account bank",async()=>{const r=await new ProviderConsistency(providers,fake()).inspect({signature,accounts:[account]});assert.equal(r.status,"verified");assert.equal(r.eligible,true);assert.equal(r.liveAuthorized,false);});
test("Phase8 distinct hosts without operator attribution never prove independence",async()=>{const r=await new ProviderConsistency(providers.map(({operator,...p})=>p),fake()).inspect();assert.equal(r.status,"unknown");assert.equal(r.eligible,false);});
test("Phase8 bank mismatch is unknown and same-bank conflict quarantines both until explicit review",async()=>{
 const c=new ProviderConsistency(providers,fake((id,m,v)=>{if(id==="second"&&m==="getMultipleAccounts")v.value[0].lamports++;return v;}));
 const r=await c.inspect({accounts:[account]});assert.equal(r.status,"failed");assert.equal(r.quarantined.length,2);assert.throws(()=>c.resolve("first","",""));c.resolve("first","reviewer","Independent re-observation requested");assert.equal((await c.inspect()).status,"unknown");assert.equal(c.resolutions.length,1);
 const unknown=await new ProviderConsistency(providers,fake((id,m,v)=>{if(id==="second"&&m==="getMultipleAccounts")v.context.slot++;return v;})).inspect({accounts:[account]});assert.equal(unknown.status,"unknown");assert.equal(unknown.quarantined.length,0);
});
test("Phase8 finalized status conflicts fail closed and missing status cannot authorize",async()=>{
 const r=await new ProviderConsistency(providers,fake((id,m,v)=>{if(id==="second"&&m==="getSignatureStatuses")v.value[0].slot++;return v;})).inspect({signature});assert.equal(r.status,"failed");
 const missing=await new ProviderConsistency(providers,fake((id,m,v)=>{if(id==="second"&&m==="getSignatureStatuses")v.value[0]=null;return v;})).inspect({signature});assert.equal(missing.status,"unknown");
});
test("Phase8 transport failure bounded to configured providers with no retry and no agreement fallback",async()=>{let calls=0;const c=new ProviderConsistency(providers,async(p,m,params)=>{calls++;if(p.id==="second")throw Error("timeout");return fake()(p,m,params);});assert.equal((await c.inspect()).status,"unknown");assert.equal(calls,4);});
test("Phase8 fallback read remains explicitly unknown and respects maximum attempts",async()=>{let calls=0;const c=new ProviderConsistency(providers,async(p,m,params)=>{calls++;if(p.id==="first")throw Error("timeout");return fake()(p,m,params);});await assert.rejects(c.readAvailable("getSlot",[],1),/after 1 attempts/);assert.equal(calls,1);const r=await c.readAvailable("getSlot",[],2);assert.equal(r.provider,"second");assert.equal(r.attempts,2);assert.equal(r.eligible,false);assert.equal(r.agreement,"unknown");});
test("Phase8 matching provider failures and matching missing accounts cannot authorize",async()=>{
 const failed=await new ProviderConsistency(providers,fake((_id,m,v)=>{if(m==="getSignatureStatuses")v.value[0].err={InstructionError:[0,"Custom"]};return v;})).inspect({signature});assert.equal(failed.status,"failed");assert.equal(failed.eligible,false);assert.equal(failed.quarantined.length,0);
 const missing=await new ProviderConsistency(providers,fake((_id,m,v)=>{if(m==="getMultipleAccounts")v.value=[null];return v;})).inspect({accounts:[account]});assert.equal(missing.status,"unknown");assert.equal(missing.eligible,false);
});
test("Phase8 wrong chain and finalized regression quarantine provider; poll gaps explicit",async()=>{
 const wrong=await new ProviderConsistency(providers,fake((id,m,v)=>id==="second"&&m==="getGenesisHash"?"wrong":v)).inspect();assert(wrong.quarantined.includes("second"));
 let slot=100;const c=new ProviderConsistency(providers,fake((_id,m,v)=>m==="getSlot"?slot:v));await c.inspect();slot=104;const gap=await c.inspect();assert.equal(gap.gaps.length,2);assert.deepEqual([gap.gaps[0].from,gap.gaps[0].to],[101,103]);slot=99;assert.equal((await c.inspect()).quarantined.length,2);
});
test("Phase8 configuration and manual resolution records are bounded and isolated from caller mutation",async()=>{
 const input=providers.map(p=>({...p,operator:{...p.operator}})),c=new ProviderConsistency(input,fake());input[0].operator.name="B";assert.equal((await c.inspect()).independence,"attributed-distinct-operators");
 for(let i=0;i<1000;i++){c.quarantine("first","UNIT discrepancy");c.resolve("first","reviewer","UNIT reviewed");}
 c.resolutions.pop();assert.equal(c.resolutions.length,1000);c.quarantine("first","UNIT discrepancy");assert.throws(()=>c.resolve("first","reviewer","UNIT overflow"),/journal bound/);assert((await c.inspect()).quarantined.includes("first"));
});
