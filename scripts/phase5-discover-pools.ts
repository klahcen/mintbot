import { writeFile } from "node:fs/promises";
import { VERIFIED_PROGRAMS } from "../src/chain.js";
const endpoint=process.env.SOLANA_RPC_URL??"https://api.mainnet-beta.solana.com";
async function read(method:string,params:unknown[]) {
 const r=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(5000)});
 if(!r.ok) throw Error(`HTTP ${r.status}`);
 const b=await r.json() as any;if(b.error) throw Error(`RPC ${b.error.code}`);return b.result;
}
const rows:any[]=[];
for(const venue of ["meteora-dlmm","raydium-cpmm"]) {
 const program=VERIFIED_PROGRAMS.find(p=>p.name===venue)!.address;
 try {
 const signatures=await read("getSignaturesForAddress",[program,{limit:6,commitment:"finalized"}]);
 for(const {signature} of signatures.slice(0,4)) {
  try {
   const tx=await read("getTransaction",[signature,{commitment:"finalized",encoding:"jsonParsed",maxSupportedTransactionVersion:1}]);
   const ixs=[...(tx?.transaction.message.instructions??[]),...(tx?.meta?.innerInstructions??[]).flatMap((x:any)=>x.instructions)];
   const pools=ixs.filter((i:any)=>i.programId===program&&i.accounts?.length>=10).map((i:any)=>({address:i.accounts[venue==="meteora-dlmm"?0:3],accounts:i.accounts}));
   rows.push({venue,signature,slot:tx?.slot,pools});
  } catch(e) {rows.push({venue,signature,issue:(e as Error).message});}
  await new Promise(r=>setTimeout(r,700));
 }
 }catch(e) {rows.push({venue,issue:(e as Error).message});}
}
await writeFile("docs/phase5/pool-discovery.json",JSON.stringify({capturedAt:new Date().toISOString(),provider:new URL(endpoint).host,scope:"Swap-derived inspection candidates only; not creation proofs",rows},null,2)+"\n");
console.log(rows);
