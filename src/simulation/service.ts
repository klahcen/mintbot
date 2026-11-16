import {randomUUID} from "node:crypto";
import {BoundedStage} from "../stages.js";
import {Telemetry} from "../telemetry.js";
import {SOL} from "../market/accounts.js";
import {marketRisk} from "../market/risk.js";
import type {RealMarketPaper} from "../market/paper.js";
import {verified,type Quote,type Signal} from "../market/types.js";
import {constructSwap} from "./builders.js";
import {validateUnsigned} from "./policy.js";
import {SimulationRpc,type SimulationPreparation} from "./rpc.js";
import {IntentLedger,intentId,type IntentKey} from "./intent-ledger.js";
import {simulationAccounting} from "./accounting.js";
import type {ConstructionEvidence,ResearchAuthorization} from "./types.js";
/** An explicit, bounded read-only service. Caller must provide an emergency-stop source; no automatic signer or submitter. */
export class SimulationService {
 private stage:BoundedStage;
 constructor(readonly rpc:SimulationRpc,readonly ledger:IntentLedger,private stopped:()=>boolean,readonly metrics=new Telemetry()){
  this.stage=new BoundedStage("simulation.pipeline",16,2,metrics);
 }
 review(key:IntentKey,e:ConstructionEvidence,a:ResearchAuthorization,entry?:{paper:RealMarketPaper;sell:Quote;fees:Signal;deployment:Signal},prepared?:SimulationPreparation){
  const op=this.stage.trySubmit(async()=>{
   if(this.stopped())throw Error("Emergency stop or simulation service stopped");
   const existing=await this.ledger.get(intentId(key));if(existing)return{duplicate:true,intent:existing};
   const started=this.metrics.now();
   const preparation=prepared??await this.rpc.prepare(e.state.slot);this.rpc.validatePreparation(preparation);
   const block=preparation.block,rent165=BigInt(preparation.rents[165]),rent170=BigInt(preparation.rents[170]);
   // Blockhash/rent retrieval is read-only preparation; quote expiry is rechecked after it.
   const rent=new Map<number,bigint>([[165,rent165],[170,rent170]]);
   const plan=await this.metrics.measureAsync("simulation.build_ms",()=>constructSwap(e,a,block,async n=>{const r=rent.get(n);if(r===undefined)throw Error("Unreviewed rent size");return r;}));
   this.metrics.observe("simulation.serialization_ms",plan.serializationMs);
   validateUnsigned(plan);if(this.stopped())throw Error("Emergency stop before durable reservation");
   const holds=plan.quote.side==="buy"?[{asset:SOL,atoms:(plan.input+a.maximumRent+a.maximumNetworkFee+a.maximumPriorityFee).toString()}]:
    [{asset:plan.state.mint,atoms:plan.input.toString()},{asset:SOL,atoms:(a.maximumRent+a.maximumNetworkFee+a.maximumPriorityFee).toString()}].filter(h=>BigInt(h.atoms)>0n);
   if(key.strategy!==a.strategyVersion||key.wallet!==a.user||key.opportunity!==e.state.launch.id||key.side!==plan.quote.side)throw Error("Intent authorization identity mismatch");
   const intent=await this.ledger.reserve(key,holds,{messageDigest:plan.messageDigest,quoteDigest:e.state.digest,input:plan.input.toString(),minimumOutput:plan.minimumOutput.toString()});
   if(intent.status!=="RESERVED"||intent.owner)return{duplicate:true,intent};
   const owner=randomUUID(),lease=await this.ledger.claim(intent.id,owner,30000);
   await this.ledger.transition(intent.id,owner,lease.fence,"RESERVED","BUILT",{plan});
   try{
    if(this.stopped())throw Error("Emergency stop before simulation");validateUnsigned(plan);
    const simulation=await this.rpc.simulate(plan),accounting=simulationAccounting(plan,simulation);
    if(this.stopped())throw Error("Emergency stop after simulation");
    const simulated=await this.ledger.transition(intent.id,owner,lease.fence,"BUILT",simulation.success?"SIMULATED":"FAILED",{plan,simulation,accounting});
    let approval:string[]=[...accounting.reasons];
    if(entry&&!("purpose"in e.state.launch))approval.push(...marketRisk(e.state as any,e.quote,entry.sell,entry.fees,entry.deployment,Date.now(),entry.paper.policy).reasons);
    else approval.push("No independently eligible creation/strategy evidence; diagnostic simulation only");
    if(!simulation.success)return{intent:simulated,simulation,accounting,approval};
    if(!approval.length&&entry){const policy=validateUnsigned(plan);const s=entry.paper.store.state;
     if(this.stopped()||!s.running||s.killed)throw Error("Emergency stop before paper review");
     // Existing risk, strategy, quote-age and exact accounting controls run again. Simulation never fabricates a fill.
     const priority=(BigInt(a.computeUnits)*a.microLamports+999999n)/1000000n;
     if(simulation.fee===null||BigInt(simulation.fee)<priority)throw Error("Actual simulated fee cannot cover configured priority");
     const actualFees=verified({baseLamports:(BigInt(simulation.fee)-priority).toString(),priorityLamports:priority.toString(),
      rentLamports:accounting.persistentRentLamports,computeUnitLimit:a.computeUnits,observedAt:simulation.observedAt},
      "Actual unsigned simulation fee; configured CU priority and persistent account rent validated against native effects; temporary wrapped-SOL rent refund retained",simulation.contextSlot);
     const paper=await entry.paper.review(e.state as any,e.quote,entry.sell,actualFees,entry.deployment);
     if("reasons"in paper)approval.push(...(paper.reasons??[]));
     if(!approval.length)await this.ledger.transition(intent.id,owner,lease.fence,"SIMULATED","POLICY_APPROVED",{plan,simulation,accounting,paper,policy,liveAuthorized:false});
    }
    this.metrics.observe("simulation.evidence_to_result_ms",this.metrics.now()-started);
    if(e.state.launch.receiptMonoMs!==undefined&&this.metrics.now()>=e.state.launch.receiptMonoMs)this.metrics.observe("simulation.event_to_result_ms",this.metrics.now()-e.state.launch.receiptMonoMs);
    return{intent:await this.ledger.get(intent.id),simulation,accounting,approval};
   }catch(error){const current=await this.ledger.get(intent.id).catch(()=>undefined);
    if(current&&!["FAILED","CANCELLED"].includes(current.status))await this.ledger.transition(intent.id,owner,lease.fence,current.status,"UNCERTAIN",{reason:error instanceof Error?error.message:"Simulation uncertainty"}).catch(()=>undefined);throw error;}
  });if(!op)throw Error("Simulation backlog capacity");return op;
 }
 async close(){this.stage.close();await this.stage.drain();}
}
