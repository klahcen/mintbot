import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { json } from "./market-fixtures.js";
import { PoolMarketAdapter,poolSpec } from "../src/market/pools.js";
import { marketRisk } from "../src/market/risk.js";
import { RealMarketPaper,initializeMarketLedger } from "../src/market/paper.js";
import { initial,Store } from "../src/store.js";
import { decodeVerifiedTransaction,requiredLaunchAccounts } from "../src/verified-decoders.js";
import { MarketService } from "../src/market/service.js";
import type { MarketReader } from "../src/market/types.js";
for(const venue of ["raydium-cpmm","meteora-dlmm"] as const)test(`Recorded liquid ${venue} has real two-sided inventory and pinned SDK quote agreement`,async()=>{
 const f=await json(`docs/phase5/fixtures/${venue}-liquid.json`),b=f.batch;
 const reader:MarketReader={provider:b.provider,accounts:async keys=>({...b,retrievedAt:Date.now(),retrievedMono:performance.now(),accounts:Object.fromEntries(keys.map(k=>[k,structuredClone(b.accounts[k])??null]))}),largest:async()=>({slot:b.contextSlot,amounts:[]})};
 const adapter=new PoolMarketAdapter(venue),state=await adapter.inspect(f.address,reader);
 assert.equal(state.launch.purpose,"market-inspection");assert.equal(state.launch.signature,undefined);
 const buy=adapter.quote(state,"buy",1000000n,100),sell=adapter.quote(state,"sell",buy.minimumOutput,100);
 assert.equal(buy.output.toString(),f.buy.output);assert.equal(sell.output.toString(),f.sell.output);
 assert(state.baseReserve>0n&&state.quoteReserve>0n);assert.equal(marketRisk(state,buy,sell,{status:"unknown",reason:"none"},{status:"unknown",reason:"none"}).eligible,false);
 const e=new RealMarketPaper(new Store(initializeMarketLedger(initial(await json("config/strategy.json")))));
 // Runtime boundary protects even untyped callers from treating account inspection as creation proof.
 await assert.rejects(e.review(state as any,buy,sell,{status:"verified",reason:"unit"},{status:"verified",reason:"unit"}),/inspection/);
 const reference=await json("docs/phase5/quote-reference.json");
 assert(reference.rows.filter((r:any)=>r.venue===venue).every((r:any)=>r.equal));
});
test("DLMM unknown pair/bin versions and limit-order inventory remain unavailable",async()=>{
 const f=await json("docs/phase5/fixtures/meteora-dlmm-liquid.json");
 const b=f.batch;
 const bad=structuredClone(b);const bytes=Buffer.from(bad.accounts[f.address].data[0],"base64");
 // Exact pinned layout pair_type offset: discriminator + static32 + variable32 + bump1 + bin_step_seed2.
 bytes[75]=99;bad.accounts[f.address].data[0]=bytes.toString("base64");
 const reader:MarketReader={provider:b.provider,accounts:async keys=>({...bad,retrievedAt:Date.now(),retrievedMono:performance.now(),accounts:Object.fromEntries(keys.map(k=>[k,bad.accounts[k]??null]))}),largest:async()=>({slot:b.contextSlot,amounts:[]})};
 const adapter=new PoolMarketAdapter("meteora-dlmm"),state=await adapter.inspect(f.address,reader);
 assert.throws(()=>adapter.quote(state,"buy",1000000n,100),/unsupported/);
 const binAddress=poolSpec("meteora-dlmm",b,f.address).extras.slice(0,3).find(k=>b.accounts[k]);
 assert(binAddress);
 const corruptBin=structuredClone(b),binBytes=Buffer.from(corruptBin.accounts[binAddress].data[0],"base64");
 binBytes[16]=99;corruptBin.accounts[binAddress].data[0]=binBytes.toString("base64");
 await assert.rejects(adapter.inspect(f.address,{...reader,accounts:async keys=>({...corruptBin,retrievedAt:Date.now(),retrievedMono:performance.now(),accounts:Object.fromEntries(keys.map(k=>[k,corruptBin.accounts[k]??null]))})}),/version mismatch/);
});
test("Actual mainnet creation proofs reach durable paper decisions with genuine rejection evidence",async()=>{
 const report=await json("docs/phase5/mainnet/evidence.json");let verified=0;
 for(const row of report.rows.filter((r:any)=>r.verifiedLaunches>0)) {
  const tx=report.captured.find((r:any)=>r.method==="getTransaction"&&r.signature===row.event.signature).result;
  const keys=requiredLaunchAccounts("pump",tx);
  const accountProof=report.captured.find((r:any)=>r.method==="getMultipleAccounts"&&keys.every(k=>k in r.result.accounts));
  const launches=decodeVerifiedTransaction("pump",tx,accountProof.result);
  assert(launches.length>0);verified++;
  const review=report.ledger.marketReviews.find((r:any)=>r.id===launches[0].id);
  assert(review);assert(review.reasons.length>0);assert.equal(review.evidence.state.launch.signature,row.event.signature);
  assert.equal(review.evidence.risk.eligible,false);
  // Replaying a once-current discovery cannot refresh its receipt or bypass the entry-age gate.
  const e=new RealMarketPaper(new Store(initializeMarketLedger(initial(await json("config/strategy.json")))));
  const service=new MarketService(e,{provider:"unit-unused",accounts:async()=>{throw Error("Stale event must not read");},largest:async()=>({slot:0,amounts:[]})});
  await service.evaluate(review.evidence.state.launch);await service.close();
  assert.equal(e.store.state.trades.length,0);assert(e.store.state.marketReviews![0].reasons.some(r=>r.includes("Stale")));
 }
 assert(verified>=1);assert.equal(report.ledger.trades.length,0);assert.equal(report.liveTrading,false);
});
