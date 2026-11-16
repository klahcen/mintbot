import test from"node:test";import assert from"node:assert/strict";import{constructionCase}from"./simulation-fixtures.js";import{prepareConstruction}from"../src/simulation/prepare.js";import{Store,initial}from"../src/store.js";import{StateSchema}from"../src/model.js";import{json}from"./market-fixtures.js";
test("Final-bank preparation enumerates owner membership once and rechecks the fresh complete bank",async()=>{
 const c=await constructionCase(),b=c.evidence.batch;let enumerations=0;
 const reader={provider:b.provider,accounts:async()=>b,largest:async()=>({slot:b.contextSlot,amounts:[]}),holders:async()=>{enumerations++;return[];},deployment:async()=>c.evidence.deployments[0]};
 const e=await prepareConstruction({venue:"raydium-cpmm",address:c.evidence.state.launch.address},reader,c.authorization.user,c.evidence.quote.input);
 assert.equal(enumerations,1);assert.equal(e.state.slot,b.contextSlot);assert.equal(e.state.signals.holderConcentration.status,"unknown");
 const corrupt={...reader,accounts:async(keys:string[])=>({...b,accounts:Object.fromEntries(keys.filter(k=>k!==c.authorization.user).map(k=>[k,b.accounts[k]??null]))})};
 await assert.rejects(prepareConstruction({venue:"raydium-cpmm",address:c.evidence.state.launch.address},corrupt,c.authorization.user,c.evidence.quote.input),/misses/);
});
test("Trusted Store seen-list fast validation retains strict schema rejection and transaction isolation",async()=>{
 const s=new Store(initial(await json("config/strategy.json")));
 for(const value of [["valid",42],new Array(2),Array(10001).fill("x"),null]){
  await assert.rejects(s.paperTransaction(next=>{(next as any).seen=value;}));assert.deepEqual(s.state.seen,[]);
 }
 await s.paperTransaction(next=>{next.seen.push("verified-identity");});assert(StateSchema.safeParse(s.state).success);
});
