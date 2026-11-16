import { dirname } from 'node:path';
import { readFile, open } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AsyncEventJournal } from '../src/async-journal.js';
import { validateRetryAuthority, type RetryAuthority } from '../src/research/retry-authority.js';
const args=process.argv.slice(2),arg=(k:string)=>{const i=args.indexOf(k);if(i<0||!args[i+1])throw Error(`Required ${k}`);return args[i+1]!;};
if(!args.includes('--apply'))throw Error('Explicit --apply required');
const planBytes=await readFile(arg('--plan')),plan=JSON.parse(planBytes.toString()),rows=Array.isArray(plan)?plan:plan.reviewPlan;
if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('Review population bound');
const sha=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
const journal=await AsyncEventJournal.open({path:arg('--journal')});
try{
 const originalWalSha256=sha(await readFile(arg('--journal'))),planSha256=sha(planBytes);
 let authority:RetryAuthority|undefined;
 if(rows.some(r=>r.review?.decision==='retry'))authority=validateRetryAuthority(JSON.parse(await readFile(arg('--retry-authority'),'utf8')),originalWalSha256,planSha256,rows.map(r=>r.review.reviewer));
 // Validate every identity/fingerprint binding before the first mutation; each append retains its own durable preconditions.
 for(const row of rows){const item=journal.pending.get(row.id);if(!item?.quarantined||row.expectedFingerprint!==sha(Buffer.from(JSON.stringify([item.observation.slot,item.observation.failed,item.observation.logs]))))throw Error('Review identity/fingerprint precondition');}
 const audit=await open(arg('--output'),'wx',0o600);
 const append=async(record:unknown)=>{await audit.writeFile(JSON.stringify(record)+'\n');await audit.sync();};
 try{
  const auditDirectory=await open(dirname(arg('--output')),'r');try{await auditDirectory.sync();}finally{await auditDirectory.close();}
  await append({kind:'authorization',generatedAt:new Date().toISOString(),originalWalSha256,planSha256,authority,scope:'Explicit named operator authorization; not independently authenticated identity. Immutable original observations, lifetime attempts and gaps remain authoritative.',liveTrading:false});
  const headerDirectory=await open(dirname(arg('--output')),'r');try{await headerDirectory.sync();}finally{await headerDirectory.close();}
  for(const row of rows){await journal.reviewQuarantineDurable(row.id,row.expectedFingerprint,row.review);await append({kind:'review-committed',id:row.id,decision:row.review.decision,retained:true});}
  await journal.checkpoint();await append({kind:'completed',status:journal.status(),liveTrading:false});
 }finally{await audit.close();}
}finally{await journal.shutdown();}
