/** Deliberately perturbed recorded-state UNIT fixtures, not real-chain price moves or PnL. */
import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { paperCase,json } from "./market-fixtures.js";
import { initial,Store } from "../src/store.js";
import { RealMarketPaper,initializeMarketLedger } from "../src/market/paper.js";
async function position(){
 const c=await paperCase(),config=await json("config/strategy.json");
 Object.assign(config,{tradeSol:.00001,minLiquiditySol:0,stopLossBps:1500,takeProfitBps:3000,trailingStopBps:1000});
 const s=initializeMarketLedger(initial(config));s.running=true;const e=new RealMarketPaper(new Store(s));
 await e.review(c.state,c.buy,c.sell,c.fees,c.version);return{c,e,p:e.store.state.positions[0]};
}
function quote(c:Awaited<ReturnType<typeof paperCase>>,amount:string,multiplier:number){
 const s=structuredClone(c.state);s.quoteReserve=s.quoteReserve*BigInt(multiplier)/100n;
 s.retrievedAt=Date.now();s.retrievedMono=performance.now();s.digest=`unit-perturbed-reserves:${multiplier}`;
 return{s,q:c.adapter.quote(s,"sell",BigInt(amount),100)};
}
for(const [name,multiplier]of[["take-profit",300],["stop-loss",100]] as const)test(`Automatic ${name} uses fresh integer sell estimates and reconciles modeled fees`,async()=>{
 const {c,e,p}=await position(),{s,q}=quote(c,p.market!.atoms,multiplier);
 await e.exit(p.id,s,q,c.fees,c.version,true);assert.equal(e.store.state.positions.length,0);
 assert.equal(e.store.state.trades[0].reason,`Validated quote ${name}`);
 const proceeds=q.minimumOutput-5000n,pnl=proceeds-15000n;
 assert.equal(e.store.state.marketLedger!.realizedPnlLamports,pnl.toString());
 assert.equal(e.store.state.marketLedger!.balanceLamports,(10000000000n+pnl).toString());
});
test("Trailing stop follows net executable price high, then exits on fresh reversal",async()=>{
 const{c,e,p}=await position();await e.store.paperTransaction(s=>{s.strategies[0].takeProfitBps=100000;});
 const high=quote(c,p.market!.atoms,300);await e.exit(p.id,high.s,high.q,c.fees,c.version,true);
 assert.equal(e.store.state.positions.length,1);const low=quote(c,p.market!.atoms,250);
 await e.exit(p.id,low.s,low.q,c.fees,c.version,true);assert.equal(e.store.state.trades[0].reason,"Validated quote trailing-stop");
});
test("Liquidity deterioration can trigger an exit only while a complete fresh route remains available",async()=>{
 const{c,e,p}=await position(),{s,q}=quote(c,p.market!.atoms,200);s.liquidityLamports=s.liquidityLamports*49n/100n;
 await e.exit(p.id,s,q,c.fees,c.version,true);assert.equal(e.store.state.trades[0].reason,"Validated quote liquidity-drop");
});
for(const issue of ["stale","impact","restriction","fees"] as const)test(`Automatic exit with ${issue} retains position and cost basis`,async()=>{
 const{c,e,p}=await position(),{s,q}=quote(c,p.market!.atoms,200);
 if(issue==="stale")q.expiresMono=performance.now()-1;
 if(issue==="impact")q.impactBps=501n;
 if(issue==="restriction")s.signals.transferRestrictions={status:"failed",reason:"restricted"};
 if(issue==="fees")(c.fees.value as any).observedAt=Date.now()-6000;
 await assert.rejects(e.exit(p.id,s,q,c.fees,c.version,true));
 assert.equal(e.store.state.positions[0].market!.costLamports,"15000");assert.equal(e.store.state.trades.length,1);
});
test("Unavailable reserve-backed route cannot guarantee a stop loss",async()=>{
 const{c,e,p}=await position();c.state.liquidityLamports=0n;
 assert.throws(()=>c.adapter.quote(c.state,"sell",BigInt(p.market!.atoms),100),/sell route/);
 assert.equal(e.store.state.positions.length,1);assert.equal(e.store.state.marketLedger!.realizedPnlLamports,"0");
});
