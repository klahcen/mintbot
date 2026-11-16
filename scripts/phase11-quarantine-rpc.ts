/** Bounded finalized evidence rereads; original WAL stays unchanged and quarantined. */
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {VerifiedReadRpc} from "../src/verified-rpc.js";
import {DecoderRegistry} from "../src/decoders.js";
if(!process.argv.includes("--run"))throw Error("Explicit --run required");
const evidence=JSON.parse(await readFile("docs/phase10/runtime-reconciliation.json","utf8"));
if(evidence.quarantined.length>100)throw Error("Quarantine RPC population bound");
const endpoint=process.env.SOLANA_RPC_URL??"https://api.mainnet-beta.solana.com",rpc=new VerifiedReadRpc(endpoint),registry=new DecoderRegistry(),rows:any[]=[];
let captureBytes=0,dropped=0;
for(let at=0;at<evidence.quarantined.length;at+=4){
 const results=await Promise.all(evidence.quarantined.slice(at,at+4).map(async(item:any)=>{
  const row:any={id:item.id,originalObservedAt:item.observation.observedAt,expectedSlot:item.observation.slot};
  try{
   const tx=await rpc.transaction(item.observation.signature);
   if(!tx){row.issue="Finalized transaction unavailable";return row;}
   row.identityMatches=tx.slot===item.observation.slot&&tx.transaction.signatures[0]===item.observation.signature;
   if(!row.identityMatches){row.issue="Finalized provider transaction identity/slot conflict";return row;}
   row.transactionSha256=createHash("sha256").update(JSON.stringify(tx)).digest("hex");
   if(!Array.isArray(tx.meta?.logMessages)){row.issue="Finalized logs unavailable";return row;}
   row.logsEqualOriginal=JSON.stringify(tx.meta.logMessages)===JSON.stringify(item.observation.logs);
   row.truncationMarker=tx.meta.logMessages.some((l:string)=>/log(?:s)? truncated/i.test(l));
   try{row.decoded=registry.decode({...item.observation,logs:tx.meta.logMessages}).launches.length;row.decodeStatus="inspection-decoded";}
   catch(error){row.decodeStatus="still-rejected";row.decodeIssue=(error as Error).message;}
   const bytes=Buffer.byteLength(JSON.stringify(tx));
   if(captureBytes+bytes<=16*1024*1024){captureBytes+=bytes;row.transaction=tx;}else{dropped++;row.captureOmitted="16MiB artifact population limit";}
  }catch(error){row.issue=(error as Error).message;}
  return row;
 }));rows.push(...results);
}
await writeFile("docs/phase11/quarantine-finalized-rpc.json",JSON.stringify({generatedAt:new Date().toISOString(),provider:new URL(endpoint).host,rows,captureBytes,dropped,liveTrading:false,scope:"At most 100 original signatures, four concurrent requests, five-second/4MiB request bounds, no retries. Matching finalized logs remain provider observations, not independently complete history. Different logs are attached for inspection only; original WAL payload, identity, time, ownership, quarantine and gap are never replaced or completed."},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({rows:rows.length,available:rows.filter(r=>r.identityMatches).length,issues:rows.filter(r=>r.issue).length,stillRejected:rows.filter(r=>r.decodeStatus==="still-rejected").length,dropped}));
