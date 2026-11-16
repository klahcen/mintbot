import test from"node:test";import assert from"node:assert/strict";import{createServer}from"node:http";import{VersionedTransaction}from"@solana/web3.js";
import{constructionCase}from"./simulation-fixtures.js";import{SimulationRpc}from"../src/simulation/rpc.js";import{simulationAccounting,compareProviders}from"../src/simulation/accounting.js";
import type{SwapPlan,SimulationResult}from"../src/simulation/types.js";
export async function mockSimulation(fn:(method:string,params:any)=>any,run:(rpc:SimulationRpc,methods:string[])=>Promise<void>,timeout=1000){
 const methods:string[]=[];const http=createServer(async(req,res)=>{let raw="";for await(const b of req)raw+=b;const q=JSON.parse(raw);methods.push(q.method);try{const result=await fn(q.method,q.params);res.end(JSON.stringify({jsonrpc:"2.0",id:1,result}));}catch{res.end(JSON.stringify({jsonrpc:"2.0",id:1,error:{code:-32000}}));}});
 await new Promise<void>(r=>http.listen(0,"127.0.0.1",r));try{const port=(http.address()as any).port;await run(new SimulationRpc(`http://127.0.0.1:${port}/secret-test-token`,undefined,timeout),methods);}finally{http.closeAllConnections();await new Promise<void>(r=>http.close(()=>r()));}
}
export function simulationEffects(plan:SwapPlan){
 const tx=VersionedTransaction.deserialize(Buffer.from(plan.unsignedBase64,"base64")),keys=tx.message.staticAccountKeys.map(k=>k.toBase58()),payer=keys.indexOf(plan.user),base=keys.indexOf(plan.quote.side==="buy"?plan.destination:plan.source);
 const pre=keys.map(()=>0);pre[payer]=100000000000;const post=[...pre];post[payer]-=Number(plan.input+plan.rentLamports+5500n);
 return{context:{slot:plan.state.slot},value:{err:null,logs:["UNIT simulated invocation"],unitsConsumed:100000,fee:5500,accounts:[...new Set([plan.user,plan.source,plan.destination])].map(()=>null),preBalances:pre,postBalances:post,
  preTokenBalances:[],postTokenBalances:[{accountIndex:base,mint:plan.state.mint,uiTokenAmount:{decimals:plan.state.decimals,amount:plan.quote.output.toString()}}]}};
}
test("Actual read-only transport sends unsigned v0 simulateTransaction and preserves outcome fields",async()=>{
 const c=await constructionCase("pump"),p=await c.plan();
 await mockSimulation((method,params)=>{
  if(method==="getBlockHeight")return p.block.lastValidBlockHeight-1;
  assert.equal(method,"simulateTransaction");assert.equal(params[1].sigVerify,false);assert.equal(params[1].replaceRecentBlockhash,false);assert.equal(params[1].commitment,"finalized");
  assert(VersionedTransaction.deserialize(Buffer.from(params[0],"base64")).signatures.every(s=>s.every(b=>b===0)));
  return simulationEffects(p);
 },async(rpc,methods)=>{const r=await rpc.simulate(p);assert.equal(r.success,true);assert.equal(r.unitsConsumed,100000);assert.equal(r.signatureVerified,false);assert.equal(r.submitted,false);assert.equal(simulationAccounting(p,r).consistent,true);assert.deepEqual(methods,["getBlockHeight","simulateTransaction"]);});
});
test("RPC simulation failure and missing balance effects never become paper-accounting success",async()=>{
 const c=await constructionCase("pump"),p=await c.plan();
 for(const failure of[true,false])await mockSimulation(method=>method==="getBlockHeight"?1:{context:{slot:p.state.slot},value:{err:failure?{InstructionError:[2,"InsufficientFunds"]}:null,logs:[],unitsConsumed:200,accounts:null}},async rpc=>{const r=await rpc.simulate(p);assert.equal(r.success,!failure);assert.equal(simulationAccounting(p,r).consistent,false);});
});
test("Provider timeout, stale validity height, wrong context and conflicting results fail closed",async()=>{
 const c=await constructionCase(),p=await c.plan();
 await mockSimulation(async()=>{await new Promise(r=>setTimeout(r,50));return 1;},async rpc=>{await assert.rejects(rpc.simulate(p),/timed out/);},5);
 await mockSimulation(()=>p.block.lastValidBlockHeight+1,async(rpc,methods)=>{await assert.rejects(rpc.simulate(p),/Stale blockhash/);assert.deepEqual(methods,["getBlockHeight"]);});
 await mockSimulation(method=>method==="getBlockHeight"?1:{context:{slot:0},value:{err:null,logs:[],accounts:null}},async rpc=>{await assert.rejects(rpc.simulate(p),/Inconsistent/);});
 const base:SimulationResult={kind:"unsigned-protocol-simulation",provider:"a",contextSlot:p.state.slot,commitment:"finalized",observedAt:Date.now(),messageDigest:p.messageDigest,success:true,error:null,logs:[],unitsConsumed:1,fee:"1",raw:{},accounts:null,preBalances:null,postBalances:null,preTokenBalances:null,postTokenBalances:null,signatureVerified:false,submitted:false};
 assert.equal(compareProviders(p,[base,{...base,provider:"b",success:false,error:"failed"}]).status,"failed");assert.equal(compareProviders(p,[base]).status,"unknown");
});
