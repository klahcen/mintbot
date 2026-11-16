/** These are actual retained RPC results. Fixture clocks are not refreshed into trading evidence. */
import test from "node:test";
import assert from "node:assert/strict";
import { VersionedTransaction } from "@solana/web3.js";
import { json } from "./market-fixtures.js";
import { simulationAccounting } from "../src/simulation/accounting.js";
import { sha } from "../src/simulation/builders.js";
import type { SwapPlan } from "../src/simulation/types.js";
const files={pump:"sells-retry.json",pumpswap:"sells-inventory.json","raydium-cpmm":"sells-raydium.json","meteora-dlmm":"sells-inventory.json"};
for(const [venue,file] of Object.entries(files))test(`Actual recorded ${venue} sell simulation reconciles native/token effects`,async()=>{
 const report=await json(`docs/phase7/${file}`),row=report.rows.find((r:any)=>r.venue===venue),attempt=row.attempts.find((a:any)=>a.simulation?.success);assert(attempt);
 const raw=attempt.plan,plan={...raw,input:BigInt(raw.input),minimumOutput:BigInt(raw.minimumOutput),rentLamports:BigInt(raw.rentLamports),quote:{...raw.quote},authorization:{...raw.authorization}};
 for(const k of ["input","output","minimumOutput","poolFee","impactBps"])plan.quote[k]=BigInt(raw.quote[k]);
 for(const k of ["minimumOutput","maximumInput","maximumRent","maximumPriorityFee","maximumNetworkFee","microLamports"])plan.authorization[k]=BigInt(raw.authorization[k]);
 const tx=VersionedTransaction.deserialize(Buffer.from(plan.unsignedBase64,"base64"));assert(tx.signatures.every(s=>s.every(b=>b===0)));assert.equal(sha(Buffer.from(tx.message.serialize())),attempt.simulation.messageDigest);
 assert.equal(plan.quote.side,"sell");assert.equal(attempt.simulation.submitted,false);assert.equal(attempt.simulation.signatureVerified,false);
 assert(attempt.simulation.logs.includes(`Program ${plan.program} success`));
 const assessment=simulationAccounting(plan as SwapPlan,attempt.simulation);assert.deepEqual(assessment.reasons,[]);assert.equal(assessment.quoteDifferenceAtoms,"0");assert.equal(assessment.nativeDifferenceLamports,"0");assert.equal(assessment.tokenDelta,(-plan.input).toString());assert.equal(assessment.realExecution,false);
});
