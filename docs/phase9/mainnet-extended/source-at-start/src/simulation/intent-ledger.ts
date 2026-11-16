import {Pool,type PoolClient} from "pg";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {Telemetry} from "../telemetry.js";
import {publicEvidence} from "../market/types.js";
export type IntentStatus="RESERVED"|"BUILT"|"SIMULATED"|"POLICY_APPROVED"|"FAILED"|"CANCELLED"|"UNCERTAIN"|"MANUAL_REVIEW";
export interface IntentKey {opportunity:string;strategy:string;side:"buy"|"sell";generation:string;wallet:string;}
export interface Reservation {asset:string;atoms:string;}
export type Intent={id:string;status:IntentStatus;owner:string|null;fence:string;lease_until:Date|null;data:Record<string,unknown>;payload_hash:string;};
export const intentId=(key:IntentKey)=>createHash("sha256").update(JSON.stringify([key.opportunity,key.strategy,key.side,key.generation,key.wallet])).digest("hex");
const json=(v:unknown)=>JSON.stringify(publicEvidence(v),(_key,value)=>value&&typeof value==="object"&&!Array.isArray(value)?Object.fromEntries(Object.keys(value).sort().map(k=>[k,value[k]])):value);
function bounded(v:unknown){const s=json(v);if(Buffer.byteLength(s)>262144)throw Error("Intent payload bound");return s;}
/** Separate transactional reservation and audit ledger. It never signs, submits, or reads paper balances. */
export class IntentLedger {
 constructor(readonly pool:Pool,readonly metrics=new Telemetry()){}
 async migrate(){
  const migrations=await Promise.all(["intent-schema.sql","intent-migration-007.sql"].map(async name=>({name,sql:await readFile(new URL(`./${name}`,import.meta.url),"utf8")})));
  await this.transaction(async c=>{
   await c.query("SELECT pg_advisory_xact_lock(615061506150)");
   await c.query("CREATE TABLE IF NOT EXISTS simulation_schema_migration(version text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
   for(const migration of migrations){
    const hash=createHash("sha256").update(migration.sql).digest("hex"), prior=await c.query("SELECT sha256 FROM simulation_schema_migration WHERE version=$1",[migration.name]);
    if(prior.rowCount){if(prior.rows[0].sha256!==hash)throw Error(`Intent migration checksum mismatch: ${migration.name}`);continue;}
    await c.query(migration.sql);await c.query("INSERT INTO simulation_schema_migration(version,sha256) VALUES($1,$2)",[migration.name,hash]);
   }
  });
 }
 private async transaction<T>(fn:(c:PoolClient)=>Promise<T>){
  return this.metrics.measureAsync("intent.commit_ms",async()=>{
   const c=await this.pool.connect();let committing=false;
   try{await c.query("BEGIN");await c.query("SET LOCAL synchronous_commit = on");await c.query("SET LOCAL lock_timeout = '2s'");await c.query("SET LOCAL statement_timeout = '5s'");
    const result=await fn(c);committing=true;await c.query("COMMIT");return result;
   }catch(e){await c.query("ROLLBACK").catch(()=>undefined);if(committing)throw Error("Intent commit outcome uncertain; reconcile unique identity before retry");throw e;}finally{c.release();}
  });
 }
 async budget(scope:string,asset:string,capacity:bigint){if(!scope||scope.length>512||!asset||asset.length>128||capacity<0n||capacity>=10n**78n)throw Error("Invalid budget");
  await this.transaction(async c=>{const r=await c.query("INSERT INTO simulation_budget(scope,asset,capacity) VALUES($1,$2,$3) ON CONFLICT(scope,asset) DO UPDATE SET capacity=EXCLUDED.capacity WHERE simulation_budget.reserved<=EXCLUDED.capacity RETURNING scope",[scope,asset,capacity.toString()]);if(!r.rowCount)throw Error("Budget below durable reservations");});
 }
 async reserve(key:IntentKey,reservations:Reservation[],payload:unknown):Promise<Intent>{
  if(Object.values(key).some(v=>typeof v!=="string"||!v||v.length>256)||!["buy","sell"].includes(key.side)||!reservations.length||reservations.length>2||new Set(reservations.map(r=>r.asset)).size!==reservations.length||reservations.some(r=>!r.asset||r.asset.length>128||!/^\d{1,78}$/.test(r.atoms)||BigInt(r.atoms)<=0n))throw Error("Invalid intent reservation");
  const id=intentId(key),data=bounded(payload),hash=createHash("sha256").update(data).digest("hex"),scope=`${key.wallet}:${key.strategy}`,holds=[...reservations].sort((a,b)=>a.asset.localeCompare(b.asset));
  return this.transaction(async c=>{
   // Serialize first creation even when no intent row exists yet. Hash collisions only over-serialize.
   await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[id]);
   const prior=await c.query("SELECT * FROM simulation_intent WHERE id=$1 FOR UPDATE",[id]);
   if(prior.rowCount){if(prior.rows[0].payload_hash!==hash||json(prior.rows[0].reservation)!==json(holds))throw Error("Conflicting duplicate intent");return prior.rows[0]as Intent;}
   for(const r of holds)for(const reservationScope of [`wallet:${key.wallet}`,scope]){const b=await c.query("UPDATE simulation_budget SET reserved=reserved+$3 WHERE scope=$1 AND asset=$2 AND capacity-reserved>=$3 RETURNING scope",[reservationScope,r.asset,r.atoms]);if(!b.rowCount)throw Error("Insufficient reservation capacity");}
   const r=await c.query("INSERT INTO simulation_intent(id,opportunity,strategy,side,generation,wallet,payload_hash,reservation,scope,status,data) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'RESERVED',$10) RETURNING *",[id,key.opportunity,key.strategy,key.side,key.generation,key.wallet,hash,json(holds),scope,data]);return r.rows[0]as Intent;
  });
 }
 async get(id:string):Promise<Intent|undefined>{return(await this.pool.query("SELECT * FROM simulation_intent WHERE id=$1",[id])).rows[0];}
 async claim(id:string,owner:string,leaseMs=15000):Promise<Intent>{
  if(!owner||owner.length>128||!Number.isInteger(leaseMs)||leaseMs<100||leaseMs>60000)throw Error("Lease bound");
  return this.transaction(async c=>{const r=await c.query("UPDATE simulation_intent SET owner=$2,fence=fence+1,lease_until=clock_timestamp()+($3::bigint*interval '1 millisecond') WHERE id=$1 AND owner IS NULL AND status IN ('RESERVED','BUILT','SIMULATED') RETURNING *",[id,owner,leaseMs]);if(!r.rowCount)throw Error("Intent already owned or requires reconciliation");return r.rows[0]as Intent;});
 }
 async renew(id:string,owner:string,fence:string,leaseMs=15000){if(!Number.isInteger(leaseMs)||leaseMs<100||leaseMs>60000)throw Error("Lease bound");await this.transaction(async c=>{const r=await c.query("UPDATE simulation_intent SET lease_until=clock_timestamp()+($4::bigint*interval '1 millisecond') WHERE id=$1 AND owner=$2 AND fence=$3 AND lease_until>clock_timestamp() AND status NOT IN ('FAILED','CANCELLED') RETURNING id",[id,owner,fence,leaseMs]);if(!r.rowCount)throw Error("Lost intent fence/lease");});}
 async transition(id:string,owner:string,fence:string,from:IntentStatus,to:IntentStatus,evidence:unknown):Promise<Intent>{
  const next:Partial<Record<IntentStatus,IntentStatus>>={RESERVED:"BUILT",BUILT:"SIMULATED",SIMULATED:"POLICY_APPROVED"};
  if(["FAILED","CANCELLED"].includes(from)||!(next[from]===to||["UNCERTAIN","MANUAL_REVIEW","FAILED","CANCELLED"].includes(to)))throw Error("Unreachable intent transition");
  const data=bounded(evidence);
  return this.transaction(async c=>{const r=await c.query("UPDATE simulation_intent SET status=$5,data=$6 WHERE id=$1 AND owner=$2 AND fence=$3 AND status=$4 AND lease_until>clock_timestamp() RETURNING *",[id,owner,fence,from,to,data]);if(!r.rowCount)throw Error("Lost intent fence/lease or state conflict");
   if(to==="FAILED"||to==="CANCELLED"){for(const hold of r.rows[0].reservation as Reservation[])for(const scope of [`wallet:${r.rows[0].wallet}`,r.rows[0].scope])await c.query("UPDATE simulation_budget SET reserved=reserved-$3 WHERE scope=$1 AND asset=$2",[scope,hold.asset,hold.atoms]);}
   return r.rows[0]as Intent;
  });
 }
 async reconcileExpired(){return this.transaction(async c=>{const r=await c.query("UPDATE simulation_intent SET status='UNCERTAIN',owner=NULL,fence=fence+1,lease_until=NULL,data=jsonb_build_object('reason','Expired owner lease; manual review required, reservations retained') WHERE ((owner IS NOT NULL AND lease_until<=clock_timestamp()) OR (owner IS NULL AND status='RESERVED' AND created_at<clock_timestamp()-interval '30 seconds')) AND status NOT IN ('FAILED','CANCELLED') RETURNING *");return r.rows as Intent[];});}
 async resolveUncertain(id:string,expectedFence:string,reviewer:string,reason:string,resolution:"MANUAL_REVIEW"|"CANCELLED"){
  if(!reviewer||reviewer.length>128||!reason||reason.length>1000||!["MANUAL_REVIEW","CANCELLED"].includes(resolution))throw Error("Manual review identity/reason required");
  return this.transaction(async c=>{const r=await c.query("UPDATE simulation_intent SET status=$4,owner=$3,fence=fence+1,lease_until=NULL,data=$5 WHERE id=$1 AND fence=$2 AND status IN ('UNCERTAIN','MANUAL_REVIEW') AND (lease_until IS NULL OR lease_until<=clock_timestamp()) RETURNING *",[id,expectedFence,reviewer,resolution,json({reviewer,reason,liveAuthorized:false})]);
   if(!r.rowCount)throw Error("Manual review fence/state conflict");
   if(resolution==="CANCELLED")for(const hold of r.rows[0].reservation as Reservation[])for(const scope of [`wallet:${r.rows[0].wallet}`,r.rows[0].scope])await c.query("UPDATE simulation_budget SET reserved=reserved-$3 WHERE scope=$1 AND asset=$2",[scope,hold.asset,hold.atoms]);
   return r.rows[0]as Intent;
  });
 }
 async audit(id:string){return(await this.pool.query("SELECT * FROM simulation_intent_audit WHERE intent=$1 ORDER BY sequence",[id])).rows;}
}
