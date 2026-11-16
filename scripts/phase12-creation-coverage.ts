/** Retained log audit and bounded finalized instruction inspection; never promotes historical receipts. */
import { readFile,readdir,mkdir,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import bs58 from 'bs58';
import { VERIFIED_PROGRAMS,type ProgramObservation } from '../src/chain.js';
import { creationHint } from '../src/research/candidates.js';
import { VERIFIED_INSTRUCTIONS } from '../src/verified-decoders.js';
import { VerifiedReadRpc } from '../src/verified-rpc.js';
const args=process.argv.slice(2);if(!args.includes('--run'))throw Error('Explicit --run required');
const output=args.includes('--output')?args[args.indexOf('--output')+1]!:'docs/phase12/creation-coverage';await mkdir(output);
const endpoint=process.env.SOLANA_RPC_URL??'https://api.mainnet-beta.solana.com';
const idl=JSON.parse(await readFile('docs/phase12/official/MeteoraAg-dlmm-sdk-idls-dlmm.json','utf8'));
const rayNames=['initialize','initialize_with_permission','swap_base_input','swap_base_output','deposit','withdraw','collect_creator_fee','collect_protocol_fee','collect_fund_fee'];
const hash=(s:string)=>createHash('sha256').update(s).digest();
const maps:Record<string,Map<string,string>>={'raydium-cpmm':new Map(rayNames.map(n=>[hash(`global:${n}`).subarray(0,8).toString('hex'),n])),'meteora-dlmm':new Map(idl.instructions.map((i:any)=>[Buffer.from(i.discriminator).toString('hex'),i.name]))};
const populations:Record<string,ProgramObservation[]>={'raydium-cpmm':[],'meteora-dlmm':[]},audits:any[]=[];
for(const run of ['docs/phase11/runtime/mainnet-validated','docs/phase12/runtime/mainnet']){
 const evidence=JSON.parse(await readFile(`${run}/evidence.json`,'utf8')),perVenue:Record<string,any>={};
 for(const name of Object.keys(populations))perVenue[name]={records:0,knownCreationHints:0,logLabels:{}};
 for(const file of (await readdir(run)).filter(p=>/^observations\.jsonl(?:\.archive-\d+)?$/.test(p))){
  const text=await readFile(`${run}/${file}`,'utf8');if(Buffer.byteLength(text)>32*1024*1024)throw Error('Raw file bound');
  for(const line of text.trim().split('\n')){if(!line)continue;const observation:ProgramObservation=JSON.parse(line);if(!perVenue[observation.program])continue;
   const p=perVenue[observation.program];p.records++;if(creationHint(observation))p.knownCreationHints++;
   for(const log of observation.logs){const m=/^Program log: Instruction: (\w+)$/.exec(log);if(m)p.logLabels[m[1]!]=(p.logLabels[m[1]!]??0)+1;}
   if(run.startsWith('docs/phase12'))populations[observation.program]!.push(observation);
  }
 }
 audits.push({run,totalObservedVenueCounters:evidence.venueCounts,retainedRaw:perVenue,rawStorage:evidence.rawStorage,gaps:evidence.journal.gaps,scope:'Labels anywhere in a transaction are observational hints, not strict invocation attribution. Retained rotations are a subset; full run hint counters are retained separately. Gaps prevent inferring global creation frequency.'});
}
const reader=new VerifiedReadRpc(endpoint),samples:any[]=[];
for(const [program,pop]of Object.entries(populations)){
 const unique=[...new Map(pop.filter(e=>!e.failed).map(e=>[e.signature,e])).values()],selected=new Set<number>();
 for(let n=0;n<Math.min(12,unique.length);n++)selected.add(Math.round(n*(unique.length-1)/Math.max(1,Math.min(12,unique.length)-1)));
 for(const index of selected){const original=unique[index]!,row:any={program,originalObservation:original};
  try{
   const tx=await reader.transaction(original.signature);if(!tx){row.issue='Finalized transaction unavailable';samples.push(row);continue;}
   row.transaction=tx;row.identityMatches=tx.slot===original.slot&&tx.transaction.signatures[0]===original.signature;if(!row.identityMatches)throw Error('Finalized identity or slot conflict');
   const target=VERIFIED_PROGRAMS.find(p=>p.name===program)!.address,all=[...tx.transaction.message.instructions,...(tx.meta?.innerInstructions??[]).flatMap((g:any)=>g.instructions)],instructions:any[]=[];
   for(const i of all as any[]){const address=typeof i.programId==='string'?i.programId:i.programId?.pubkey;if(address!==target||typeof i.data!=='string')continue;const bytes=bs58.decode(i.data),discriminator=Buffer.from(bytes).subarray(0,8).toString('hex');instructions.push({discriminator,name:maps[program]!.get(discriminator)??'unknown-discriminator',bytes:bytes.length});}
   row.instructions=instructions;row.initializers=instructions.filter(i=>/^initialize/.test(i.name));
   if(row.initializers.length){try{row.verified=await reader.verify(program,original.signature,original.slot);}catch(error){row.verificationIssue=(error as Error).message;}}
   row.eligibleForPaper=false;
  }catch(error){row.issue=(error as Error).message;}
  samples.push(row);await new Promise(r=>setTimeout(r,150));
 }
}
await writeFile(`${output}/evidence.json`,JSON.stringify({generatedAt:new Date().toISOString(),provider:new URL(endpoint).host,audits,samples,reviewedCreationVariants:VERIFIED_INSTRUCTIONS,officialDlmmInitializers:idl.instructions.filter((i:any)=>/^initialize/.test(i.name)).map((i:any)=>({name:i.name,discriminator:i.discriminator})),newVariantsEnabled:false,liveTrading:false,scope:'At most twelve evenly spaced unique successful receipts per venue, finalized reread without retries. This biased bounded subset does not estimate true creation frequency or repair gaps. Existing strict verifier remains the only creation authority; ordinary swaps and historical reinspection cannot become fresh events.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({rawPopulations:Object.fromEntries(Object.entries(populations).map(([k,v])=>[k,v.length])),samples:samples.length,initializers:samples.filter(r=>r.initializers?.length).length,issues:samples.filter(r=>r.issue).length}));
