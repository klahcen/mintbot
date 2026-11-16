import type{MarketReader,MarketBatch,MarketState,MarketSubject}from"../market/types.js";
import type{VerifiedLaunch}from"../verified-decoders.js";
import {VERIFIED_PROGRAMS}from"../chain.js";
import{FEES}from"../market/accounts.js";
import{PumpMarketAdapter}from"../market/pump.js";
import{PoolMarketAdapter}from"../market/pools.js";
import{simulationAccountKeys}from"./builders.js";
import type{ConstructionEvidence}from"./types.js";
export type SimulationSubject={venue:"pump"|"pumpswap"|"raydium-cpmm"|"meteora-dlmm";address:string;creation?:VerifiedLaunch};
/** Reusable read-only preparation. All final required accounts come from one fresh finalized bank. */
export async function prepareConstruction(subject:SimulationSubject,reader:MarketReader,user:string,input:bigint,side:"buy"|"sell"="buy",slippageBps=100,prefetch?:(minimumSlot:number)=>Promise<unknown>):Promise<ConstructionEvidence>{
 const adapter=subject.venue==="pump"?new PumpMarketAdapter():new PoolMarketAdapter(subject.venue);
 if(subject.venue==="pump"&&!subject.creation)throw Error("Pump preparation requires a verified creation identity");
 let batch:MarketBatch|undefined;
 const memberships=new Map<string,string[]>();
 const capture:MarketReader={...reader,provider:reader.provider,accounts:async(keys,slot)=>{batch=await reader.accounts(keys,slot,{fresh:true});return batch;},largest:reader.largest.bind(reader),
  ...(reader.holders?{holders:async(mint:string,program:string,slot:number)=>{try{const keys=await reader.holders!(mint,program,slot);memberships.set(mint,keys);return keys;}catch(error){memberships.set(mint,[]);throw error;}}}:{})};
 const read=(r:MarketReader):Promise<MarketState<MarketSubject>>=>subject.creation?adapter.read(subject.creation,r):(adapter as PoolMarketAdapter).inspect(subject.address,r);
 const initial=await read(capture);if(!batch)throw Error("Missing construction snapshot");
 const aux=simulationAccountKeys(initial,batch,user),keys=[...new Set([...initial.accounts.map(a=>a.address),...aux])];
 if(keys.length>32)throw Error("Execution evidence exceeds single-bank account bound");
 const program=VERIFIED_PROGRAMS.find(p=>p.name===subject.venue)!.address;
 const [deployments]=await Promise.all([Promise.all([program,...(["pump","pumpswap"].includes(subject.venue)?[FEES]:[])].map(p=>{
  if(!reader.deployment)throw Error("Deployment reader unavailable");return reader.deployment(p,initial.slot);
 })),prefetch?.(initial.slot)]);
 const final=await reader.accounts(keys,initial.slot,{fresh:true});
 if(keys.some(k=>!(k in final.accounts)))throw Error("Final evidence misses requested accounts");
 const finalReader:MarketReader={...capture,holders:async mint=>memberships.get(mint)??[],accounts:async requested=>{if(requested.some(k=>!(k in final.accounts)))throw Error("Final evidence misses newly required accounts");return final;}};
 const state=await read(finalReader),quote=adapter.quote(state as MarketState,side,input,slippageBps);
 return{state,quote,batch:final,deployments};
}
