import { RealMarketPaper } from "../market/paper.js";
import { marketRisk } from "../market/risk.js";
import { atoms, publicEvidence, type MarketReader, type MarketState, type Quote, type Signal } from "../market/types.js";
import { PumpMarketAdapter } from "../market/pump.js";
import { PoolMarketAdapter } from "../market/pools.js";
import { constructSwap, sha } from "./builders.js";
import { validateUnsigned } from "./policy.js";
import { simulationAccounting } from "./accounting.js";
import { prepareConstruction } from "./prepare.js";
import { SimulationRpc, type SimulationPreparation } from "./rpc.js";
export interface ResearchGateOptions {
 /** Optional additional evidence requirement. Phase8 configures independent-provider agreement; unknown fails closed. */
 providerAgreement?: (state:MarketState)=>Promise<{status:"verified"|"unknown"|"failed";reasons:string[]}>;
}
/** Opt-in research paper gate. Existing mandatory risk checks precede simulations; both sides need real inventory. */
export class SimulationGatedPaper extends RealMarketPaper {
 readonly diagnostics: unknown[] = [];
 private record(value:unknown){this.diagnostics.push(publicEvidence(value));if(this.diagnostics.length>100)this.diagnostics.shift();}
 constructor(readonly original:RealMarketPaper,private reader:MarketReader,private simulation:SimulationRpc,private options:ResearchGateOptions={}){super(original.store,simulation.metrics,original.policy);}
 override async review(state:MarketState,buy:Quote|undefined,sell:Quote|undefined,fees:Signal,version:Signal):Promise<any>{
  const risk=marketRisk(state,buy,sell,fees,version,Date.now(),this.policy);
  if(!risk.eligible)return this.original.review(state,buy,sell,fees,version);
  const evidenceRows:unknown[]=[];
  try{
   if(!this.store.state.running||this.store.state.killed)throw Error("Emergency stop before simulation gate");
   if(this.options.providerAgreement){const agreement=await this.options.providerAgreement(state);if(agreement.status!=="verified")throw Error(`Independent provider agreement ${agreement.status}: ${agreement.reasons.join("; ")}`);}
   const user=state.launch.creator;if(!user)throw Error("Public creator inventory identity unavailable; no funding or invented inventory permitted");
   const strategy=this.store.state.strategies[0];let prepared:SimulationPreparation|undefined;
   const evidence=await prepareConstruction({venue:state.venue as any,address:state.launch.address,creation:state.launch},this.reader,user,atoms(strategy.tradeSol.toString(),9),"buy",strategy.maxSlippageBps,async slot=>{prepared=await this.simulation.prepare(slot);});
   this.simulation.validatePreparation(prepared!);
   const adapter=state.venue==="pump"?new PumpMarketAdapter():new PoolMarketAdapter(state.venue as any);
   const sellQuote=adapter.quote(evidence.state as MarketState,"sell",evidence.quote.minimumOutput,strategy.maxSlippageBps);
   for(const quote of [evidence.quote,sellQuote]){
    if(!this.store.state.running||this.store.state.killed)throw Error("Emergency stop during simulation gate");
    const authorization={strategyVersion:`paper-research:${sha(JSON.stringify(strategy))}`,user,destinationOwner:user,minimumOutput:quote.minimumOutput,maximumInput:quote.input,maximumRent:10000000n,maximumNetworkFee:10000n,maximumPriorityFee:5000n,computeUnits:1000000,microLamports:1000n,expiresAt:Date.now()+1500};
    const plan=await constructSwap({...evidence,quote},authorization,prepared!.block,async bytes=>BigInt(prepared!.rents[bytes]));
    const policy=validateUnsigned(plan),simulation=await this.simulation.simulate(plan),accounting=simulationAccounting(plan,simulation);
    evidenceRows.push({plan,policy,simulation,accounting});
    if(!simulation.success||!accounting.consistent)throw Error(`Mandatory ${quote.side} simulation unavailable or inconsistent: ${accounting.reasons.join("; ")}`);
   }
   if(!this.store.state.running||this.store.state.killed)throw Error("Emergency stop before paper decision");
   // Reusing the same bank keeps both route amounts linked. The existing engine rechecks age, strategy and risk.
   const buySimulation=(evidenceRows[0] as any).simulation,buyAccounting=(evidenceRows[0] as any).accounting;
   const actualFees:Signal={status:"verified",reason:"Actual unsigned buy simulation fee and persistent rent; both directions simulated",value:{baseLamports:(BigInt(buySimulation.fee)-1000n).toString(),priorityLamports:"1000",rentLamports:buyAccounting.persistentRentLamports,computeUnitLimit:1000000,observedAt:buySimulation.observedAt}};
   if(BigInt(buySimulation.fee)<1000n)throw Error("Actual fee below configured priority");
   const decision=await this.original.review(evidence.state as MarketState,evidence.quote,sellQuote,actualFees,version);
   this.record({id:state.launch.id,evidenceRows,decision,realExecution:false});return decision;
  }catch(error){
   const reasons=[`simulationGate: ${(error as Error).message}`];
   this.record({id:state.launch.id,reasons,evidenceRows,realExecution:false});
   return this.store.paperTransaction(s=>{if(s.seen.includes(state.launch.id))return{duplicate:true};s.seen.push(state.launch.id);s.seen=s.seen.slice(-10000);s.marketReviews??=[];s.marketReviews.unshift({id:state.launch.id,at:Date.now(),reasons,evidence:publicEvidence({launch:state.launch,initialRisk:risk,evidenceRows,liveTrading:false}) as Record<string,unknown>});s.marketReviews=s.marketReviews.slice(0,200);return{reasons};});
  }
 }
}
