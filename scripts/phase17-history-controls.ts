/** Selected historical controls only: successful fetches never resolve a gap or approve a version. */
import { readFile, open } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { ReadOnlyProbe } from '../src/research/validation-probe.js';
import { inspectSignedWire } from '../src/research/signed-wire-inspection.js';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const output=process.argv[process.argv.indexOf('--output')+1];if(!output||!process.argv.includes('--output'))throw Error('New --output file required');
const env={...parseEnv(await readFile('.env','utf8')),...process.env};if((env.MODE??'paper')!=='paper')throw Error('Paper mode required');
const history=JSON.parse(await readFile('docs/phase11/coverage-history.json','utf8'));
const fixture=JSON.parse(await readFile('docs/phase3/fixtures/raydium-cpmm-creation.json','utf8')).result;
const controls=[{name:'original-unrecoverable-gap-anchor',...history.journal.gaps[0].anchor},{name:'retained-v0-creation',signature:fixture.transaction.signatures[0],slot:fixture.slot}];
const rows=await Promise.all([{id:'primary',endpoint:env.SOLANA_RPC_URL},{id:'secondary',endpoint:env.SOLANA_SECONDARY_RPC_URL}].map(async p=>{
 if(!p.endpoint)return {id:p.id,status:'missing'};
 const probe=new ReadOnlyProbe(p.endpoint,4000,6),results=[];
 for(const subject of controls){const row:any={subject,executionEligible:false};
  for(const encoding of ['json','base64'])try{row[encoding]=await probe.read('getTransaction',[subject.signature,{encoding,commitment:'finalized',maxSupportedTransactionVersion:1}]);}catch{row[`${encoding}Issue`]='Selected historical transaction unavailable';}
  row.inspection=inspectSignedWire(row.base64,row.json,subject.signature);results.push(row);
 }
 return {id:p.id,results,observations:probe.observations};
}));
const f=await open(output,'wx',0o600);try{await f.writeFile(JSON.stringify({generatedAt:Date.now(),rows,coverageResolved:false,executionEligible:false,scope:'Selected anchors and retained v0 control; no history interval reconstruction, creation freshness or provider independence inferred'},null,2)+'\n');await f.sync();}finally{await f.close();}
console.log(JSON.stringify(rows.map(r=>({provider:r.id,results:r.results?.map(x=>({subject:x.subject.name,inspection:x.inspection.status,version:x.inspection.version}))}))));
