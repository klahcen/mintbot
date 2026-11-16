import test from"node:test";import assert from"node:assert/strict";import{createServer}from"node:http";import{VersionedTransaction}from"@solana/web3.js";
import{localPostgres}from"../scripts/local-postgres.js";import{constructionCase}from"./simulation-fixtures.js";import{IntentLedger}from"../src/simulation/intent-ledger.js";import{SimulationService}from"../src/simulation/service.js";import{SimulationRpc}from"../src/simulation/rpc.js";
import{RealMarketPaper,initializeMarketLedger}from"../src/market/paper.js";import{PumpMarketAdapter}from"../src/market/pump.js";import{Store,initial}from"../src/store.js";import{json}from"./market-fixtures.js";import{verified}from"../src/market/types.js";import type{VerifiedLaunch}from"../src/verified-decoders.js";import{SOL}from"../src/market/accounts.js";
test("Explicit simulation service preserves emergency stop, durable intent identity and paper risk controls (UNIT balances/safety)",{timeout:15000},async()=>{
 const pg=await localPostgres();let http:ReturnType<typeof createServer>|undefined;let service:SimulationService|undefined;
 try{
 const ledger=new IntentLedger(pg.pool);await ledger.migrate();const c=await constructionCase("pump"),s=c.evidence.state;
 const launch=s.launch as VerifiedLaunch;launch.slot=s.slot;launch.freshness={origin:"live",receiptAt:Date.now(),eventTimeMs:Date.now(),eventSlot:s.slot,chainHeadSlot:s.slot};launch.creationCommitment="finalized";
 s.signals.holderConcentration=verified({topOwnerBps:100},"UNIT owner evidence, not mainnet eligibility");
 const config=await json("config/strategy.json");Object.assign(config,{tradeSol:.00001,minLiquiditySol:0});const state=initializeMarketLedger(initial(config));state.running=true;const paper=new RealMarketPaper(new Store(state));
 const fees=verified({baseLamports:"5000",priorityLamports:"0",rentLamports:"0",computeUnitLimit:200000,observedAt:Date.now()},"UNIT fee estimate"),deployment=verified(true,"UNIT safety");
 const sell=new PumpMarketAdapter().quote(s as any,"sell",c.evidence.quote.minimumOutput,100);
 let stopped=true,calls=0;
 http=createServer(async(req,res)=>{let body="";for await(const b of req)body+=b;const q=JSON.parse(body);calls++;let result:any;
  if(q.method==="getLatestBlockhash")result={context:{slot:s.slot},value:{blockhash:c.block.blockhash,lastValidBlockHeight:c.block.lastValidBlockHeight}};
  else if(q.method==="getMinimumBalanceForRentExemption")result=2039280;
  else if(q.method==="getBlockHeight")result=1;
  else if(q.method==="simulateTransaction"){
   const tx=VersionedTransaction.deserialize(Buffer.from(q.params[0],"base64")),keys=tx.message.staticAccountKeys.map(k=>k.toBase58()),payer=keys.indexOf(c.authorization.user),base=keys.indexOf(q.params[1].accounts.addresses.find((a:string)=>a!==c.authorization.user)!);
   const pre=keys.map(()=>0);pre[payer]=100000000000;const post=[...pre];post[payer]-=Number(c.evidence.quote.input+2039280n+5500n);
   result={context:{slot:s.slot},value:{err:null,logs:["UNIT simulation"],unitsConsumed:100000,fee:5500,accounts:q.params[1].accounts.addresses.map(()=>null),preBalances:pre,postBalances:post,preTokenBalances:[],postTokenBalances:[{accountIndex:base,mint:s.mint,uiTokenAmount:{decimals:s.decimals,amount:c.evidence.quote.output.toString()}}]}};
  }else throw Error("Forbidden method");res.end(JSON.stringify({jsonrpc:"2.0",id:1,result}));
 });await new Promise<void>(r=>http!.listen(0,"127.0.0.1",r));const port=(http.address()as any).port;
 service=new SimulationService(new SimulationRpc(`http://127.0.0.1:${port}`),ledger,()=>stopped);
 const key={opportunity:s.launch.id,strategy:c.authorization.strategyVersion,side:"buy"as const,generation:"UNIT-1",wallet:c.authorization.user};
 await ledger.budget(`wallet:${key.wallet}`,SOL,100000000n);
 await ledger.budget(`${key.wallet}:${key.strategy}`,SOL,100000000n);
 await assert.rejects(service.review(key,c.evidence,c.authorization),/stop/);assert.equal(calls,0);
 stopped=false;const result=await service.review(key,c.evidence,c.authorization,{paper,sell,fees,deployment});
 assert("accounting"in result&&result.accounting!.consistent);assert.equal(paper.store.state.positions.length,1);assert.equal(paper.store.state.positions[0].market!.costLamports,"2054780");
 assert.equal((await ledger.get(result.intent!.id))!.status,"POLICY_APPROVED");const before=calls;
 const duplicate=await service.review(key,c.evidence,c.authorization,{paper,sell,fees,deployment});assert("duplicate"in duplicate);assert.equal(calls,before);assert.equal(paper.store.state.positions.length,1);
 }finally{await service?.close();http?.closeAllConnections();if(http)await new Promise<void>(r=>http!.close(()=>r()));await pg.close();}
});
