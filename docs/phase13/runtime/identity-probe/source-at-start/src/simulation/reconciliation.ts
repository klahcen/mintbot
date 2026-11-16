import {createHash} from "node:crypto";

/** Offline model only: this module has no transport, signer, or spending interface. */
export type ReplayState="READY"|"SIMULATED_SUBMISSION_ATTEMPTED"|"UNKNOWN"|"EXECUTION_FAILED"|"CONFIRMED"|"FINALIZED"|"ROLLED_BACK"|"EXPIRED_UNRESOLVED"|"PROVIDER_CONFLICT";
export interface ReplayIdentity {intentId:string;packetDigest:string;recordedSignature:string;lastValidBlockHeight:number;}
export interface StatusEvidence {provider:string;status:"missing"|"success"|"failure";commitment:"processed"|"confirmed"|"finalized";slot:number;error?:string;}
export type ReplayEvent=
 |{kind:"simulated-submission-attempt";packetDigest:string}
 |{kind:"rpc-timeout"}
 |{kind:"status-round";evidence:StatusEvidence[]}
 |{kind:"block-height";height:number}
 |{kind:"injected-rollback";previousSlot:number;rootedSlot:number};
export interface ReplaySnapshot {version:1;identity:ReplayIdentity;events:ReplayEvent[];state:ReplayState;attempts:number;lastObservedSlot:number|null;agreement:"none"|"single-provider"|"multiple-providers";actualBroadcast:false;automaticSecondSpendAllowed:false;}
const digest=(v:string)=>createHash("sha256").update(v).digest("hex");
function invariant(ok:unknown,reason:string):asserts ok {if(!ok)throw new Error(reason);}
function integer(v:number){return Number.isSafeInteger(v)&&v>=0;}
function apply(s:ReplaySnapshot,e:ReplayEvent){
 if(e.kind==="simulated-submission-attempt"){
  invariant(s.attempts===0&&s.state==="READY","Original attempt already consumed; another spending attempt is forbidden");
  invariant(e.packetDigest===s.identity.packetDigest,"Original packet identity mismatch");s.attempts=1;s.state="SIMULATED_SUBMISSION_ATTEMPTED";return;
 }
 invariant(s.attempts===1,"An offline submission attempt must precede outcome evidence");
 if(e.kind==="rpc-timeout"){if(s.state!=="FINALIZED"&&s.state!=="EXECUTION_FAILED"&&s.state!=="PROVIDER_CONFLICT")s.state="UNKNOWN";return;}
 if(e.kind==="block-height"){
  invariant(integer(e.height),"Invalid block height");
  // Expiration proves the packet cannot newly land, not that it never landed.
  if(e.height>s.identity.lastValidBlockHeight&&!["FINALIZED","EXECUTION_FAILED","PROVIDER_CONFLICT","CONFIRMED"].includes(s.state))s.state="EXPIRED_UNRESOLVED";
  return;
 }
 if(e.kind==="injected-rollback"){
  invariant(s.state==="CONFIRMED"&&integer(e.rootedSlot)&&e.previousSlot===s.lastObservedSlot&&e.rootedSlot>e.previousSlot,"Rollback requires a previously confirmed slot and later injected canonical root");
  s.state="ROLLED_BACK";return;
 }
 invariant(e.kind==="status-round"&&Array.isArray(e.evidence)&&e.evidence.length>0&&e.evidence.length<=8,"Bounded status evidence required");
 const providers=new Set<string>();
 for(const r of e.evidence){invariant(typeof r.provider==="string"&&r.provider.length>0&&!providers.has(r.provider)&&integer(r.slot),"Invalid or repeated provider evidence");providers.add(r.provider);invariant(["missing","success","failure"].includes(r.status)&&["processed","confirmed","finalized"].includes(r.commitment),"Invalid status evidence");invariant(r.status!=="failure"||typeof r.error==="string"&&r.error.length>0,"Failed execution requires an error");}
 s.agreement=providers.size>1?"multiple-providers":"single-provider";
 const fingerprints=new Set(e.evidence.map(r=>JSON.stringify([r.status,r.commitment,r.slot,r.error??null])));
 if(fingerprints.size!==1){s.state="PROVIDER_CONFLICT";return;}
 const r=e.evidence[0];
 if(s.state==="PROVIDER_CONFLICT")return; // Explicit manual reconciliation, never an automatic reset.
 if(s.state==="FINALIZED"){
  if(r.status!=="success"||r.commitment!=="finalized"||r.slot!==s.lastObservedSlot)s.state="PROVIDER_CONFLICT";
  return;
 }
 if(s.state==="EXECUTION_FAILED"){
  if(r.status!=="failure"||r.commitment!=="finalized"||r.slot!==s.lastObservedSlot)s.state="PROVIDER_CONFLICT";
  return;
 }
 if(r.status==="missing"){s.state="UNKNOWN";return;}
 s.lastObservedSlot=r.slot;
 if(r.status==="failure"){s.state=r.commitment==="finalized"?"EXECUTION_FAILED":"UNKNOWN";return;}
 s.state=r.commitment==="finalized"?"FINALIZED":r.commitment==="confirmed"?"CONFIRMED":"UNKNOWN";
}
export function replayExecution(identity:ReplayIdentity,events:ReplayEvent[]=[]):ReplaySnapshot {
 invariant(typeof identity.intentId==="string"&&identity.intentId.length>0&&/^[a-f0-9]{64}$/.test(identity.packetDigest)&&typeof identity.recordedSignature==="string"&&identity.recordedSignature.length>0&&integer(identity.lastValidBlockHeight),"Invalid original execution identity");
 invariant(Array.isArray(events)&&events.length<=1024,"Replay history exceeds bound");
 const snapshot:ReplaySnapshot={version:1,identity:structuredClone(identity),events:[],state:"READY",attempts:0,lastObservedSlot:null,agreement:"none",actualBroadcast:false,automaticSecondSpendAllowed:false};
 for(const event of events){apply(snapshot,event);snapshot.events.push(structuredClone(event));}
 return snapshot;
}
export function appendReplay(previous:ReplaySnapshot,event:ReplayEvent){return replayExecution(previous.identity,[...previous.events,event]);}
/** Envelope integrity detects corruption; this hash is not authentication against a malicious writer. */
export function serializeReplay(s:ReplaySnapshot){const payload=JSON.stringify({version:1,identity:s.identity,events:s.events});return JSON.stringify({payload,sha256:digest(payload)});}
export function restoreReplay(serialized:string):ReplaySnapshot {
 invariant(Buffer.byteLength(serialized)<=1024*1024,"Replay envelope exceeds size limit");
 const envelope=JSON.parse(serialized);invariant(typeof envelope.payload==="string"&&digest(envelope.payload)===envelope.sha256,"Replay integrity mismatch");const payload=JSON.parse(envelope.payload);invariant(payload.version===1,"Unsupported replay version");return replayExecution(payload.identity,payload.events);
}
