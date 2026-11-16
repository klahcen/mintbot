import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { Store, initial } from '../src/store.js';
import { RealMarketPaper, initializeMarketLedger } from '../src/market/paper.js';
import { MarketService } from '../src/market/service.js';
import { paperValuation } from '../src/market/projection.js';
import { SimulationGatedPaper } from '../src/simulation/paper-gate.js';
import { SimulationRpc } from '../src/simulation/rpc.js';
import { VerifiedReadRpc } from '../src/verified-rpc.js';
import { projectResearchStatus } from '../src/research/status.js';
import { RpcHealth } from '../src/rpc-health.js';
import { decimal, failed } from '../src/market/types.js';
import { json, paperCase } from './market-fixtures.js';

// All markets/fee/clock overrides in this file are unit fixtures, never live-market evidence.
async function opened() {
  const c = await paperCase(), strategy = await json('config/strategy.json');
  Object.assign(strategy, {tradeSol: 0.00001, minLiquiditySol: 0, trailingStopBps: 0});
  const state = initializeMarketLedger(initial(strategy)); state.running = true;
  const paper = new RealMarketPaper(new Store(state, undefined, undefined, 1024, true));
  const result = await paper.review(c.state, c.buy, c.sell, c.fees, c.version);
  assert('positionId' in result);
  return {c, paper, p: paper.store.state.positions[0]};
}
function netQuote(c: Awaited<ReturnType<typeof paperCase>>, p: Awaited<ReturnType<typeof opened>>['p'], proceeds: bigint) {
  const quote = c.adapter.quote(c.state, 'sell', BigInt(p.market!.atoms), 100);
  // Unit-only modeled market move, preserving identity, clocks and full-position input.
  quote.output = proceeds + 5000n; quote.minimumOutput = quote.output;
  return quote;
}
test('Automatic phase defaults specify 0.10 SOL, +90%, -5% and five positions', async () => {
  const s = await json('config/strategy.json');
  assert.deepEqual([s.tradeSol, s.takeProfitBps, s.stopLossBps, s.maxPositions], [0.1,9000,500,5]);
});
test('Fresh full-position net quotes mark, then automatically take profit at the exact +90% boundary', async () => {
  const {c,paper,p} = await opened();
  assert.equal(paperValuation(paper.store.state).positionsDetail[0].markStatus, 'unknown');
  const cost = BigInt(p.market!.costLamports);
  const marked = await paper.exit(p.id,c.state,netQuote(c,p,cost),c.fees,c.version,true);
  assert.deepEqual(marked,{marked:true});
  assert.equal(paperValuation(paper.store.state).unrealizedPnlSol,'0.000000000');
  assert.equal(paper.store.state.marketReviews?.[0].id,`mark:${p.id}`);
  assert.equal(paperValuation(paper.store.state,Date.now()+1600).unrealizedPnlSol,undefined);
  const result = await paper.exit(p.id,c.state,netQuote(c,p,cost*190n/100n),c.fees,c.version,true);
  assert('pnlLamports' in result);
  assert.equal(paper.store.state.positions.length,0);
  assert.match(paper.store.state.trades[0].reason,/take-profit/);
  assert.equal(result.pnlLamports,(cost*90n/100n).toString());
});
test('Automatic stop-loss uses net proceeds including exit fees at -5%', async () => {
  const {c,paper,p} = await opened(), cost = BigInt(p.market!.costLamports);
  await paper.exit(p.id,c.state,netQuote(c,p,cost*95n/100n),c.fees,c.version,true);
  assert.equal(paper.store.state.positions.length,0);
  assert.match(paper.store.state.trades[0].reason,/stop-loss/);
  assert.equal(paper.store.state.trades[0].pnlSol,Number(-cost*5n/100n)/1e9);
});
test('Stale feeds, unavailable liquidity, blocked variants and unfinalized states retain positions without marks', async () => {
  for (const change of [
    (c:any)=>{c.state.retrievedMono=performance.now()-1600;},
    (c:any)=>{c.state.liquidityLamports=0n;},
    (c:any)=>{c.state.signals.quoteVariant=failed('Disabled venue variant');},
    (c:any)=>{c.state.commitment='confirmed';},
  ]) {
    const {c,paper,p}=await opened(),quote=netQuote(c,p,30000n);change(c);
    await assert.rejects(paper.exit(p.id,c.state,quote,c.fees,c.version,true));
    assert.equal(paper.store.state.positions.length,1);
    assert.equal(paper.store.state.trades.length,1);
    assert.equal(paperValuation(paper.store.state).positionsDetail[0].markStatus,'unknown');
  }
});
test('Research coverage/provider agreement gates exits as well as entries',async()=>{
  const {c,paper,p}=await opened();let checks=0;
  const gated=new SimulationGatedPaper(paper,c.rpc,new SimulationRpc('http://127.0.0.1:1'),{
    providerAgreement:async()=>{checks++;return {status:'unknown',reasons:['Epoch review unmet']};},
  });
  await assert.rejects(gated.exit(p.id,c.state,netQuote(c,p,30000n),c.fees,c.version,true),/Epoch review unmet/);
  assert.equal(checks,1);assert.equal(paper.store.state.positions.length,1);
});
test('Real-market cap remains five even when a mutable strategy raises its position limit',async()=>{
  const {c,paper,p}=await opened();
  await paper.store.paperTransaction(s=>{s.strategies[0].maxPositions=100;for(let i=0;i<4;i++)s.positions.push({...p,id:`unit-${i}`,mint:`unit-${i}`});});
  c.state.launch.id='unit-sixth';c.state.mint='unit-sixth';
  const result=await paper.review(c.state,c.buy,c.sell,c.fees,c.version);
  assert('reasons' in result && result.reasons?.includes('Real-market maximum five positions'));
  assert.equal(paper.store.state.positions.length,5);
});
test('RPC health distinguishes failures, recovery and stale transport without granting coverage',()=>{
  const health=new RpcHealth();assert.equal(health.snapshot(100).status,'unknown');
  health.failure({httpStatus:429,rpcCode:-32015},100);
  assert.equal(health.snapshot(101).status,'failed');assert.equal(health.snapshot(101).rateLimits,1);
  health.success(102);assert.equal(health.snapshot(103).status,'healthy');
  assert.equal(health.snapshot(30103).status,'stale');assert.equal(health.snapshot(103).coverageVerified,false);
});
test('Native version requests are explicit; unsupported RPC version preserves code without retry or escalation',async()=>{
  const requests:any[]=[];
  const server=createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
    requests.push(JSON.parse(body));res.end(JSON.stringify({jsonrpc:'2.0',id:1,error:{code:-32015,message:'private provider details'}}));
  });});
  await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
  try {
    const reader=new VerifiedReadRpc(`http://127.0.0.1:${(server.address() as any).port}`);
    await assert.rejects(reader.transaction('unit'),(e:any)=>e.rpcCode===-32015&&!e.message.includes('private'));
    assert.equal(requests.length,1);assert.equal(requests[0].params[1].maxSupportedTransactionVersion,1);
    assert.equal(requests[0].params[1].commitment,'finalized');
    assert.equal(reader.health.snapshot().lastRpcCode,-32015);
  } finally {await new Promise<void>(r=>server.close(()=>r()));}
});
test('Signed-wire v1 proof is mandatory before native creation execution',async()=>{
  const reader=new VerifiedReadRpc('http://127.0.0.1:1');
  reader.transaction=async()=>({version:1} as any);
  await assert.rejects(reader.verify('pump','unit'),/signed-wire/);
});
test('Exact negative P&L below one SOL preserves its sign',()=>{
  assert.equal(decimal(-750n,9),'-0.000000750');
});

test('Automatic poll recovers stored position identity, marks from supported quotes, and records RPC failures',async()=>{
  const {c,paper,p}=await opened();
  const service=new MarketService(paper,c.rpc);
  // Unit read boundary; production uses the supported venue adapter and finalized RPC accounts.
  (service as any).read=async()=>({state:c.state,adapter:{quote:()=>netQuote(c,p,BigInt(p.market!.costLamports))}});
  (service as any).external=async()=>({fees:c.fees,version:c.version});
  await service.poll();
  assert(paper.store.state.marketReviews?.some(r=>r.id===`mark:${p.id}`));
  (service as any).read=async()=>{throw Error('RPC unit unavailable');};
  await service.poll();
  assert.equal(paper.store.state.positions.length,1);
  assert.match(paper.store.state.marketReviews![0].reasons.join(';'),/RPC unit unavailable/);
  await service.close();
});
test('A supported adapter computes the configured 0.10 SOL entry and rejects insufficient real liquidity',async()=>{
  const c=await paperCase(),strategy=await json('config/strategy.json');
  // Modeled liquid unit state; never saved as chain evidence.
  c.state.liquidityLamports=100000000000n;
  const buy=c.adapter.quote(c.state,'buy',100000000n,100);
  const sell=c.adapter.quote(c.state,'sell',buy.minimumOutput,100);
  const state=initializeMarketLedger(initial(strategy));state.running=true;
  const paper=new RealMarketPaper(new Store(state,undefined,undefined,1024,true));
  const result=await paper.review(c.state,buy,sell,c.fees,c.version);
  assert('positionId' in result,JSON.stringify(result));
  assert.equal(paper.store.state.trades[0].market?.inputAtoms,'100000000');
  c.state.liquidityLamports=1n;
  assert.throws(()=>c.adapter.quote(c.state,'sell',buy.minimumOutput,100),/insufficient real SOL reserves/);
});

test('A recently generated dashboard snapshot cannot refresh an expired executable mark',()=>{
  const result=projectResearchStatus({schemaVersion:1,generatedAt:10000,scope:'Unit test',paper:{positions:1,trades:1,realizedPnlSol:'0',unrealizedPnlSol:'1',positionsDetail:[{mint:'unit',protocol:'pump',quantityAtoms:'1',markStatus:'verified',markAt:8000,pnlSol:'1'}]}},10000);
  assert('evidence' in result);
  assert.equal(result.evidence!.paper!.positionsDetail[0].markStatus,'stale');
  assert.equal(result.evidence!.paper!.unrealizedPnlSol,undefined);
});
