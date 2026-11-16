/** Reproduce the original 18 creation-verification failures from retained finalized bytes. */
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {requiredLaunchAccounts,decodeVerifiedTransaction} from "../src/verified-decoders.js";
const outputIndex=process.argv.indexOf("--output"),output=outputIndex<0?"docs/phase10/protocol-variant-review.json":process.argv[outputIndex+1]!;
const old=JSON.parse(await readFile("docs/phase9/mainnet-2026-11-13/evidence.json","utf8"));
const sha=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const cases=old.rows.filter((r:any)=>r.verificationIssue).map((row:any)=>{
 const tx=old.captured.find((c:any)=>c.method==="getTransaction"&&c.commitment==="finalized"&&c.signature===row.event.signature)?.result;
 let issue:string|undefined,keys:string[]|undefined,decoded:number|undefined;
 if(tx)try{
  keys=requiredLaunchAccounts(row.event.program,tx);
  const batch=old.captured.find((c:any)=>c.method==="getMultipleAccounts"&&keys!.every(k=>c.result?.accounts?.[k]!==undefined))?.result;
  if(batch)decoded=decodeVerifiedTransaction(row.event.program,tx,batch).length;
  else if(keys.length)issue="Original account batch unavailable for complete replay";
  else decoded=0;
 }catch(error){issue=(error as Error).message;}
 else issue="Original finalized transaction capture unavailable";
 return {signature:row.event.signature,slot:row.event.slot,observedAt:row.event.observedAt,originalIssue:row.verificationIssue,
  finalizedCaptured:!!tx,transactionSha256:tx?sha(tx):undefined,transactionSlot:tx?.slot,transactionSuccess:tx?.meta?.err===null,
  replayIssue:issue,reproducedOriginalIssue:issue===row.verificationIssue,decoded,requiredAccounts:keys,
  disposition:"Unsupported or unverified strict creation path; not proof of malicious token risk. No variant enabled."};
});
const diagnostics=JSON.parse(await readFile("docs/phase9/market-diagnostics.json","utf8"));
const official=JSON.parse(await readFile("docs/phase10/pump-deployment/idl-pump.json","utf8"));
await writeFile(output,JSON.stringify({generatedAt:new Date().toISOString(),cases,
 phase8Cases:diagnostics.rows.map((r:any)=>({id:r.id,originalReasons:r.originalReasons,fields:r.retainedAnalysis})),
 officialSchema:{address:official.address,instructions:official.instructions.map((i:any)=>({name:i.name,discriminator:i.discriminator,args:i.args,accountNames:i.accounts.map((a:any)=>a.name)})),globalType:official.types.find((t:any)=>t.name==="Global"),bondingCurveType:official.types.find((t:any)=>t.name==="BondingCurve")},
 enabledVariants:[],liveTrading:false,scope:"Original captured finalized transactions and original account batches only. No current timestamp substitution, unsupported-layout truncation, deployment pin update, or source/binary equivalence claim."},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({cases:cases.length,exactIssueReproductions:cases.filter((r:any)=>r.reproducedOriginalIssue).length,missingCaptures:cases.filter((r:any)=>!r.finalizedCaptured).length}));
