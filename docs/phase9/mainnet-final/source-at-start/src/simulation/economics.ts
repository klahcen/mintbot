/** Exact research accounting; no RPC data is inferred and no execution is authorized. */
export type EconomicPurpose="swap-principal"|"pool-fee"|"platform-fee"|"base-fee"|"priority-fee"|"ata-rent"|"rent-refund"|"wrap"|"unwrap"|"rounding";
export interface EconomicPosting {asset:string;purpose:EconomicPurpose;delta:string;}
export interface ObservedBalance {asset:string;before:string;after:string;}
const uint=(s:string)=>{if(typeof s!=="string"||!/^\d+$/.test(s))throw new Error("Expected exact unsigned integer");return BigInt(s);};
const sint=(s:string)=>{if(typeof s!=="string"||!/^-?\d+$/.test(s))throw new Error("Expected exact signed integer");return BigInt(s);};
/** Postings use owner balance deltas. Include each charge once: fees already in a net swap amount must not also be posted separately. */
export function reconcileEconomics(observed:ObservedBalance[],postings:EconomicPosting[],outcome:"success"|"failed"){
 if(observed.length>128||postings.length>256)throw new Error("Economic evidence exceeds bounds");
 const balances=new Map<string,{observed:bigint;modeled:bigint}>(),reasons:string[]=[];
 for(const row of observed){if(!row.asset||balances.has(row.asset))throw new Error("Duplicate or missing economic asset");balances.set(row.asset,{observed:uint(row.after)-uint(row.before),modeled:0n});}
 for(const p of postings){const delta=sint(p.delta),balance=balances.get(p.asset);if(!balance){reasons.push(`Missing authoritative balance for ${p.asset}`);continue;}
  if(!["swap-principal","pool-fee","platform-fee","base-fee","priority-fee","ata-rent","rent-refund","wrap","unwrap","rounding"].includes(p.purpose))throw new Error("Unknown economic posting purpose");
  if(p.purpose==="rounding"&&(delta < -1n||delta > 1n))reasons.push("Rounding posting exceeds one atomic unit");
  if(["pool-fee","platform-fee","base-fee","priority-fee","ata-rent"].includes(p.purpose)&&delta>0n)reasons.push(`Charge must debit: ${p.purpose}`);
  if(["rent-refund"].includes(p.purpose)&&delta<0n)reasons.push(`Refund must credit: ${p.purpose}`);
  if(["base-fee","priority-fee","ata-rent","rent-refund"].includes(p.purpose)&&p.asset!=="SOL")reasons.push(`Native posting requires SOL: ${p.purpose}`);
  if(p.purpose==="wrap"||p.purpose==="unwrap"){
   if(!["SOL","WSOL"].includes(p.asset))reasons.push("Wrap postings require SOL or WSOL");
   const nativeDebit=p.purpose==="wrap"?p.asset==="SOL":p.asset==="WSOL";
   if(nativeDebit?delta>0n:delta<0n)reasons.push(`Incorrect wrapped-SOL direction: ${p.purpose}`);
  }
  if(outcome==="failed"&&!["base-fee","priority-fee"].includes(p.purpose)&&delta!==0n)reasons.push(`Failed atomic transaction cannot retain ${p.purpose}`);
  balance.modeled+=delta;
 }
 for(const purpose of ["wrap","unwrap"] as const){const matching=postings.filter(p=>p.purpose===purpose);if(matching.reduce((n,p)=>n+sint(p.delta),0n)!==0n)reasons.push(`Unbalanced ${purpose} conversion`);}
 const effects=[...balances].map(([asset,b])=>({asset,observed:b.observed.toString(),modeled:b.modeled.toString(),difference:(b.observed-b.modeled).toString()}));
 for(const row of effects)if(row.difference!=="0")reasons.push(`Unexplained ${row.asset} difference: ${row.difference}`);
 if(observed.length===0)reasons.push("Authoritative balances unavailable");
 return{kind:"offline-exact-economic-reconciliation"as const,consistent:reasons.length===0,reasons,effects,realExecution:false};
}
export interface IntegerPosition {quantityAtoms:string;costLamports:string;realizedPnlLamports:string;}
/** Floor proportional cost for partial disposal; the final disposal absorbs all rounding remainder. */
export function disposePosition(position:IntegerPosition,quantityAtoms:string,netProceedsLamports:string){
 const quantity=uint(position.quantityAtoms),cost=uint(position.costLamports),sold=uint(quantityAtoms),proceeds=uint(netProceedsLamports),realized=sint(position.realizedPnlLamports);
 if(sold===0n||sold>quantity)throw new Error("Disposal must be positive and within held inventory");
 const allocated=sold===quantity?cost:cost*sold/quantity,pnl=proceeds-allocated;
 return{position:{quantityAtoms:(quantity-sold).toString(),costLamports:(cost-allocated).toString(),realizedPnlLamports:(realized+pnl).toString()},disposedAtoms:sold.toString(),allocatedCostLamports:allocated.toString(),netProceedsLamports:proceeds.toString(),realizedPnlLamports:pnl.toString(),remainingDustAtoms:(quantity-sold).toString(),realExecution:false};
}
