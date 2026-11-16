import {performance} from "node:perf_hooks";
import {Telemetry} from "../telemetry.js";
import {validateUnsigned} from "./policy.js";
import type {SwapPlan,SimulationResult,BlockContext} from "./types.js";
export interface SimulationPreparation {block:BlockContext;rents:Readonly<Record<number,string>>;provider:string;observedAt:number;}
const preparations=new WeakSet<object>();
/** Hard method allowlist, unsigned requests only. No send, sign, airdrop, or arbitrary RPC entry point. */
export class SimulationRpc {
 readonly provider:string;
 constructor(private endpoint:string,readonly metrics=new Telemetry(),private timeoutMs=5000){const u=new URL(endpoint);if(!["https:","http:"].includes(u.protocol)||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error("Simulation transport configuration");this.provider=u.host;}
 private async read(method:"simulateTransaction"|"getLatestBlockhash"|"getMinimumBalanceForRentExemption"|"getBlockHeight",params:unknown[]):Promise<any>{
  return this.metrics.rpc(`simulation.${method}`,async()=>{
   try{const r=await fetch(this.endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(this.timeoutMs)});
    if(!r.ok||!r.body){await r.body?.cancel();throw Error(`Read-only simulation RPC HTTP ${r.status}`);}
    const reader=r.body.getReader(),chunks:Uint8Array[]=[];let bytes=0;
    try{for(;;){const p=await reader.read();if(p.done)break;bytes+=p.value.length;if(bytes>4*1024*1024){await reader.cancel();throw Error("Simulation byte bound");}chunks.push(p.value);}}finally{reader.releaseLock();}
    const body=JSON.parse(Buffer.concat(chunks).toString());if(body.error&&Number.isInteger(body.error.code))throw Error(`Read-only simulation RPC error ${body.error.code}`);if(body.id!==1||body.error||body.result===undefined)throw Error("RPC");return body.result;
   }catch(error){if(error instanceof Error&&/^Read-only simulation RPC (?:HTTP \d{3}|error -?\d+)$/.test(error.message))throw error;throw Error("Read-only simulation RPC failed or timed out");}
  });
 }
 async block(minimumSlot:number):Promise<BlockContext>{
  const r=await this.read("getLatestBlockhash",[{commitment:"finalized",minContextSlot:minimumSlot}]);
  if(!Number.isSafeInteger(r?.context?.slot)||r.context.slot<minimumSlot||!Number.isSafeInteger(r.value?.lastValidBlockHeight)||typeof r.value?.blockhash!=="string")throw Error("Invalid blockhash evidence");
  return {blockhash:r.value.blockhash,slot:r.context.slot,lastValidBlockHeight:r.value.lastValidBlockHeight,observedAt:Date.now()};
 }
 async rent(bytes:number){if(!Number.isInteger(bytes)||bytes<165||bytes>1024)throw Error("Rent size bound");const v=await this.read("getMinimumBalanceForRentExemption",[bytes,{commitment:"finalized"}]);if(!Number.isSafeInteger(v)||v<0)throw Error("Invalid rent evidence");return BigInt(v);}
 async prepare(minimumSlot:number):Promise<SimulationPreparation>{
  const [block,r165,r170]=await Promise.all([this.block(minimumSlot),this.rent(165),this.rent(170)]);
  const p=Object.freeze({block:Object.freeze(block),rents:Object.freeze({165:r165.toString(),170:r170.toString()}),provider:this.provider,observedAt:Date.now()});preparations.add(p);return p;
 }
 validatePreparation(p:SimulationPreparation){if(!preparations.has(p)||p.provider!==this.provider||Date.now()<p.observedAt||Date.now()-p.observedAt>5000)throw Error("Untrusted or expired read-only preparation");}
 async simulate(plan:SwapPlan):Promise<SimulationResult>{
  const height=await this.read("getBlockHeight",[{commitment:"finalized"}]);
  if(!Number.isSafeInteger(height)||height>plan.block.lastValidBlockHeight)throw Error("Stale blockhash validity height");
  validateUnsigned(plan);const addresses=[...new Set([plan.user,plan.source,plan.destination])];
  const r=await this.metrics.measureAsync("simulation.rpc_ms",()=>this.read("simulateTransaction",[plan.unsignedBase64,{encoding:"base64",commitment:"finalized",sigVerify:false,replaceRecentBlockhash:false,minContextSlot:plan.state.slot,innerInstructions:true,accounts:{encoding:"base64",addresses}}]));
  const v=r?.value;
  if(!Number.isSafeInteger(r?.context?.slot)||r.context.slot<plan.state.slot||!v||!("err"in v)||
   v.logs!==null&&(!Array.isArray(v.logs)||v.logs.length>10000||v.logs.some((l:unknown)=>typeof l!=="string"))||
   v.unitsConsumed!==undefined&&(!Number.isSafeInteger(v.unitsConsumed)||v.unitsConsumed<0)||
   v.accounts!==null&&v.accounts!==undefined&&(!Array.isArray(v.accounts)||v.accounts.length!==addresses.length))throw Error("Inconsistent simulation provider evidence");
  const fee=v.fee===undefined?null:typeof v.fee==="string"&&/^\d+$/.test(v.fee)?v.fee:Number.isSafeInteger(v.fee)&&v.fee>=0?String(v.fee):null;
  return {kind:"unsigned-protocol-simulation",provider:this.provider,commitment:"finalized",contextSlot:r.context.slot,observedAt:Date.now(),
   messageDigest:plan.messageDigest,success:v.err===null,error:v.err,logs:v.logs??[],unitsConsumed:v.unitsConsumed??null,accounts:v.accounts??null,
   preTokenBalances:Array.isArray(v.preTokenBalances)?v.preTokenBalances:null,postTokenBalances:Array.isArray(v.postTokenBalances)?v.postTokenBalances:null,
   preBalances:Array.isArray(v.preBalances)?v.preBalances:null,postBalances:Array.isArray(v.postBalances)?v.postBalances:null,fee,raw:v,signatureVerified:false,submitted:false};
 }
}
