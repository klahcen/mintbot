import { researchCoverage } from '../src/research/coverage.js';
import { EventIngestion } from '../src/ingestion.js';
import { EventJournal } from '../src/event-journal.js';
import { AsyncEventJournal } from '../src/async-journal.js';
import { researchIdentityIssue } from '../src/research/candidates.js';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateHostHealth, type ClockHealthRecord } from '../src/research/host-health.js';
const base=():ClockHealthRecord=>({requestedSeconds:300,actualMonotonicSeconds:300.1,stableForRequestedInterval:true,issues:[],containerSamples:31,containerBoundsPassed:true,endedClocksNs:{realtime:1000000*1e6,monotonic:500000*1e6},maxSampleMonotonicIntervalMs:1200,maxAbsRealtimeMonotonicStepMs:0.1});
test('Timing preflight never permits a longer interval or grants paper authorization',()=>{
 assert.equal(validateHostHealth(base(),300,1000100,500100).tradingAuthorized,false);
 assert.throws(()=>validateHostHealth(base(),301,1000100,500100),/interval/);
 assert.throws(()=>validateHostHealth({...base(),containerBoundsPassed:false},300,1000100,500100),/bounds/);
});
test('Host discontinuity, stale evidence, and changed monotonic origins fail timing preflight',()=>{
 for(const [wall,mono] of [[1002000,500100],[2000000,1500000],[999000,500100],[1000100,0]])assert.throws(()=>validateHostHealth(base(),300,wall,mono),/stale|discontinuous|origin/);
 for(const changed of [{issues:['suspend']},{stableForRequestedInterval:false},{actualMonotonicSeconds:299},{maxSampleMonotonicIntervalMs:10000},{maxAbsRealtimeMonotonicStepMs:1001}])assert.throws(()=>validateHostHealth({...base(),...changed},300,1000100,500100));
});

test('Research zero identity refuses before ownership, creation callbacks and anchors; generic defaults stay compatible',async()=>{
 const event={program:'pumpswap',signature:'1'.repeat(64),slot:50,observedAt:1,failed:false,logs:['UNIT raw provider observation']};
 const generic=new EventJournal();assert.equal(generic.offer(event).status,'accepted');generic.close();
 const journal=new EventJournal();let callbacks=0;const pipeline=new EventIngestion({journal,observationIssue:researchIdentityIssue,enrich:async()=>{callbacks++;}});
 const result=pipeline.accept(event);assert.equal(result.status,'unrecoverable');assert.equal(result.reason,'unverifiable-zero-signature');assert.equal(journal.pending.size,0);assert.equal(journal.completed.size,0);assert.equal(journal.anchors.size,0);assert.equal(callbacks,0);assert.equal(journal.gaps.get('pumpswap')?.status,'pending');await pipeline.close();
});
test('Worker fsync persists zero-identity coverage refusal without turning it into a finalized transaction',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'mintbot-phase12-identity-')),path=join(dir,'journal.wal');let journal:AsyncEventJournal|undefined;
 try{
  journal=await AsyncEventJournal.open({path});const pipeline=new EventIngestion({journal,observationIssue:researchIdentityIssue});
  const result=await pipeline.acceptDurable({program:'meteora-dlmm',signature:'1'.repeat(64),slot:100,observedAt:1,failed:false,logs:['UNIT unidentifiable receipt']});
  assert.equal(result.reason,'unverifiable-zero-signature');assert.equal(journal.status().unacknowledged,0);assert.equal(journal.anchors.size,0);await pipeline.close();journal=await AsyncEventJournal.open({path});
  assert.equal(journal.gaps.get('meteora-dlmm')?.reason,'unverifiable-zero-signature');assert.equal(journal.pending.size,0);assert.equal(journal.completed.size,0);assert.equal(journal.anchors.size,0);
 }finally{await journal?.shutdown();await rm(dir,{recursive:true,force:true});}
});

test('Provider-reported gap recovery cannot approve a run with unreviewed zero identities',()=>{
 const result=researchCoverage({liveReady:true},{gaps:[{status:'recovered'}],quarantined:0,unverifiableIdentities:1});
 assert.equal(result.status,'unknown');assert.match(result.reasons.join(' '),/Unverifiable transaction identities/);
 assert.equal(researchCoverage({liveReady:true},{gaps:[],quarantined:0,unverifiableIdentities:0}).status,'verified');
});
