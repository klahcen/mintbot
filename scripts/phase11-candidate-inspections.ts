/** Preserve failed actual alternate-venue launch evidence; diagnostics never refresh the receipt. */
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MarketRpc } from '../src/market/rpc.js';
import { VerifiedReadRpc } from '../src/verified-rpc.js';
import { BorshReader } from '../src/borsh-reader.js';
import { publicEvidence } from '../src/market/types.js';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const opt=(k:string,d:string)=>process.argv.includes(k)?process.argv[process.argv.indexOf(k)+1]!:d;
const ledgerPath=opt('--ledger','docs/phase11/runtime/mainnet-validated/ledger.json'),output=opt('--output','docs/phase11/alternate-candidate-inspections.json');
const ledger=JSON.parse(await readFile(ledgerPath,'utf8')),endpoint=process.env.SOLANA_RPC_URL??'https://api.mainnet-beta.solana.com',market=new MarketRpc(endpoint),verifier=new VerifiedReadRpc(endpoint),rows:any[]=[];
const launches=ledger.marketReviews.map((r:any)=>({launch:r.evidence.launch??r.evidence.state?.launch,reasons:r.reasons})).filter((r:any)=>r.launch&&r.launch.program!=='pump').slice(0,8);
for(const {launch,reasons} of launches){const row:any={originalLaunch:launch,reasons};try{
 row.transaction=await verifier.transaction(launch.signature);row.transactionIdentityMatches=row.transaction?.slot===launch.slot&&row.transaction?.transaction?.signatures?.[0]===launch.signature;
 const batch=await market.accounts([launch.address],launch.slot);row.batch=batch;const a=batch.accounts[launch.address];if(!a)throw Error('Market account absent');const bytes=Buffer.from(a.data[0],'base64');row.bytes=bytes.length;row.sha256=createHash('sha256').update(bytes).digest('hex');
 if(launch.program==='pumpswap'){
  const idl=JSON.parse(await readFile('docs/phase11/official-schemas/pump-fun-pump-public-docs-idl-pump_amm.json','utf8')),account=idl.accounts.find((a:any)=>a.name==='Pool'),type=idl.types.find((t:any)=>t.name==='Pool').type;
  if(!bytes.subarray(0,8).equals(Buffer.from(account.discriminator)))throw Error('Pool discriminator mismatch');
  const reader=new BorshReader(bytes.subarray(8),idl.types);row.officialPrefix=reader.read(type);try{reader.finish();row.exactLayout=true;}catch(error){row.exactLayout=false;row.layoutIssue=(error as Error).message;}
 }
}catch(error){row.issue=(error as Error).message;}rows.push(row);}
await writeFile(output,JSON.stringify(publicEvidence({generatedAt:new Date().toISOString(),ledgerPath,rows,executionAuthorized:false,liveTrading:false,scope:'Actual original current receipt and finalized creation identity retained. Subsequent account/transaction inspection does not refresh the opportunity, complete attribution or authorize a changed variant.'}),null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(rows.map(({originalLaunch,bytes,exactLayout,issue})=>({venue:originalLaunch.program,signature:originalLaunch.signature,bytes,exactLayout,issue}))));
