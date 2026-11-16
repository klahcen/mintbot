import test from "node:test";
import assert from "node:assert/strict";
import { VersionedTransaction } from "@solana/web3.js";
import { SOL } from "../src/market/accounts.js";
import { constructionCase } from "./simulation-fixtures.js";
import { simulationAccounting } from "../src/simulation/accounting.js";
import type { SimulationResult, SwapPlan } from "../src/simulation/types.js";
function sellEffects(plan:SwapPlan):SimulationResult {
 const keys=VersionedTransaction.deserialize(Buffer.from(plan.unsignedBase64,"base64")).message.staticAccountKeys.map(k=>k.toBase58());
 const base=keys.indexOf(plan.source),payer=keys.indexOf(plan.user),native=keys.map(()=>1000000000),post=[...native];
 const wrapped=plan.venue!=="pump"&&!plan.accountCreations.some(c=>c.address===plan.destination);
 post[payer]+=Number((wrapped?0n:plan.quote.output)-5500n);
 const token=(accountIndex:number,mint:string,decimals:number,amount:bigint)=>({accountIndex,mint,uiTokenAmount:{amount:amount.toString(),decimals}});
 const preTokenBalances:any[]=[token(base,plan.state.mint,plan.state.decimals,plan.input+3n)],postTokenBalances:any[]=[token(base,plan.state.mint,plan.state.decimals,3n)];
 if(wrapped){const i=keys.indexOf(plan.destination);preTokenBalances.push(token(i,SOL,9,7n));postTokenBalances.push(token(i,SOL,9,7n+plan.quote.output));}
 return {kind:"unsigned-protocol-simulation",provider:plan.state.provider,commitment:"finalized",contextSlot:plan.state.slot,observedAt:Date.now(),messageDigest:plan.messageDigest,success:true,error:null,logs:[],unitsConsumed:100000,fee:"5500",accounts:null,preBalances:native,postBalances:post,preTokenBalances,postTokenBalances,raw:{},signatureVerified:false,submitted:false};
}
for(const venue of ["pump","pumpswap","raydium-cpmm","meteora-dlmm"] as const)test(`Sell native/WSOL accounting reconciles ${venue} and rejects unexplained native effects`,async()=>{
 const fixture=await constructionCase(venue,"sell"),plan=await fixture.plan(),effects=sellEffects(plan),a=simulationAccounting(plan,effects);
 assert.deepEqual(a.reasons,[]);assert.equal(a.simulatedOutputAtoms,plan.quote.output.toString());assert.equal(a.quoteDifferenceAtoms,"0");assert.equal(a.nativeDifferenceLamports,"0");
 const changed=structuredClone(effects),keys=VersionedTransaction.deserialize(Buffer.from(plan.unsignedBase64,"base64")).message.staticAccountKeys.map(k=>k.toBase58());
 (changed.postBalances![keys.indexOf(plan.user)] as number)-=1;assert.equal(simulationAccounting(plan,changed).consistent,false);
 const missing={...effects,postTokenBalances:null};assert.equal(simulationAccounting(plan,missing).consistent,false);
});
