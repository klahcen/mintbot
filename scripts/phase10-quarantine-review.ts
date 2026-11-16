/** Offline, exclusive-owner, fsynced review/retry; never completes or deletes pending work. */
import { readFile, writeFile } from "node:fs/promises";
import { AsyncEventJournal } from "../src/async-journal.js";
const args=process.argv.slice(2),arg=(key:string)=>{const i=args.indexOf(key);if(i<0||!args[i+1])throw Error(`Required ${key}`);return args[i+1]!;};
if(!args.includes("--apply"))throw Error("Explicit --apply required for durable quarantine metadata review");
const plan=JSON.parse(await readFile(arg("--plan"),"utf8"));const rows=Array.isArray(plan)?plan:plan.reviewPlan;
if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error("Review population bound 1..100");
const journal=await AsyncEventJournal.open({path:arg("--journal")}),results:unknown[]=[];
try{
 for(const row of rows){
  await journal.reviewQuarantineDurable(row.id,row.expectedFingerprint,row.review);
  results.push({id:row.id,decision:row.review.decision,retained:true});
 }
 await journal.checkpoint();
 await writeFile(arg("--output"),JSON.stringify({generatedAt:new Date().toISOString(),results,status:journal.status(),liveTrading:false,scope:"Exclusive offline WAL review. Pending identities/timestamps retained; attempts not reset; at most three reviews and ten attempts. A retry is not gap recovery, fresh evidence, or trading permission. Runtime must be stopped before review."},null,2)+"\n",{flag:"wx"});
}finally{await journal.shutdown();}
