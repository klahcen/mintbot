import test from "node:test";
import assert from "node:assert/strict";
import {VersionedTransaction} from "@solana/web3.js";
import {readFile} from "node:fs/promises";
import {disposePosition,reconcileEconomics,type EconomicPosting} from "../src/simulation/economics.js";
const files={pump:"mainnet-pump-public-payer.json",pumpswap:"mainnet-simulation-final-bank.json","raydium-cpmm":"mainnet-simulation-final-bank.json","meteora-dlmm":"mainnet-dlmm-current-pool.json"};
for(const [venue,file] of Object.entries(files))test(`Exact economic postings reconcile retained real ${venue} unsigned buy simulation`,async()=>{
 const report=JSON.parse(await readFile(`docs/phase6/${file}`,"utf8")),row=report.rows.find((r:any)=>r.venue===venue&&r.result?.simulation?.success),plan=row.result.intent.data.plan,sim=row.result.simulation;
 // These captured routes created WSOL temporarily or used native Pump; preserve any existing output inventory.
 const persistentRent=plan.accountCreations.filter((c:any)=>c.mint!=="So11111111111111111111111111111111111111112").reduce((n:bigint,c:any)=>n+BigInt(c.rent),0n);
 const priority=(BigInt(plan.authorization.computeUnits)*BigInt(plan.authorization.microLamports)+999999n)/1000000n;
 const payerIndex=0;assert.equal(plan.user,plan.authorization.user);
 const keys=VersionedTransaction.deserialize(Buffer.from(plan.unsignedBase64,"base64")).message.staticAccountKeys.map(k=>k.toBase58());
 const out=sim.postTokenBalances.find((r:any)=>r.mint===plan.state.mint&&keys[r.accountIndex]===plan.destination);assert(out);assert.equal(out.uiTokenAmount.decimals,plan.state.decimals);
 const before=sim.preTokenBalances.find((r:any)=>r.mint===plan.state.mint&&keys[r.accountIndex]===plan.destination)?.uiTokenAmount.amount;
 if(before===undefined)assert(plan.accountCreations.some((c:any)=>c.address===plan.destination));
 const postings:EconomicPosting[]=[{asset:"SOL",purpose:"swap-principal",delta:`-${plan.input}`},{asset:"SOL",purpose:"base-fee",delta:(-(BigInt(sim.fee)-priority)).toString()},{asset:"SOL",purpose:"priority-fee",delta:(-priority).toString()},{asset:"SOL",purpose:"ata-rent",delta:(-persistentRent).toString()},{asset:plan.state.mint,purpose:"swap-principal",delta:plan.quote.output}];
 const result=reconcileEconomics([{asset:"SOL",before:String(sim.preBalances[payerIndex]),after:String(sim.postBalances[payerIndex])},{asset:plan.state.mint,before:before??"0",after:out.uiTokenAmount.amount}],postings,"success");assert.equal(result.consistent,true,JSON.stringify(result));assert.equal(result.realExecution,false);
});
test("Failed atomic transaction permits authoritative base and priority charges only",()=>{
 const observed=[{asset:"SOL",before:"1000000",after:"994000"},{asset:"TOKEN",before:"99",after:"99"}];
 const fees:EconomicPosting[]=[{asset:"SOL",purpose:"base-fee",delta:"-5000"},{asset:"SOL",purpose:"priority-fee",delta:"-1000"}];
 assert.equal(reconcileEconomics(observed,fees,"failed").consistent,true);
 const incorrect=reconcileEconomics(observed,[...fees,{asset:"SOL",purpose:"ata-rent",delta:"-1"}],"failed");assert.equal(incorrect.consistent,false);assert(incorrect.reasons.some(r=>r.includes("Failed atomic")));
});
test("Wrapped SOL, rent lock/refund, pool/platform fees and explicit one-atom rounding reconcile without floats",()=>{
 const observed=[{asset:"SOL",before:"10000000",after:"8994000"},{asset:"WSOL",before:"0",after:"1000000"},{asset:"TOKEN",before:"1000",after:"888"}];
 const postings:EconomicPosting[]=[{asset:"SOL",purpose:"wrap",delta:"-1000000"},{asset:"WSOL",purpose:"wrap",delta:"1000000"},{asset:"SOL",purpose:"base-fee",delta:"-5000"},{asset:"SOL",purpose:"priority-fee",delta:"-1000"},{asset:"SOL",purpose:"ata-rent",delta:"-2039280"},{asset:"SOL",purpose:"rent-refund",delta:"2039280"},{asset:"TOKEN",purpose:"swap-principal",delta:"-100"},{asset:"TOKEN",purpose:"pool-fee",delta:"-10"},{asset:"TOKEN",purpose:"platform-fee",delta:"-1"},{asset:"TOKEN",purpose:"rounding",delta:"-1"}];
 assert.equal(reconcileEconomics(observed,postings,"success").consistent,true);
 const missing=postings.filter(p=>p.purpose!=="rounding");assert.equal(reconcileEconomics(observed,missing,"success").consistent,false);
 assert.equal(reconcileEconomics(observed,postings.filter(p=>p.asset!=="WSOL"),"success").consistent,false);
});
test("Partial disposal preserves exact total cost and final dust absorbs the division remainder",()=>{
 let p={quantityAtoms:"3",costLamports:"10",realizedPnlLamports:"0"};
 const first=disposePosition(p,"1","5");assert.equal(first.allocatedCostLamports,"3");p=first.position;
 const second=disposePosition(p,"1","5");assert.equal(second.allocatedCostLamports,"3");p=second.position;
 const last=disposePosition(p,"1","5");assert.equal(last.allocatedCostLamports,"4");assert.deepEqual(last.position,{quantityAtoms:"0",costLamports:"0",realizedPnlLamports:"5"});
 assert.throws(()=>disposePosition(last.position,"1","1"),/held inventory/);
 const huge=disposePosition({quantityAtoms:"999999999999999999999",costLamports:"1000000000000000000001",realizedPnlLamports:"-2"},"1","0");assert.equal(huge.allocatedCostLamports,"1");assert.equal(huge.position.realizedPnlLamports,"-3");
});
test("Unknown/missing balances, duplicate assets and incorrect fee currency fail closed",()=>{
 assert.equal(reconcileEconomics([],[],"success").consistent,false);
 assert.throws(()=>reconcileEconomics([{asset:"SOL",before:"1.1",after:"1"}],[],"success"),/integer/);
 assert.throws(()=>reconcileEconomics([{asset:"SOL",before:9007199254740993 as any,after:"1"}],[],"success"),/integer/);
 assert.equal(reconcileEconomics([{asset:"TOKEN",before:"6",after:"1"}],[{asset:"TOKEN",purpose:"rounding",delta:"-5"}],"success").consistent,false);
 assert.throws(()=>reconcileEconomics([{asset:"SOL",before:"1",after:"1"},{asset:"SOL",before:"1",after:"1"}],[],"success"),/Duplicate/);
 assert.equal(reconcileEconomics([{asset:"TOKEN",before:"6",after:"1"}],[{asset:"TOKEN",purpose:"base-fee",delta:"-5"}],"success").consistent,false);
});
