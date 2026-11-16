import { SimulationGatedPaper } from '../src/simulation/paper-gate.js';
import { SimulationRpc } from '../src/simulation/rpc.js';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { AsyncEventJournal } from '../src/async-journal.js';
import { acquireResearchOwner } from '../src/research/owner.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { creationHint, researchPrograms } from '../src/research/candidates.js';
import { createCoverageEpoch, epochCoverage } from '../src/research/epochs.js';
import { assertResearchNotStopped, requestResearchStop } from '../src/research/stop-control.js';
import { validateRetryAuthority } from '../src/research/retry-authority.js';
import { VERIFIED_PROGRAMS, type ProgramObservation } from '../src/chain.js';
import { EventIngestion } from '../src/ingestion.js';
import { EventJournal } from '../src/event-journal.js';
import { RealMarketPaper, initializeMarketLedger } from '../src/market/paper.js';
import { Store, initial } from '../src/store.js';
import { json, paperCase } from './market-fixtures.js';

test('Four-venue candidate hints include changed creations but never validate provenance',()=>{
 for(const [program,hint] of [['pump','CreateV2'],['pumpswap','CreatePool'],['raydium-cpmm','InitializeWithPermission'],['meteora-dlmm','InitializeLbPair2']]){
  const event:ProgramObservation={program,signature:'UNIT-shared-signature',slot:1,observedAt:1,failed:false,logs:[`Program log: Instruction: ${hint}`]};
  assert(creationHint(event));assert(!creationHint({...event,failed:true}));assert(!creationHint({...event,logs:['Program log: Instruction: Swap']}));
 }
 assert.equal(researchPrograms(VERIFIED_PROGRAMS.map(p=>p.name).join(','),VERIFIED_PROGRAMS).length,4);
 assert.throws(()=>researchPrograms('pump,pump',VERIFIED_PROGRAMS));assert.throws(()=>researchPrograms('unknown',VERIFIED_PROGRAMS));
});
test('Alternate venue observations with a shared signature retain separate WAL identities and enrichment',async()=>{
 const journal=new EventJournal(),seen:string[]=[];
 const pipeline=new EventIngestion({journal,enrich:async e=>{seen.push(e.program);return [];}});
 for(const program of ['pumpswap','raydium-cpmm','meteora-dlmm'])pipeline.accept({program,signature:'UNIT-same-transaction',slot:5,logs:['UNIT notification, no creation proof'],failed:false,observedAt:1});
 await pipeline.drain();assert.deepEqual(seen.sort(),['meteora-dlmm','pumpswap','raydium-cpmm']);assert.equal(journal.completed.size,3);await pipeline.close();
});
test('Coverage epoch seals unresolved history and a clean local window never self-authorizes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mintbot-phase11-epoch-'));
 try{
  const history=join(dir,'old.json');await writeFile(history,JSON.stringify({endedAt:1,journal:{gaps:[{status:'unrecoverable'}],quarantined:79}}));
  const output=join(dir,'epoch.json'),epoch=await createCoverageEpoch(output,['pump','pumpswap'],[history]);
  const result=epochCoverage(epoch,{liveReady:true},{gaps:[],quarantined:0});
  assert.equal(result.currentWindow.status,'verified');assert.equal(result.status,'unknown');assert.equal(result.historicalUnresolved,1);assert.equal(result.fundedAuthorized,false);
  assert.equal(JSON.parse(await readFile(history,'utf8')).journal.quarantined,79);
  await assert.rejects(createCoverageEpoch(output,['pump'],[history]),/EEXIST/);
  await writeFile(history,JSON.stringify({journal:{gaps:[],quarantined:0}}));await assert.rejects(createCoverageEpoch(join(dir,'bad.json'),['pump'],[history]),/Final historical/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Retry authority binds exact WAL, plan, independent named approver, and expiry',()=>{
 const now=10000,a={purpose:'offline-quarantine-retry' as const,walSha256:'a'.repeat(64),planSha256:'b'.repeat(64),authorizedBy:'UNIT-approver',issuedAt:now-1,expiresAt:now+1000,liveAuthorized:false as const};
 assert.equal(validateRetryAuthority(a,a.walSha256,a.planSha256,['UNIT-reviewer'],now),a);
 for(const changed of [undefined,{...a,expiresAt:now},{...a,authorizedBy:'UNIT-reviewer'},{...a,walSha256:'c'.repeat(64)},{...a,liveAuthorized:true}])assert.throws(()=>validateRetryAuthority(changed as any,a.walSha256,a.planSha256,['UNIT-reviewer'],now));
});
test('Durable stop fence blocks an already queued paper entry at the transaction boundary',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mintbot-phase11-stop-'));
 try{
  const path=join(dir,'stop.json'),c=await paperCase(),config=await json('config/strategy.json');Object.assign(config,{tradeSol:0.00001,minLiquiditySol:0});
  const state=initializeMarketLedger(initial(config));state.running=true;const store=new Store(state,undefined,undefined,1024,true);
  const engine=new RealMarketPaper(store,undefined,undefined,()=>assertResearchNotStopped(path));
  let release!:()=>void;const blocker=store.paperTransaction(async()=>await new Promise<void>(r=>{release=r;}));
  while(!release)await new Promise(r=>setImmediate(r));
  const entry=engine.review(c.state,c.buy,c.sell,c.fees,c.version);const rejected=assert.rejects(entry,/global stop/);
  await requestResearchStop(path,'kill');release();await blocker;await rejected;
  assert.equal(store.state.trades.length,0);assert.equal(store.state.positions.length,0);assert.throws(()=>assertResearchNotStopped(path),/global stop/);
  const original=await readFile(path,'utf8');await requestResearchStop(path,'stop');assert.equal(await readFile(path,'utf8'),original);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Research owner refuses a second container and never steals an unknown PID lock',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mintbot-phase11-owner-')),path=join(dir,'owner.lock');
 try{
  const release=await acquireResearchOwner(path);await assert.rejects(acquireResearchOwner(path),/EEXIST/);await release();
  await writeFile(path,JSON.stringify({pid:99999999,token:'UNIT-foreign-container'}));await assert.rejects(acquireResearchOwner(path),/EEXIST/);
  assert.match(await readFile(path,'utf8'),/foreign-container/);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('Offline retry CLI refuses missing authority and durably audits an exact authorized replay',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mintbot-phase11-retry-cli-')),wal=join(dir,'journal.wal'),planPath=join(dir,'plan.json'),audit=join(dir,'audit.jsonl');
 const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex'),run=promisify(execFile);
 let journal:AsyncEventJournal|undefined;
 try{
  journal=await AsyncEventJournal.open({path:wal});const observation:ProgramObservation={program:'pumpswap',signature:'UNIT-retry-cli',slot:5,observedAt:1,failed:false,logs:['UNIT original observation']};
  const admitted=await journal.offerDurable(observation);await journal.retryDurable(admitted.id,1,0);await journal.shutdown();journal=undefined;
  const plan=[{id:admitted.id,expectedFingerprint:sha(JSON.stringify([observation.slot,observation.failed,observation.logs])),review:{at:Date.now(),reviewer:'UNIT-reviewer',decision:'retry',evidenceSha256:'a'.repeat(64),reason:'UNIT offline retry retains original historical receipt and ownership'}}];
  await writeFile(planPath,JSON.stringify(plan));const argv=['--import','tsx','scripts/phase11-quarantine-review.ts','--apply','--journal',wal,'--plan',planPath,'--output',audit];
  await assert.rejects(run(process.execPath,argv),/retry-authority/);
  const authorityPath=join(dir,'authority.json'),now=Date.now();await writeFile(authorityPath,JSON.stringify({purpose:'offline-quarantine-retry',walSha256:sha(await readFile(wal)),planSha256:sha(await readFile(planPath)),authorizedBy:'UNIT-approver',issuedAt:now,expiresAt:now+60000,liveAuthorized:false}));
  await run(process.execPath,[...argv,'--retry-authority',authorityPath]);
  const records=(await readFile(audit,'utf8')).trim().split('\n').map(s=>JSON.parse(s));assert.deepEqual(records.map(r=>r.kind),['authorization','review-committed','completed']);assert.equal(records[0].authority.authorizedBy,'UNIT-approver');
  journal=await AsyncEventJournal.open({path:wal});const item=journal.pending.get(admitted.id)!;assert.equal(item.quarantined,false);assert.equal(item.attempts,1);assert.deepEqual(item.observation,observation);assert.equal(journal.gaps.get('pumpswap')?.status,'pending');
 }finally{await journal?.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('Simulation wrapper propagates the decision fence to inherited paper exits',async()=>{
 const c=await paperCase(),config=await json('config/strategy.json'),store=new Store(initializeMarketLedger(initial(config)),undefined,undefined,1024,true);
 const original=new RealMarketPaper(store,undefined,undefined,()=>{throw Error('UNIT shared exit stop fence');});
 const wrapped=new SimulationGatedPaper(original,{} as any,new SimulationRpc('https://unit.invalid'));
 await assert.rejects(wrapped.exit('UNIT-no-position',c.state,c.sell,c.fees,c.version),/UNIT shared exit stop fence/);
 assert.equal(store.state.trades.length,0);
});
