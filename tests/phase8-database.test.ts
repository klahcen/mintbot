import test from "node:test";import assert from "node:assert/strict";import {readFile,mkdir,writeFile,unlink} from "node:fs/promises";import {join} from "node:path";import {createHash} from "node:crypto";import {Pool} from "pg";
import {authenticatedPostgres} from "../scripts/phase8-authenticated-postgres.js";import {IntentLedger} from "../src/simulation/intent-ledger.js";
test("Phase8 retained authenticated PostgreSQL operational validation",{timeout:60000},async t=>{
 const pg=await authenticatedPostgres(),events:unknown[]=[],run=`p8-${Date.now()}-${process.pid}`;let ledger:IntentLedger;let id="",fence="";
 try {
  await new IntentLedger(pg.ownerPool).migrate();await pg.grantRuntime();ledger=new IntentLedger(pg.runtimePool);
  await t.test("SCRAM role authenticates, pools bounded, owner isolated and runtime cannot mutate DDL/audit",async()=>{
   const h=await pg.health();assert.equal(h.current_user,pg.runtime);assert.equal(h.fsync,"on");assert.equal(h.listen_addresses,"");
   await ledger.budget(`wallet:${run}`,"SOL",100n);await ledger.budget(`${run}:research8`,"SOL",100n);
   const r=await ledger.reserve({opportunity:run,strategy:"research8",side:"buy",generation:"1",wallet:run},[{asset:"SOL",atoms:"10"}],{research:true,liveAuthorized:false});id=r.id;
   const duplicates=await Promise.all(Array.from({length:4},()=>ledger.reserve({opportunity:run,strategy:"research8",side:"buy",generation:"1",wallet:run},[{asset:"SOL",atoms:"10"}],{research:true,liveAuthorized:false})));assert(duplicates.every(d=>d.id===id));assert.equal((await ledger.audit(id)).length,1);
   const owned=await ledger.claim(id,"phase8-worker",100);fence=owned.fence;
   await assert.rejects(pg.runtimePool.query("CREATE TABLE public.forbidden8(x int)"),/permission denied/);
   await assert.rejects(pg.runtimePool.query("UPDATE simulation_schema_migration SET sha256='bad'"),/permission denied/);
   await assert.rejects(pg.runtimePool.query("DELETE FROM simulation_intent_audit WHERE intent=$1",[id]),/permission denied/);
   await assert.rejects(pg.runtimePool.query("ALTER TABLE simulation_intent DISABLE TRIGGER ALL"),/owner/);
   const roles=(await pg.adminPool.query("SELECT rolname,rolsuper,rolcreaterole,rolcreatedb,rolreplication,rolpassword LIKE 'SCRAM-SHA-256$%' AS scram FROM pg_authid WHERE rolname=ANY($1)",[[pg.owner,pg.runtime]])).rows;
   assert(roles.every(r=>r.scram&&!r.rolsuper&&!r.rolcreatedb&&!r.rolcreaterole&&!r.rolreplication));events.push({case:"authenticated-runtime-privileges",health:h,roles});
  });
  await t.test("Wrong secret rejected and rotation invalidates old credentials",async()=>{
   const oldConfig=pg.runtimeConfig();await pg.rotateRuntime();ledger=new IntentLedger(pg.runtimePool);const old=new Pool({...oldConfig,connectionTimeoutMillis:1000});try{await assert.rejects(old.query("SELECT 1"),/password authentication failed/);}finally{await old.end();}
   assert.equal((await pg.runtimePool.query("SELECT current_user")).rows[0].current_user,pg.runtime);events.push({case:"scram-rotation",oldCredentialRejected:true,newCredentialAccepted:true});
  });
  await t.test("Immediate database crash retains identity and fences expired worker before manual cancellation",async()=>{
   await pg.restart();ledger=new IntentLedger(pg.runtimePool);assert.equal((await ledger.get(id))!.fence,fence);await ledger.reconcileExpired();const u=(await ledger.get(id))!;assert.equal(u.status,"UNCERTAIN");
   await assert.rejects(ledger.renew(id,"phase8-worker",fence),/fence/);await assert.rejects(ledger.claim(id,"replacement"),/reconciliation/);
   const before=(await pg.runtimePool.query("SELECT reserved::text FROM simulation_budget WHERE scope=$1",[`wallet:${run}`])).rows[0].reserved;assert.equal(before,"10");
   await ledger.resolveUncertain(id,u.fence,"phase8-reviewer","Read-only research; inspect crash ambiguity, cancel without submission","CANCELLED");
   assert.equal((await pg.runtimePool.query("SELECT reserved::text FROM simulation_budget WHERE scope=$1",[`wallet:${run}`])).rows[0].reserved,"0");events.push({case:"immediate-crash-recovery",id,priorFence:fence,uncertainFence:u.fence,retainedCapacityBeforeReview:before});
  });
  await t.test("Authenticated deployment backup restores exact retained audit, identity and budgets",async()=>{
   const path=join(pg.root,`backup-${run}.dump`),name=`mintbot8_restore_${process.pid}`;await pg.backup(path);const copy=await pg.restore(path,name);
   try {assert.deepEqual(await new IntentLedger(copy).audit(id),await ledger.audit(id));assert.deepEqual((await copy.query("SELECT * FROM simulation_budget ORDER BY scope,asset")).rows,(await pg.runtimePool.query("SELECT * FROM simulation_budget ORDER BY scope,asset")).rows);assert.equal((await new IntentLedger(copy).get(id))!.status,"CANCELLED");const bytes=await readFile(path);events.push({case:"backup-restore",sha256:createHash("sha256").update(bytes).digest("hex"),bytes:bytes.length,auditRows:(await ledger.audit(id)).length});}
   finally{await copy.end();await pg.adminPool.query(`DROP DATABASE ${name}`);await unlink(path);}
  });
  const samples=[];for(let i=0;i<10;i++)samples.push(await pg.health());
  await mkdir("docs/phase8",{recursive:true});await writeFile("docs/phase8/database-validation.json",JSON.stringify({generatedAt:new Date().toISOString(),cluster:pg.root,persistent:true,reused:pg.reused,retainedAfterStop:true,singleNode:true,highAvailability:false,events,responsiveness:samples,liveAuthorized:false,submitted:false},null,2));
 }finally{await pg.close();}
});
