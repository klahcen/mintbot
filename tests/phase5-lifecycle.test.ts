import test from "node:test";
import assert from "node:assert/strict";
import { initial, Store, load } from "../src/store.js";
import { transition, verifiedLifecycle } from "../src/market/lifecycle.js";
import { marketPolicy } from "../src/market/policy.js";
import { marketRisk } from "../src/market/risk.js";
import { json, paperCase } from "./market-fixtures.js";
import { initializeMarketLedger, RealMarketPaper } from "../src/market/paper.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const subject = { id:"unit-observation",signature:"unit-signature",program:"pump",slot:100,receiptAt:1000 };
test("Lifecycle records processed/confirmed/finalized commitments without promoting provisional evidence", async()=>{
 const s=initial(await json("config/strategy.json"));
 transition(s,subject,"DETECTED","processed","a","receipt",1000);
 transition(s,subject,"PROVISIONAL","confirmed","a","preparation",1400);
 assert.throws(()=>transition(s,subject,"VERIFIED","confirmed","a","wrong",1500),/Finalized/);
 transition(s,subject,"VERIFIED","finalized","a","proof",14000);
 transition(s,subject,"ELIGIBLE","finalized","a","risk",14050);
 transition(s,subject,"PAPER_EXECUTED","finalized","a","ledger",14060);
 assert.deepEqual(s.marketLifecycle![0].transitions.map(t=>t.commitment),["processed","confirmed","finalized","finalized","finalized"]);
 assert.equal(s.marketLifecycle![0].transitions[2].ageMs,13000);
});
for (const conflict of ["slot","signature","commitment"] as const) test(`Lifecycle ${conflict} conflicts invalidate durable observations`,async()=>{
 const store=new Store(initial(await json("config/strategy.json")));
 await store.paperTransaction(s=>transition(s,subject,"DETECTED","confirmed","a","receipt",1000));
 const ok=await store.paperTransaction(s=>transition(s,conflict==="slot"?{...subject,slot:101}:conflict==="signature"?{...subject,signature:"fork"}:subject,"PROVISIONAL",conflict==="commitment"?"processed":"confirmed","b","conflict",1100));
 assert.equal(ok,false);assert.equal(store.state.marketLifecycle![0].invalidated,true);
 await assert.rejects(store.paperTransaction(s=>transition(s,subject,"PROVISIONAL","finalized","a","retry",1200)),/invalidated/);
});
test("Named finalized research policy changes only labeled entry age bounds",async()=>{
 const c=await paperCase(),now=Date.now();
 c.state.launch.freshness!.receiptAt=now-20000;c.state.launch.freshness!.eventTimeMs=now-21000;
 assert.equal(marketRisk(c.state,c.buy,c.sell,c.fees,c.version,now).eligible,false);
 const policy=marketPolicy("finalized-paper-research");
 assert.equal(marketRisk(c.state,c.buy,c.sell,c.fees,c.version,now,policy).eligible,true);
 c.state.launch.freshness!.origin="history";
 assert.equal(marketRisk(c.state,c.buy,c.sell,c.fees,c.version,now,policy).eligible,false);
 c.state.launch.freshness!.origin="live";c.state.signals.holderConcentration={status:"unknown",reason:"missing complete owners"};
 assert.equal(marketRisk(c.state,c.buy,c.sell,c.fees,c.version,now,policy).eligible,false);
 assert.throws(()=>marketPolicy("relaxed"),/Unknown/);assert.equal(Object.isFrozen(policy),true);
});
test("Research entry records policy and lifecycle with exact cost basis and survives concurrent duplicate restart",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"mintbot-phase5-"));
 try {
 const c=await paperCase(),config=await json("config/strategy.json");Object.assign(config,{tradeSol:.00001,minLiquiditySol:0});
 const s=initializeMarketLedger(initial(config));s.running=true;
 const e=new RealMarketPaper(new Store(s,join(dir,"ledger"),undefined,32,true),undefined,marketPolicy("finalized-paper-research"));
 c.state.launch.freshness!.receiptAt=Date.now()-20000;c.state.launch.freshness!.eventTimeMs=Date.now()-20000;
 const rs=await Promise.all(Array.from({length:12},()=>e.review(c.state,c.buy,c.sell,c.fees,c.version)));
 assert.equal(rs.filter(r=>"positionId" in r).length,1);
 assert.equal(e.store.state.trades.length,1);assert.equal(e.store.state.positions[0].market!.costLamports,"15000");
 assert.equal((e.store.state.marketReviews![0].evidence.policy as any).name,"finalized-paper-research");
 assert.equal(e.store.state.marketLifecycle![0].transitions.at(-1)!.state,"PAPER_EXECUTED");
 const restarted=new RealMarketPaper(await load(join(dir,"ledger"),s,undefined,true));
 assert.deepEqual(await restarted.review(c.state,c.buy,c.sell,c.fees,c.version),{duplicate:true});
 assert.equal(restarted.store.state.running,false);assert.equal(restarted.store.state.trades.length,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test("Review history is immutable and an unsuccessful mutation cannot change committed evidence",async()=>{
 const c=await paperCase(),s=initializeMarketLedger(initial(await json("config/strategy.json")));
 const e=new RealMarketPaper(new Store(s));await e.review(c.state,c.buy,c.sell,c.fees,c.version);
 const row=e.store.state.marketReviews![0];assert(Object.isFrozen(row.evidence));
 await assert.rejects(e.store.paperTransaction(next=>{next.marketReviews![0].reasons.push("mutated");}),TypeError);
 assert(!e.store.state.marketReviews![0].reasons.includes("mutated"));
 assert.equal(verifiedLifecycle(e.store.state,c.state.launch).signature,c.state.launch.signature);
});
test("Risk evidence retains actual observation age and separates mixed receipt/fee evidence from finalized proof",async()=>{
 const c=await paperCase(),now=Date.now();
 c.state.retrievedAt=now-25;c.state.launch.verifiedAt=now-100;
 c.state.launch.freshness!.receiptAt=now-1000;c.version.observedAt=now-500;
 const risk=marketRisk(c.state,c.buy,c.sell,c.fees,c.version,now);
 assert.equal(risk.signals.mintAuthority.ageMs,25);
 assert.equal(risk.signals.mintAuthority.commitment,"finalized");
 assert.equal(risk.signals.creationCommitment.ageMs,100);
 assert.equal(risk.signals.creationCommitment.commitment,"finalized");
 assert.equal(risk.signals.freshness.commitment,"mixed");
 assert.equal(risk.signals.freshness.ageMs,1000);
 assert.equal(risk.signals.networkFees.commitment,"mixed");
 assert.equal(risk.signals.deployment.ageMs,500);
 assert.equal(risk.signals.creatorHistory.commitment,"unknown");
 assert.equal(risk.signals.creatorHistory.observedAt,undefined);
});
