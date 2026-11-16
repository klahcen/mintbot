/** Strict decode of authentic retained finalized fixtures; history never becomes fresh. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeVerifiedTransaction } from '../src/verified-decoders.js';
import { VerifiedReadRpc } from '../src/verified-rpc.js';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const rows:unknown[]=[];
for(const venue of ['pump','pumpswap','raydium-cpmm','meteora-dlmm']){
 const path=`docs/phase3/fixtures/${venue}-creation.json`,bytes=await readFile(path);
 const tx=JSON.parse(bytes.toString()).result,accounts=JSON.parse(await readFile(`docs/phase3/fixtures/${venue}-accounts.json`,'utf8'));
 rows.push({venue,path,sha256:createHash('sha256').update(bytes).digest('hex'),signature:tx.transaction.signatures[0],slot:tx.slot,
  verified:decodeVerifiedTransaction(venue,tx,accounts),freshnessOrigin:'history',eligibleForPaper:false});
}
const path='docs/phase13/raydium-current-creation-fixture.json',bytes=await readFile(path),fixture=JSON.parse(bytes.toString());
const tx=fixture.capturedFinalizedTransactionsAndAccounts.find((r:any)=>r.method==='getTransaction').result;
const accounts=fixture.capturedFinalizedTransactionsAndAccounts.find((r:any)=>r.method==='getMultipleAccounts').result;
const row:any={venue:'raydium-cpmm',path,sha256:createHash('sha256').update(bytes).digest('hex'),
 originalObservation:fixture.originalObservation,wireIdentitySha256:fixture.wireIdentitySha256,
 originalQuarantine:fixture.originalQuarantine,verified:decodeVerifiedTransaction('raydium-cpmm',tx,accounts),
 freshnessOrigin:'history',eligibleForPaper:false};
try{row.currentRead=await new VerifiedReadRpc(process.env.SOLANA_RPC_URL??'https://solana-rpc.publicnode.com',
 {minimumIntervalMs:350,deadlineMs:8000,maximumAttempts:2,capacity:4}).verify('raydium-cpmm',fixture.originalObservation.signature,fixture.originalObservation.slot);}
catch(error){row.currentReadIssue=(error as Error).message;}
rows.push(row);
await writeFile('docs/phase14/creation-fixtures.json',JSON.stringify({rows,newVariantsEnabled:false,liveTrading:false,
 scope:'Bounded finalized fixtures, retained account evidence and current Raydium reread. Account rereads do not reconstruct the historical bank. Original quarantine remains immutable.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(rows.map((r:any)=>({venue:r.venue,path:r.path,verified:r.verified.length,currentRead:r.currentRead?.length,issue:r.currentReadIssue}))));
