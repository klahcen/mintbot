/** Recompute accounting from captured actual RPC responses; these fixtures are never refreshed into trading evidence. */
import test from"node:test";import assert from"node:assert/strict";import{VersionedTransaction}from"@solana/web3.js";import{json}from"./market-fixtures.js";import{sha}from"../src/simulation/builders.js";import{simulationAccounting}from"../src/simulation/accounting.js";import type{SwapPlan}from"../src/simulation/types.js";
const files={pump:"mainnet-pump-public-payer.json",pumpswap:"mainnet-simulation-final-bank.json","raydium-cpmm":"mainnet-simulation-final-bank.json","meteora-dlmm":"mainnet-dlmm-current-pool.json"};
for(const venue of Object.keys(files)as(keyof typeof files)[])test(`Captured ${venue} actual unsigned simulation has matching effects and no execution claim`,async()=>{
 const report=await json(`docs/phase6/${files[venue]}`),row=report.rows.find((r:any)=>r.venue===venue&&r.result?.simulation?.success);assert(row);
 const simulation=row.result.simulation,raw=row.result.intent.data.plan;
 const plan={...raw,input:BigInt(raw.input),minimumOutput:BigInt(raw.minimumOutput),rentLamports:BigInt(raw.rentLamports),quote:{...raw.quote},authorization:{...raw.authorization}};
 for(const k of["input","output","minimumOutput","poolFee","impactBps"])(plan.quote as any)[k]=BigInt(raw.quote[k]);
 for(const k of["minimumOutput","maximumInput","maximumRent","maximumNetworkFee","maximumPriorityFee","microLamports"])(plan.authorization as any)[k]=BigInt(raw.authorization[k]);
 const tx=VersionedTransaction.deserialize(Buffer.from(plan.unsignedBase64,"base64"));assert(tx.signatures.every(s=>s.every(b=>b===0)));assert.equal(sha(Buffer.from(tx.message.serialize())),simulation.messageDigest);
 assert.equal(simulation.submitted,false);assert.equal(simulation.signatureVerified,false);assert.equal(row.paperEntryAttempted,false);
 assert(simulation.logs.some((l:string)=>l===`Program ${plan.program} success`));assert(simulation.unitsConsumed>0);
 const accounting=simulationAccounting(plan as SwapPlan,simulation);assert.equal(accounting.consistent,true);assert.equal(accounting.quoteDifferenceAtoms,"0");assert.equal(accounting.nativeDifferenceLamports,"0");assert.equal(accounting.realExecution,false);
});
