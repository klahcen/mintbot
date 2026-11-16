import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile} from "node:fs/promises";
import {appendReplay,replayExecution,restoreReplay,serializeReplay,type StatusEvidence} from "../src/simulation/reconciliation.js";
const fixture=JSON.parse(await readFile("docs/phase3/fixtures/pump-creation.json","utf8"));
const original={intentId:"recorded-pump-creation-offline-model",packetDigest:createHash("sha256").update(JSON.stringify(fixture.result.transaction)).digest("hex"),recordedSignature:fixture.result.transaction.signatures[0],lastValidBlockHeight:100};
const started=()=>appendReplay(replayExecution(original),{kind:"simulated-submission-attempt",packetDigest:original.packetDigest});
const evidence=(status:StatusEvidence["status"],commitment:StatusEvidence["commitment"],slot=fixture.result.slot):StatusEvidence[]=>["injected-provider-a","injected-provider-b"].map(provider=>({provider,status,commitment,slot,...(status==="failure"?{error:"Injected InstructionError"}:{})}));
test("Recorded public transaction anchors offline identity; timeout, unknown, restart never permit a second attempt",()=>{
 assert.equal(fixture.result.meta.err,null);assert(original.recordedSignature.length>60);
 let s=appendReplay(started(),{kind:"rpc-timeout"});assert.equal(s.state,"UNKNOWN");
 s=appendReplay(s,{kind:"status-round",evidence:evidence("missing","processed")});assert.equal(s.state,"UNKNOWN");
 s=restoreReplay(serializeReplay(s));assert.equal(s.identity.recordedSignature,original.recordedSignature);assert.equal(s.actualBroadcast,false);assert.equal(s.automaticSecondSpendAllowed,false);
 assert.throws(()=>appendReplay(s,{kind:"simulated-submission-attempt",packetDigest:original.packetDigest}),/forbidden/);
 assert.throws(()=>appendReplay(replayExecution(original),{kind:"simulated-submission-attempt",packetDigest:"0".repeat(64)}),/identity/);
});
test("Offline confirmed then finalized evidence is replayable and finalization cannot silently roll back",()=>{
 let s=appendReplay(started(),{kind:"status-round",evidence:evidence("success","confirmed")});assert.equal(s.state,"CONFIRMED");
 s=appendReplay(s,{kind:"status-round",evidence:evidence("success","finalized")});assert.equal(s.state,"FINALIZED");assert.equal(s.agreement,"multiple-providers");
 assert.deepEqual(restoreReplay(serializeReplay(s)),s);
 assert.equal(appendReplay(s,{kind:"status-round",evidence:evidence("missing","processed")}).state,"PROVIDER_CONFLICT");
});
test("Offline finalized execution failure remains distinct from timeout and charged-fee economics",()=>{
 let s=appendReplay(started(),{kind:"status-round",evidence:evidence("failure","finalized")});assert.equal(s.state,"EXECUTION_FAILED");
 s=appendReplay(s,{kind:"rpc-timeout"});assert.equal(s.state,"EXECUTION_FAILED");assert.equal(s.attempts,1);
 assert.equal(appendReplay(s,{kind:"status-round",evidence:evidence("success","finalized")}).state,"PROVIDER_CONFLICT");
});
test("Injected rollback and blockhash expiry retain original identity and unresolved spending exposure",()=>{
 let s=appendReplay(started(),{kind:"status-round",evidence:evidence("success","confirmed",50)});
 s=appendReplay(s,{kind:"injected-rollback",previousSlot:50,rootedSlot:51});assert.equal(s.state,"ROLLED_BACK");
 s=appendReplay(s,{kind:"block-height",height:101});assert.equal(s.state,"EXPIRED_UNRESOLVED");assert.equal(s.automaticSecondSpendAllowed,false);
 assert.equal(restoreReplay(serializeReplay(s)).identity.packetDigest,original.packetDigest);
 const expired=appendReplay(appendReplay(started(),{kind:"rpc-timeout"}),{kind:"block-height",height:101});assert.equal(expired.state,"EXPIRED_UNRESOLVED");
 assert.equal(appendReplay(expired,{kind:"status-round",evidence:evidence("success","finalized")}).state,"FINALIZED");
});
test("Provider conflict fails closed across restarts, repeated provider IDs cannot masquerade as agreement",()=>{
 const rows=evidence("success","confirmed");rows[1].status="missing";
 let s=appendReplay(started(),{kind:"status-round",evidence:rows});assert.equal(s.state,"PROVIDER_CONFLICT");
 s=restoreReplay(serializeReplay(s));assert.equal(appendReplay(s,{kind:"status-round",evidence:evidence("success","finalized")}).state,"PROVIDER_CONFLICT");
 assert.throws(()=>appendReplay(started(),{kind:"status-round",evidence:[rows[0],rows[0]]}),/repeated/);
});
test("Replay rejects corrupted snapshots, unbounded evidence and outcome-before-attempt",()=>{
 assert.throws(()=>restoreReplay(serializeReplay(started()).replace("rpc-timeout","invalid").replace("recorded-pump","corrupt-pump")),/integrity/);
 assert.throws(()=>appendReplay(replayExecution(original),{kind:"rpc-timeout"}),/precede/);
 assert.throws(()=>appendReplay(started(),{kind:"status-round",evidence:[]}),/Bounded/);
});
