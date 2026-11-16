/** Recheck actual selected alternate-venue receipts; no new live freshness or paper entry. */
import {readFile,writeFile} from 'node:fs/promises';
import {VerifiedReadRpc} from '../src/verified-rpc.js';
import type {AccountEvidence,ParsedChainTransaction} from '../src/verified-decoders.js';
const args=process.argv.slice(2);if(!args.includes('--run'))throw Error('Explicit --run required');
const opt=(k:string,d:string)=>args.includes(k)?args[args.indexOf(k)+1]!:d;
const e=JSON.parse(await readFile(opt('--evidence','docs/phase12/runtime/final-mainnet/evidence.json'),'utf8')),output=opt('--output','docs/phase12/postrun-creation-verification.json'),captured:unknown[]=[],rows:any[]=[];
class Capture extends VerifiedReadRpc{
 override async transaction(sig:string):Promise<ParsedChainTransaction|null>{const result=await super.transaction(sig);captured.push({method:'getTransaction',signature:sig,result});return result;}
 override async accounts(keys:string[]):Promise<AccountEvidence>{const result=await super.accounts(keys);captured.push({method:'getMultipleAccounts',keys,result});return result;}
}
const endpoint=process.env.SOLANA_RPC_URL??'https://api.mainnet-beta.solana.com',rpc=new Capture(endpoint);
for(const candidate of e.rows.filter((r:any)=>['raydium-cpmm','meteora-dlmm'].includes(r.event.program)).slice(0,8)){
 const row:any={original:candidate.event,originalVerificationIssue:candidate.verificationIssue,attempts:[]};
 for(let n=0;n<2;n++){
  try{const verified=await rpc.verify(candidate.event.program,candidate.event.signature,candidate.event.slot);row.attempts.push({at:Date.now(),verified:verified?.map(l=>({...l,freshness:{origin:'history',receiptAt:candidate.event.observedAt,eventSlot:l.slot,chainHeadSlot:null,eventTimeMs:l.blockTimeMs}}))});if(verified)break;}
  catch(error){row.attempts.push({at:Date.now(),issue:(error as Error).message});}
  if(n===0)await new Promise(r=>setTimeout(r,1500));
 }
 rows.push(row);
}
await writeFile(output,JSON.stringify({generatedAt:new Date().toISOString(),provider:new URL(endpoint).host,rows,captured,eligibleForPaper:false,liveTrading:false,scope:'At most eight actual selected alternate receipts, two bounded verification attempts each. Post-run finalized proof does not retroactively satisfy entry freshness, independent coverage or provider policy. Original receipt/time are retained.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({rows:rows.length,verified:rows.filter(r=>r.attempts.some((a:any)=>a.verified?.length)).length}));
