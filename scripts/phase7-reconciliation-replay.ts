/** Offline artifact generation only; no transport or actual submission. */
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {appendReplay,replayExecution,restoreReplay,serializeReplay,type StatusEvidence} from "../src/simulation/reconciliation.js";
const fixturePath="docs/phase3/fixtures/pump-creation.json",raw=await readFile(fixturePath,"utf8"),fixture=JSON.parse(raw);
const identity={intentId:"phase7-offline-recorded-public-transaction",packetDigest:createHash("sha256").update(JSON.stringify(fixture.result.transaction)).digest("hex"),recordedSignature:fixture.result.transaction.signatures[0],lastValidBlockHeight:100};
const attempt=()=>appendReplay(replayExecution(identity),{kind:"simulated-submission-attempt",packetDigest:identity.packetDigest});
const evidence=(status:StatusEvidence["status"],commitment:StatusEvidence["commitment"],slot=fixture.result.slot):StatusEvidence[]=>["injected-provider-a","injected-provider-b"].map(provider=>({provider,status,commitment,slot,...(status==="failure"?{error:"Injected InstructionError"}:{})}));
const timeout=appendReplay(attempt(),{kind:"rpc-timeout"});
const confirmed=appendReplay(attempt(),{kind:"status-round",evidence:evidence("success","confirmed")});
const rolledBack=appendReplay(confirmed,{kind:"injected-rollback",previousSlot:fixture.result.slot,rootedSlot:fixture.result.slot+1});
const conflicting=evidence("success","confirmed");conflicting[1].status="missing";
const rows={attempt:attempt(),timeout,unknown:appendReplay(timeout,{kind:"status-round",evidence:evidence("missing","processed")}),failed:appendReplay(attempt(),{kind:"status-round",evidence:evidence("failure","finalized")}),confirmed,finalized:appendReplay(confirmed,{kind:"status-round",evidence:evidence("success","finalized")}),rolledBack,expired:appendReplay(timeout,{kind:"block-height",height:101}),providerConflict:appendReplay(attempt(),{kind:"status-round",evidence:conflicting}),restartDuringUncertainty:restoreReplay(serializeReplay(timeout))};
await mkdir("docs/phase7",{recursive:true});
await writeFile("docs/phase7/reconciliation-replay.json",JSON.stringify({kind:"offline-injected-execution-replay",actualBroadcast:false,independentRealProviderAgreement:false,source:{path:fixturePath,sha256:createHash("sha256").update(raw).digest("hex"),signature:identity.recordedSignature,slot:fixture.result.slot,realRecordedError:fixture.result.meta.err,packetDigestEncoding:"SHA256 of recorded parsed transaction JSON, not a serialized wire transaction"},injectedBlockHeights:true,rows},null,2)+"\n");
console.log("Wrote 10 offline scenarios; no transaction signed or submitted");
