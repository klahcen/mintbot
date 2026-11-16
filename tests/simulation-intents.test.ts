import test from"node:test";import assert from"node:assert/strict";import{spawn}from"node:child_process";import{IntentLedger,intentId,type IntentKey}from"../src/simulation/intent-ledger.js";import{localPostgres}from"../scripts/local-postgres.js";
test("PostgreSQL intent reservations, fencing, crash recovery and database restart",{timeout:60000},async t=>{
 const pg=await localPostgres();try{
 let ledger=new IntentLedger(pg.pool);await ledger.migrate();
 const key:IntentKey={opportunity:"unit-opportunity",strategy:"v1",side:"buy",generation:"1",wallet:"unit-wallet"};
 await ledger.budget("wallet:unit-wallet","SOL",1000n);
 await ledger.budget("unit-wallet:v1","SOL",1000n);
 await t.test("Concurrent duplicate identities reserve once and audit atomically",async()=>{
  const rs=await Promise.all(Array.from({length:12},()=>ledger.reserve(key,[{asset:"SOL",atoms:"100"}],{exact:"payload"})));
  assert.equal(new Set(rs.map(r=>r.id)).size,1);assert.equal((await pg.pool.query("SELECT reserved::text FROM simulation_budget WHERE scope='unit-wallet:v1'")).rows[0].reserved,"100");
  assert.equal((await ledger.audit(rs[0].id)).length,1);
  await ledger.budget("unit-wallet:v2","SOL",1000n);
  await assert.rejects(ledger.reserve({...key,strategy:"v2"},[{asset:"SOL",atoms:"901"}],{}),/Insufficient/);
  await assert.rejects(ledger.reserve(key,[{asset:"SOL",atoms:"101"}],{exact:"payload"}),/Conflicting/);
 });
 let owner=await ledger.claim(intentId(key),"owner-a");
 await t.test("Exclusive ownership and wrong fences reject; phases cannot skip or reach signing",async()=>{
  await assert.rejects(ledger.claim(intentId(key),"owner-b"),/owned/);
  await assert.rejects(ledger.transition(intentId(key),"owner-a","999","RESERVED","BUILT",{}),/fence/);
  await assert.rejects(ledger.transition(intentId(key),"owner-a",owner.fence,"RESERVED","POLICY_APPROVED",{}),/Unreachable/);
  await assert.rejects(pg.pool.query("UPDATE simulation_intent SET status='SIGNED' WHERE id=$1",[intentId(key)]));
  owner=await ledger.transition(intentId(key),"owner-a",owner.fence,"RESERVED","BUILT",{message:"unsigned"});
 });
 await t.test("Database immediate restart retains intent, reservation and audit",async()=>{
  await pg.restart();ledger=new IntentLedger(pg.pool);const restored=await ledger.get(intentId(key));assert.equal(restored!.status,"BUILT");assert.equal(restored!.fence,owner.fence);
  assert.equal((await ledger.audit(intentId(key))).length,3);
  await assert.rejects(ledger.transition(intentId(key),"owner-a",owner.fence,"BUILT","SIMULATED",{simulation:{success:false,submitted:false}}),/Successful/);
  const simulation={success:true,submitted:false,messageDigest:"UNIT-digest"};
  await ledger.transition(intentId(key),"owner-a",owner.fence,"BUILT","SIMULATED",{simulation,scope:"UNIT result"});
  await assert.rejects(ledger.transition(intentId(key),"owner-a",owner.fence,"SIMULATED","POLICY_APPROVED",{liveAuthorized:false}),/Successful|approval/);
  await ledger.transition(intentId(key),"owner-a",owner.fence,"SIMULATED","POLICY_APPROVED",{simulation,liveAuthorized:false,accounting:{consistent:true},policy:{kind:"simulation-policy",messageDigest:"UNIT-digest"},plan:{messageDigest:"UNIT-digest"}});
 });
 await t.test("Cancellation releases exactly once; budget oversubscription rolls back",async()=>{
  await ledger.transition(intentId(key),"owner-a",owner.fence,"POLICY_APPROVED","CANCELLED",{reason:"test complete"});
  await assert.rejects(ledger.transition(intentId(key),"owner-a",owner.fence,"CANCELLED","CANCELLED",{}),/Unreachable/);
  await assert.rejects(ledger.reserve({...key,opportunity:"too-large"},[{asset:"SOL",atoms:"1001"}],{}),/Insufficient/);
  assert.equal((await pg.pool.query("SELECT reserved::text FROM simulation_budget WHERE scope='unit-wallet:v1'")).rows[0].reserved,"0");
 });
 await t.test("SIGKILL between durable reservation and simulation retains uncertainty and fences stale owner",async()=>{
  const child=spawn(process.execPath,["--import","tsx","tests/helpers/intent-crash-child.ts",pg.socket,pg.user],{stdio:["ignore","pipe","pipe"]});let out="",err="";child.stdout.on("data",b=>out+=b);child.stderr.on("data",b=>err+=b);
  const signal=await new Promise<string|null>((resolve,reject)=>{child.on("error",reject);child.on("exit",(_code,signal)=>resolve(signal));});assert.equal(signal,"SIGKILL",err);
  const record=JSON.parse(out);await new Promise(r=>setTimeout(r,150));const recovered=await ledger.reconcileExpired();assert(recovered.some(r=>r.id===record.id));
  const row=await ledger.get(record.id);assert.equal(row!.status,"UNCERTAIN");assert.equal(BigInt(row!.fence),BigInt(record.fence)+1n);
  await assert.rejects(ledger.transition(record.id,"child-owner",record.fence,"RESERVED","BUILT",{}),/fence/);
  await assert.rejects(ledger.claim(record.id,"replacement"),/reconciliation/);
  assert.equal((await pg.pool.query("SELECT reserved::text FROM simulation_budget WHERE scope='unit-wallet:unit-v1'")).rows[0].reserved,"100");
  await assert.rejects(ledger.resolveUncertain(record.id,record.fence,"reviewer","unit review","CANCELLED"),/fence/);
  const review=await ledger.resolveUncertain(record.id,row!.fence,"reviewer","Observed read-only process crash; no submission path","MANUAL_REVIEW");
  await ledger.resolveUncertain(record.id,review.fence,"reviewer","Explicitly cancel unsubmitted research intent","CANCELLED");
  assert.equal((await pg.pool.query("SELECT reserved::text FROM simulation_budget WHERE scope='unit-wallet:unit-v1'")).rows[0].reserved,"0");
 });
 }finally{await pg.close();}
});
