import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type RequestListener } from 'node:http';
import { WebSocketServer } from 'ws';
import bs58 from 'bs58';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ReadOnlyProbe, ProbeFailure, probeWebSocket, compareAccountBanks } from '../src/research/validation-probe.js';
import { inspectSignedWire } from '../src/research/signed-wire-inspection.js';
import { marketRisk, validateQuote } from '../src/market/risk.js';
import { VenueFeedHealth } from '../src/research/venue-feed-health.js';
import { epochCoverage } from '../src/research/epochs.js';
import { SimulationGatedPaper } from '../src/simulation/paper-gate.js';
import { SimulationRpc } from '../src/simulation/rpc.js';
import { RealMarketPaper, initializeMarketLedger } from '../src/market/paper.js';
import { initial, Store } from '../src/store.js';
import { json, paperCase } from './market-fixtures.js';
import type { MarketState, Quote, Signal } from '../src/market/types.js';

async function local(handler:RequestListener){
 const server=createServer(handler);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 return {endpoint:`http://127.0.0.1:${(server.address() as any).port}`,close:async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}};
}
test('Diagnostic transport refuses funded methods before network and never exposes provider errors or credentials',async()=>{
 let requests=0;const server=await local((_q,r)=>{requests++;r.end(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32015,message:'PRIVATE_API_KEY'}}));});
 try{const probe=new ReadOnlyProbe(`${server.endpoint}/PRIVATE_API_KEY`,100,2);
  await assert.rejects(probe.read('sendTransaction',[]),ProbeFailure);assert.equal(requests,0);
  await assert.rejects(probe.read('getSlot',[]),(e:any)=>e.rpcCode===-32015&&!String(e).includes('PRIVATE'));
  assert.equal(probe.observations[0].rpcCode,-32015);assert(!JSON.stringify(probe.observations).includes('PRIVATE'));
 }finally{await server.close();}
});
test('Diagnostic HTTP identity mismatch, delayed responses and call quotas fail closed without retries',async()=>{
 let requests=0;const server=await local((_q,r)=>{requests++;if(requests===1)r.end(JSON.stringify({jsonrpc:'2.0',id:999,result:1}));});
 try{const probe=new ReadOnlyProbe(server.endpoint,40,2);
  await assert.rejects(probe.read('getSlot',[]),(e:any)=>e.kind==='identity');
  await assert.rejects(probe.read('getSlot',[]),(e:any)=>e.kind==='transport');
  await assert.rejects(probe.read('getSlot',[]),(e:any)=>e.kind==='bound');assert.equal(requests,2);
 }finally{await server.close();}
});
test('Different account banks, missing accounts and a single provider never establish matching-bank evidence',()=>{
 const row=(id:string,slot:number,value:any[]= [{owner:'unit'}])=>({id,result:{context:{slot},value}});
 assert.equal(compareAccountBanks([row('a',1),row('b',2)]).status,'unknown');
 assert.equal(compareAccountBanks([row('a',1)]).status,'unknown');
 assert.equal(compareAccountBanks([row('a',1),row('b',1,[null])]).status,'unknown');
 assert.equal(compareAccountBanks([row('a',1),row('b',1,[{owner:'other'}])]).status,'conflict');
 assert.equal(compareAccountBanks([row('a',1),row('b',1)]).executionEligible,false);
});
test('Missing WebSocket configuration and ACK-only quiet feeds remain unknown',async()=>{
 assert.equal((await probeWebSocket(undefined,[{name:'pump',address:'unit'}],50)).status,'missing');
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise<void>(r=>server.once('listening',r));
 server.on('connection',s=>s.on('message',b=>{const q=JSON.parse(b.toString());s.send(JSON.stringify({jsonrpc:'2.0',id:q.id,result:11}));}));
 try{const result=await probeWebSocket(`ws://127.0.0.1:${(server.address() as any).port}`,[{name:'pump',address:'unit'}],100);
  assert.equal(result.status,'unknown');assert.equal(result.venues[0].ack,true);assert.equal(result.venues[0].validIdentities,0);
 }finally{for(const c of server.clients)c.terminate();await new Promise<void>(r=>server.close(()=>r()));}
});
test('A stale or reconnected feed cannot borrow freshness from prior delivery',()=>{
 const health=new VenueFeedHealth(['pump'],30),signature=bs58.encode(Buffer.alloc(64,1));
 health.acknowledged(10);health.receipt('pump',signature,11);
 assert.equal(health.snapshot(12,true).pump.allowDelivery,true);
 assert.equal(health.snapshot(42,true).pump.allowDelivery,false);
 health.reset();health.acknowledged(43);assert.equal(health.snapshot(44,true).pump.allowDelivery,false);
});
test('Clean current coverage cannot approve an unreviewed epoch or erase historical quarantine',()=>{
 const epoch:any={id:'unit',researchPolicyReview:'unmet',history:[{unresolvedGaps:1,quarantined:79}]};
 const result=epochCoverage(epoch,{liveReady:true,requiredVenueDeliveryReady:true},{gaps:[],quarantined:0});
 assert.equal(result.status,'unknown');assert.equal(result.historicalUnresolved,1);assert.equal(epoch.history[0].quarantined,79);
 assert.equal(result.fundedAuthorized,false);
});
test('Expired, future and invalid deployment timestamps cannot authorize entry',async()=>{
 for(const observedAt of [Date.now()-5001,Date.now()+10000,NaN,Infinity]){
  const c=await paperCase();c.version.observedAt=observedAt;
  const result=marketRisk(c.state,c.buy,c.sell,c.fees,c.version);
  assert.equal(result.eligible,false);assert(result.reasons.some(r=>r.startsWith('deployment:')));
 }
});
test('Nonfinite executable quote clocks and unfinalized market state fail validation',async()=>{
 const c=await paperCase();for(const key of ['computedMono','expiresMono'] as const)for(const value of [NaN,Infinity]){
  assert.throws(()=>validateQuote(c.state,{...c.buy,[key]:value}),/Stale quote/);
 }
 assert.throws(()=>validateQuote({...c.state,commitment:'confirmed' as any},c.buy),/Stale quote/);
});
class CommitBoundary extends SimulationGatedPaper {
 prepared(s:MarketState,b:Quote,q:Quote,f:Signal,v:Signal){return this.commitPrepared(s,b,q,f,v);}
}
test('Provider agreement must bind the prepared fill bank and disagreement retains all funds',async()=>{
 const c=await paperCase(),strategy=await json('config/strategy.json');Object.assign(strategy,{tradeSol:0.00001,minLiquiditySol:0});
 const state=initializeMarketLedger(initial(strategy));state.running=true;const store=new Store(state);let bank:number|undefined;
 const gate=new CommitBoundary(new RealMarketPaper(store),c.rpc,new SimulationRpc('http://127.0.0.1:1'),{
  providerAgreement:async s=>{bank=s.slot;return {status:'unknown',reasons:['Prepared bank not independently agreed']};},
 });
 await assert.rejects(gate.prepared(c.state,c.buy,c.sell,c.fees,c.version),/Prepared-bank/);
 assert.equal(bank,c.state.slot);assert.equal(store.state.positions.length,0);assert.equal(store.state.balanceSol,10);
});
test('Agreement returning after quote expiration cannot commit a paper fill',async()=>{
 const c=await paperCase(),strategy=await json('config/strategy.json');Object.assign(strategy,{tradeSol:0.00001,minLiquiditySol:0});
 const state=initializeMarketLedger(initial(strategy));state.running=true;const store=new Store(state);
 const gate=new CommitBoundary(new RealMarketPaper(store),c.rpc,new SimulationRpc('http://127.0.0.1:1'),{
  providerAgreement:async()=>{c.buy.expiresMono=0;return {status:'verified',reasons:[]};},
 });
 const result=await gate.prepared(c.state,c.buy,c.sell,c.fees,c.version);
 assert('reasons' in result);assert.equal(store.state.trades.length,0);
});
test('Captured real signed v1/legacy payloads reconstruct without approving creation execution',async()=>{
 const capture=await json('docs/phase17/current-probe-2/provider-validation.json');let count=0;
 for(const provider of capture.providers)for(const tx of provider.transactions){
  const result=inspectSignedWire(tx.base64,tx.json,tx.signature);assert.equal(result.status,'signed-payload-matched');assert.equal(result.executionEligible,false);count++;
 }
 assert.equal(count,4);
});
test('Signed-wire inspection rejects signature, account, instruction, config and metadata tampering',async()=>{
 const capture=await json('docs/phase17/current-probe-2/provider-validation.json');const original=capture.providers[0].transactions.find((t:any)=>t.json.version===1);
 for(const mutate of [
  (t:any)=>{const bytes=Buffer.from(t.base64.transaction[0],'base64');bytes[bytes.length-1]^=1;t.base64.transaction[0]=bytes.toString('base64');},
  (t:any)=>{t.json.transaction.message.header.numRequiredSignatures++;},
  (t:any)=>{t.json.transaction.message.accountKeys[0]='11111111111111111111111111111111';},
  (t:any)=>{t.json.transaction.message.instructions[0].programIdIndex=999;},
  (t:any)=>{t.json.transaction.message.transactionConfig.priorityFee++;},
  (t:any)=>{delete t.json.meta.preBalances;},
  (t:any)=>{t.base64.version=2;t.json.version=2;},
 ]){const tx=structuredClone(original);mutate(tx);assert.equal(inspectSignedWire(tx.base64,tx.json,tx.signature).status,'failed');}
});
test('Dashboard requires explicit approval evidence and expires marks independently of HTTP polling',async()=>{
 const componentPath='../frontend/src/research.tsx';
 const {ResearchEvidence}=await import(componentPath),now=10000;
 const evidence:any={generatedAt:now,scope:'Unit rendering',runStatus:'running',notifications:1,verifiedCreations:1,launches:[],providers:[{identity:'unit',status:'healthy',errors:0,rateLimits:0}],readiness:[],intents:[],latencies:[],paper:{positions:1,trades:1,realizedPnlSol:'0',unrealizedPnlSol:'123.456',positionsDetail:[{mint:'unit',protocol:'pump',quantityAtoms:'1',markStatus:'verified',markAt:now,pnlSol:'123.456'}]}};
 const render=(time:number)=>renderToStaticMarkup(React.createElement(ResearchEvidence,{result:{status:'available',evidence},now:time}));
 assert(render(now).includes('Blocked or stale market evidence'));assert(render(now).includes('Eligible paper positions: 0'));
 assert(!render(now+1501).includes('123.456'));
 evidence.readiness=['Research coverage','Independent provider agreement','Epoch research policy'].map(name=>({name,status:'verified',detail:'UNIT only'}));
 assert(render(now).includes('Verified real-market paper monitoring'));assert(render(now).includes('Eligible paper positions: 1'));
});
test('Retained real v0 wire remains inspectable while the native v1 execution fence stays active',async()=>{
 const history=await json('docs/phase17/history-controls.json');
 const v0=history.rows[0].results.find((r:any)=>r.subject.name==='retained-v0-creation');
 const result=inspectSignedWire(v0.base64,v0.json,v0.subject.signature);
 assert.equal(result.status,'signed-payload-matched');assert('version' in result && result.version===0);
 const {VerifiedReadRpc}=await import('../src/verified-rpc.js');
 const rpc=new VerifiedReadRpc('http://127.0.0.1:1');
 const capture=await json('docs/phase17/current-probe-2/provider-validation.json');
 rpc.transaction=async()=>capture.providers[0].transactions.find((t:any)=>t.json.version===1).json;
 await assert.rejects(rpc.verify('pump','unit'),/Version 1 creation execution blocked/);
});
