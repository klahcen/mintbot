import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { AsyncEventJournal } from "../src/async-journal.js";
import { EventJournal } from "../src/event-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import { MonitorSupervisor } from "../src/research/monitor-supervisor.js";
import { VERIFIED_PROGRAMS, type ProgramObservation } from "../src/chain.js";
import { pumpLogs } from "../scripts/benchmark-fixtures.js";
import { researchCoverage } from "../src/research/coverage.js";

const event = (): ProgramObservation => ({ program: "pump", signature: "UNIT-phase10", slot: 101,
  logs: pumpLogs(VERIFIED_PROGRAMS[0]!.address), failed: false, observedAt: Date.now() - 2000000 });
const fingerprint = (e: ProgramObservation) => createHash("sha256").update(JSON.stringify([e.slot,e.failed,e.logs])).digest("hex");
const review = (decision: "retain" | "retry") => ({ at: Date.now(), reviewer: "phase10-reviewer", decision,
  evidenceSha256: "a".repeat(64), reason: "UNIT reviewed original failure evidence; no coverage authorization" });

test("Acknowledged duration excludes pre-ACK transport and freezes at stop", () => {
  let now = 0;
  const socket = new EventEmitter() as any; socket.send = () => {}; socket.close = () => {};
  const tasks = new Map<number, () => void>(); let id = 0;
  const supervisor = new MonitorSupervisor(["wss://unit.invalid"],VERIFIED_PROGRAMS.slice(0,1),()=>{}, {
    clock:()=>now,wallClock:()=>now,socketFactory:()=>socket,
    scheduler:{schedule:fn=>{tasks.set(++id,fn);return id;},cancel:handle=>{tasks.delete(handle as number);}},
  });
  supervisor.start();socket.emit("open");now=100;
  assert.equal(supervisor.snapshot().acknowledgedMs,0);
  socket.emit("message",JSON.stringify({id:1,result:9}));now=150;
  assert.equal(supervisor.snapshot().connectedMs,150);
  assert.equal(supervisor.snapshot().acknowledgedMs,50);
  assert.equal(supervisor.snapshot().liveReady,false);
  supervisor.stop();now=1000;
  assert.equal(supervisor.snapshot().acknowledgedMs,50);
});

test("Durable quarantine reviews survive checkpoint/restart without changing identity, time or gap", async () => {
  const dir=await mkdtemp(join(tmpdir(),"mintbot-phase10-review-")),path=join(dir,"journal.wal");
  let journal: AsyncEventJournal | undefined;
  try {
    journal=await AsyncEventJournal.open({path});const original=event();const admitted=await journal.offerDurable(original);
    assert.equal(admitted.status,"accepted");const id=admitted.id;
    journal.recordGap("pump",100,110,"UNIT-unresolved");await journal.flush();
    await journal.retryDurable(id,1,0,{at:Date.now(),name:"Error",message:"UNIT failed callback"});
    assert.equal(journal.status().activePending,0);assert.equal(journal.status().oldestActiveAgeMs,0);
    assert(journal.status().oldestPendingAgeMs>=2000000);
    await journal.reviewQuarantineDurable(id,fingerprint(original),review("retain"));
    await journal.checkpoint();await journal.shutdown();journal=await AsyncEventJournal.open({path});
    const retained=journal.pending.get(id)!;
    assert.deepEqual(retained.observation,original);assert.equal(retained.lastFailure?.message,"UNIT failed callback");
    assert.equal(retained.reviews?.length,1);assert.equal(retained.quarantined,true);
    await journal.reviewQuarantineDurable(id,fingerprint(original),review("retry"));
    assert.equal(retained.attempts,1);assert.equal(retained.quarantined,false);
    assert.equal(journal.status().activePending,1);assert.equal(journal.gaps.get("pump")!.status,"pending");
    assert.equal((await journal.offerDurable(original)).status,"duplicate");
    assert.equal((await journal.offerDurable({...original,slot:102})).status,"conflict");
    await journal.shutdown();journal=undefined;
  } finally { await journal?.shutdown().catch(()=>{});await rm(dir,{recursive:true,force:true}); }
});

test("Wrong review fingerprint and exhausted lifetime budget cannot mutate pending ownership", async () => {
  const journal=new EventJournal(),original=event(),admitted=journal.offer(original);
  assert.equal(admitted.status,"accepted");journal.retry(admitted.id,1,0);
  await assert.rejects(journal.reviewQuarantineDurable(admitted.id,"b".repeat(64),review("retry")),/precondition/);
  for(let i=0;i<3;i++)await journal.reviewQuarantineDurable(admitted.id,fingerprint(original),review("retain"));
  await assert.rejects(journal.reviewQuarantineDurable(admitted.id,fingerprint(original),review("retry")),/budget/);
  assert.equal(journal.pending.size,1);assert.equal(journal.completed.size,0);
  assert.equal(journal.pending.get(admitted.id)!.quarantined,true);journal.close();
});

test("A failed review fsync is rejected and restart retains the original quarantine", async () => {
  const dir=await mkdtemp(join(tmpdir(),"mintbot-phase10-review-fault-")),path=join(dir,"journal.wal"),original=event();
  let asyncJournal: AsyncEventJournal | undefined;
  try {
    const seed=new EventJournal({path,checksummed:true});const admitted=seed.offer(original);seed.retry(admitted.id,1,0);seed.close();
    asyncJournal=await AsyncEventJournal.open({path,testFault:{afterBatches:0,point:"write",code:"ENOSPC"}});
    await assert.rejects(asyncJournal.reviewQuarantineDurable(admitted.id,fingerprint(original),review("retry")),/persistence|closed|failed/i);
    assert(asyncJournal.failureReason);await asyncJournal.shutdown().catch(()=>{});asyncJournal=undefined;
    const restored=new EventJournal({path,checksummed:true});
    assert.equal(restored.pending.get(admitted.id)!.quarantined,true);
    assert.equal(restored.pending.get(admitted.id)!.reviews,undefined);restored.close();
  } finally { await asyncJournal?.shutdown().catch(()=>{});await rm(dir,{recursive:true,force:true}); }
});

test("Future callback failures retain bounded redacted causes in durable quarantine", async () => {
  const dir=await mkdtemp(join(tmpdir(),"mintbot-phase10-callback-")),path=join(dir,"journal.wal");
  let pipeline: EventIngestion | undefined;
  try {
    const journal=await AsyncEventJournal.open({path});pipeline=new EventIngestion({journal,maxAttempts:1,
      strategy:()=>{throw Error("UNIT callback https://unit.invalid?key=secret "+"x".repeat(500));}});
    const original=event();await pipeline.acceptDurable(original);await pipeline.drain();
    const item=[...journal.pending.values()][0]!;
    assert.equal(item.quarantined,true);assert.equal(item.lastFailure?.stage,"strategy");assert(item.lastFailure?.message.includes("[endpoint]"));
    assert(!item.lastFailure?.message.includes("secret"));assert((item.lastFailure?.message.length??0)<=400);
    await pipeline.close();pipeline=undefined;
    const restored=await AsyncEventJournal.open({path});assert.equal([...restored.pending.values()][0]!.lastFailure?.name,"Error");await restored.shutdown();
  } finally { await pipeline?.close().catch(()=>{});await rm(dir,{recursive:true,force:true}); }
});

test("Reviewed retries reopen coverage before releasing quarantine and never authorize an unresolved interval", async () => {
  const journal=new EventJournal(),original=event(),admitted=journal.offer(original);
  journal.recordGap("pump",100,110,"UNIT-old-gap");journal.updateGap({...journal.gaps.get("pump")!,status:"recovered"});
  journal.retry(admitted.id,1,0);
  await journal.reviewQuarantineDurable(admitted.id,fingerprint(original),review("retry"));
  assert.equal(journal.pending.get(admitted.id)!.quarantined,false);
  assert.equal(journal.pending.get(admitted.id)!.observation.observedAt,original.observedAt);
  assert.equal(journal.gaps.get("pump")!.status,"pending");
  assert.equal(journal.gaps.get("pump")!.reason,"quarantine-review-retry");
  assert.equal(researchCoverage({liveReady:true},journal.status()).status,"unknown");journal.close();
});

function controlledFeed(observe:()=>void=()=>{}) {
  let now=0;const tasks=new Map<number,()=>void>();let id=0;
  const socket=new EventEmitter() as any;socket.send=()=>{};socket.close=()=>{};
  const seen:boolean[]=[];const supervisor=new MonitorSupervisor(["wss://unit.invalid"],VERIFIED_PROGRAMS.slice(0,1),observe,{
    clock:()=>now,wallClock:()=>now,socketFactory:()=>socket,
    onDisconnect:()=>seen.push(supervisor.snapshot().liveReady),
    scheduler:{schedule:fn=>{tasks.set(++id,fn);return id;},cancel:h=>{tasks.delete(h as number);}},
  });
  supervisor.start();socket.emit("open");socket.emit("message",JSON.stringify({id:1,result:9}));
  const receipt=()=>socket.emit("message",JSON.stringify({method:"logsNotification",params:{subscription:9,result:{context:{slot:101},value:{signature:"UNIT-receipt",logs:[],err:null}}}}));
  return {supervisor,socket,receipt,seen,setTime:(value:number)=>{now=value;}};
}

test("A transport failure clears receipt readiness before the recovery callback and backoff",()=>{
  const c=controlledFeed();c.receipt();assert.equal(c.supervisor.snapshot().liveReady,true);
  c.socket.emit("error",Error("UNIT transport failure"));
  assert.equal(c.supervisor.snapshot().liveReady,false);assert.equal(c.supervisor.snapshot().state,"connecting");
  assert.deepEqual(c.seen,[false]);c.supervisor.stop();
});

test("A stale receipt arriving before a delayed watchdog cannot erase the outage or reach strategy",()=>{
  let delivered=0;const c=controlledFeed(()=>{delivered++;});c.receipt();c.setTime(31000);c.receipt();
  assert.equal(delivered,1);assert.equal(c.supervisor.snapshot().liveReady,false);
  assert.equal(c.supervisor.snapshot().incidents,1);assert.deepEqual(c.seen,[false]);
  assert(c.supervisor.snapshot().events.some(e=>e.reason?.includes("delayed watchdog")));c.supervisor.stop();
});
