import test from "node:test";import assert from "node:assert/strict";
import {spawn} from "node:child_process";import {mkdir,readFile,writeFile,unlink} from "node:fs/promises";import {resolve}from"node:path";import {createHash}from"node:crypto";import {Pool}from"pg";
import {persistentPostgres} from "../scripts/phase7-persistent-postgres.js";import {IntentLedger,type IntentKey}from"../src/simulation/intent-ledger.js";
const child=(socket:string,user:string,mode:string,id:string)=>new Promise<any>((yes,no)=>{
 const p=spawn(process.execPath,["--import","tsx","tests/helpers/intent-race-child.ts",socket,user,mode,id],{stdio:["ignore","pipe","pipe"]});let out="",err="";p.stdout.on("data",x=>out+=x);p.stderr.on("data",x=>err+=x);p.on("error",no);p.on("exit",code=>code===0?yes(JSON.parse(out)):no(Error(err)));
});
test("Persistent PostgreSQL deployment: process races, immutable audit, outage, checksum and backup restore",{timeout:90000},async t=>{
 const pg=await persistentPostgres(),run=`run-${Date.now()}-${process.pid}`,events:unknown[]=[];let ledger=new IntentLedger(pg.pool);
 try{
  await ledger.migrate();await ledger.migrate();
  await ledger.budget("wallet:persistent-wallet","SOL",1000000n);await ledger.budget("persistent-wallet:persistent-v7","SOL",1000000n);
  const key:IntentKey={opportunity:run,strategy:"persistent-v7",side:"buy",generation:"1",wallet:"persistent-wallet"};let id="",fence="";
  await t.test("Independent processes reserve unique identity once and race one exclusive owner",async()=>{
   const rs=await Promise.all(Array.from({length:4},()=>child(pg.socket,pg.user,"reserve",run)));assert(rs.every(r=>r.ok));assert.equal(new Set(rs.map(r=>r.intent.id)).size,1);id=rs[0].intent.id;
   assert.equal((await ledger.audit(id)).length,1);
   const owners=await Promise.all(Array.from({length:4},()=>child(pg.socket,pg.user,"claim",id)));assert.equal(owners.filter(r=>r.ok).length,1);fence=owners.find(r=>r.ok).intent.fence;
   events.push({case:"multiprocess",processes:4,reservations:1,owners:1,id,fence});
  });
  await t.test("Audit mutations and unfenced owner changes are rejected in PostgreSQL",async()=>{
   await assert.rejects(pg.pool.query("UPDATE simulation_intent_audit SET data='{}' WHERE intent=$1",[id]),/Append-only/);
   await assert.rejects(pg.pool.query("DELETE FROM simulation_intent_audit WHERE intent=$1",[id]),/Append-only/);
   await assert.rejects(pg.pool.query("TRUNCATE simulation_intent_audit"),/Append-only/);
   await assert.rejects(pg.pool.query("DELETE FROM simulation_intent WHERE id=$1",[id]),/Append-only/);
   await assert.rejects(pg.pool.query("UPDATE simulation_intent SET owner='intruder' WHERE id=$1",[id]),/increasing fence/);
   events.push({case:"audit-immutability",blocked:["update","delete","truncate","intent-delete","unfenced-owner"]});
  });
  await t.test("Unprivileged runtime role writes intents through audit trigger and cannot modify audit or schema",async()=>{
   const role=`mintbot_runtime_${process.pid}`;await pg.pool.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`);
   try{
    await pg.pool.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await pg.pool.query(`GRANT SELECT,INSERT,UPDATE ON simulation_intent,simulation_budget TO ${role}`);
    await pg.pool.query(`GRANT SELECT ON simulation_intent_audit TO ${role}`);
    const c=await pg.pool.connect();try{
     await c.query(`SET ROLE ${role}`);
     await c.query("UPDATE simulation_budget SET capacity=capacity WHERE scope='persistent-wallet:persistent-v7'");
     await c.query("UPDATE simulation_intent SET updated_at=clock_timestamp() WHERE id=$1",[id]);
     await assert.rejects(c.query("DELETE FROM simulation_intent_audit WHERE intent=$1",[id]),/permission denied/);
     await assert.rejects(c.query("UPDATE simulation_schema_migration SET sha256='bad'"),/permission denied/);
     await assert.rejects(c.query("ALTER TABLE simulation_intent DISABLE TRIGGER ALL"),/owner/);
    }finally{await c.query("RESET ROLE");c.release();}
   }finally{await pg.pool.query(`DROP OWNED BY ${role}`);await pg.pool.query(`DROP ROLE ${role}`);}
   events.push({case:"runtime-role",auditWrites:"trigger-only",ddl:"denied",migrationWrites:"denied"});
  });
  await t.test("Immediate PostgreSQL stop retains lease and capacity; restart fences ambiguity and manual review cancels once",async()=>{
   const before=(await pg.pool.query("SELECT reserved::text FROM simulation_budget WHERE scope='wallet:persistent-wallet' AND asset='SOL'")).rows[0].reserved;
   await pg.stop();
   const outagePool=new Pool({...pg.config,connectionTimeoutMillis:200});
   try{await assert.rejects(new IntentLedger(outagePool).claim(id,"outage-owner"),/connect|ENOENT|ECONNREFUSED/);}finally{await outagePool.end();}
   await pg.start();ledger=new IntentLedger(pg.pool);await ledger.migrate();
   assert.equal((await ledger.get(id))!.fence,fence);await new Promise(r=>setTimeout(r,220));await ledger.reconcileExpired();const uncertain=(await ledger.get(id))!;assert.equal(uncertain.status,"UNCERTAIN");assert(BigInt(uncertain.fence)>BigInt(fence));
   await assert.rejects(ledger.claim(id,"replacement"),/reconciliation/);
   await assert.rejects(ledger.renew(id,"old-owner",fence),/fence/);
   assert.equal((await pg.pool.query("SELECT reserved::text FROM simulation_budget WHERE scope='wallet:persistent-wallet' AND asset='SOL'")).rows[0].reserved,before);
   const review=await ledger.resolveUncertain(id,uncertain.fence,"reviewer-v7","No submit path exists; inspect durable record","MANUAL_REVIEW");
   await ledger.resolveUncertain(id,review.fence,"reviewer-v7","Explicitly cancel read-only research reservation","CANCELLED");
   await assert.rejects(ledger.resolveUncertain(id,review.fence,"reviewer-v7","Duplicate cancellation","CANCELLED"),/conflict/);
   events.push({case:"immediate-restart",uncertainFence:uncertain.fence,retainedReservations:true,manualCancellation:true});
  });
  await t.test("Migration tampering fails closed and checksum failure rolls back",async()=>{
   const original=(await pg.pool.query("SELECT sha256 FROM simulation_schema_migration WHERE version='intent-migration-007.sql'")).rows[0].sha256;
   await pg.pool.query("UPDATE simulation_schema_migration SET sha256='UNIT-tamper' WHERE version='intent-migration-007.sql'");
   await assert.rejects(ledger.migrate(),/checksum mismatch/);
   await pg.pool.query("UPDATE simulation_schema_migration SET sha256=$1 WHERE version='intent-migration-007.sql'",[original]);await ledger.migrate();events.push({case:"migration-checksum",tamperingRejected:true});
  });
  await t.test("Consistent PostgreSQL custom backup restores identity, audit and budgets to separate database",async()=>{
   const dir=resolve("docs/phase7");await mkdir(dir,{recursive:true});const dump=resolve(dir,`persistent-recovery-${process.pid}.dump`),database=`mintbot_restore_${process.pid}`;
   await pg.dump(dump);const restored=await pg.restore(dump,database);
   try{const copy=new IntentLedger(restored);assert.deepEqual(await copy.audit(id),await ledger.audit(id));assert.equal((await copy.get(id))!.status,"CANCELLED");assert.deepEqual((await restored.query("SELECT * FROM simulation_budget ORDER BY scope,asset")).rows,(await pg.pool.query("SELECT * FROM simulation_budget ORDER BY scope,asset")).rows);
    events.push({case:"backup-restore",sha256:createHash("sha256").update(await readFile(dump)).digest("hex"),bytes:(await readFile(dump)).length,restoredIdentity:id,auditRows:(await copy.audit(id)).length});
   }finally{await restored.end();await pg.pool.query(`DROP DATABASE ${database}`);await unlink(dump);}
  });
  await t.test("Persistent synchronous COMMIT acknowledgement latency is measured separately",async()=>{
   const times:number[]=[],c=await pg.pool.connect();
   try{for(let i=0;i<50;i++){
    await c.query("BEGIN");await c.query("SET LOCAL synchronous_commit=on");
    await c.query("UPDATE simulation_budget SET capacity=capacity WHERE scope='wallet:persistent-wallet' AND asset='SOL'");
    const start=performance.now();await c.query("COMMIT");times.push(performance.now()-start);
   }}finally{c.release();}
   const sorted=[...times].sort((a,b)=>a-b),at=(p:number)=>sorted[Math.floor((sorted.length-1)*p)];
   events.push({case:"synchronous-commit-ack",samples:times.length,unit:"ms",p50:at(.5),p95:at(.95),p99:at(.99),max:at(1),raw:times,scope:"single-client same-host persistent deployment; UPDATE plus WAL; COMMIT acknowledgement only; no production latency claim"});
  });
  const settings=(await pg.pool.query("SELECT current_setting('server_version') AS version,current_setting('fsync') AS fsync,current_setting('synchronous_commit') AS synchronous_commit,current_setting('full_page_writes') AS full_page_writes,current_setting('listen_addresses') AS listen_addresses")).rows[0];
  await mkdir("docs/phase7",{recursive:true});await writeFile("docs/phase7/persistent-database-validation.json",JSON.stringify({generatedAt:new Date().toISOString(),cluster:pg.root,persistent:true,reusedExistingDeployment:pg.reused,retainedAfterStop:true,settings,run,events,liveAuthorized:false,submitted:false},null,2));
 }finally{await pg.close();}
});
