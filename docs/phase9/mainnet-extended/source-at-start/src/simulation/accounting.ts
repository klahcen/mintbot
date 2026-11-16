import {VersionedTransaction} from "@solana/web3.js";
import type {SwapPlan,SimulationResult} from "./types.js";
function amount(rows:unknown[]|null,address:string,mint:string,decimals:number,keys:string[]){
 if(!rows)return undefined;
 const row=rows.find((v:any)=>Number.isInteger(v?.accountIndex)&&keys[v.accountIndex]===address&&(v as any).mint===mint)as any;
 if(!row||row.uiTokenAmount?.decimals!==decimals||!/^\d+$/.test(row.uiTokenAmount?.amount??""))return undefined;
 return BigInt(row.uiTokenAmount.amount);
}
/** Provider-returned pre/post effects only. Missing effects remain unknown, not refreshed baseline estimates. */
export function simulationAccounting(plan:SwapPlan,r:SimulationResult){
 const reasons:string[]=[];
 if(!r.success)reasons.push("Protocol simulation failed");
 if(r.messageDigest!==plan.messageDigest||r.contextSlot<plan.state.slot||r.contextSlot-plan.state.slot>8)reasons.push("Simulation identity or bank disagreement");
 const keys=VersionedTransaction.deserialize(Buffer.from(plan.unsignedBase64,"base64")).message.staticAccountKeys.map(k=>k.toBase58());
 const baseAta=plan.quote.side==="buy"?plan.destination:plan.source;
 const pre=amount(r.preTokenBalances,baseAta,plan.state.mint,plan.state.decimals,keys),post=amount(r.postTokenBalances,baseAta,plan.state.mint,plan.state.decimals,keys);
 // An absent pre row is zero only for an explicitly created output ATA and complete provider balance arrays.
 const created=plan.accountCreations.some(c=>c.address===baseAta),before=pre??(created&&r.preTokenBalances!==null?0n:undefined);
 let tokenDelta:bigint|undefined;
 if(before!==undefined&&post!==undefined)tokenDelta=post-before;
 const wrappedAddress=plan.inputMint===plan.state.mint?plan.destination:plan.source;
 const wrappedCreated=plan.accountCreations.some(c=>c.address===wrappedAddress);
 let wrappedDelta:bigint|undefined;
 if(plan.venue!=="pump"&&!wrappedCreated){
  const wpre=amount(r.preTokenBalances,wrappedAddress,plan.quote.side==="buy"?plan.inputMint:plan.outputMint,9,keys),wpost=amount(r.postTokenBalances,wrappedAddress,plan.quote.side==="buy"?plan.inputMint:plan.outputMint,9,keys);
  if(wpre===undefined||wpost===undefined)reasons.push("Authoritative wrapped-SOL effects unavailable");
  else{wrappedDelta=wpost-wpre;if(plan.quote.side==="buy"?-wrappedDelta!==plan.input:wrappedDelta<plan.minimumOutput)reasons.push("Wrapped-SOL effects violate input/minimum output");}
 }
 let nativeDelta:bigint|undefined;
 const payer=keys.indexOf(plan.user),nativePre=r.preBalances?.[payer],nativePost=r.postBalances?.[payer];
 if(Number.isSafeInteger(nativePre)&&Number.isSafeInteger(nativePost)&&(nativePre as number)>=0&&(nativePost as number)>=0)nativeDelta=BigInt(nativePost as number)-BigInt(nativePre as number);
 if(tokenDelta===undefined)reasons.push("Authoritative pre/post token effects unavailable");
 else if(plan.quote.side==="buy"?tokenDelta<plan.minimumOutput:-tokenDelta!==plan.input)reasons.push("Simulated token effects disagree with quote/spending limits");
 if(nativeDelta===undefined)reasons.push("Authoritative payer balance effects unavailable");
 const persistentRent=plan.accountCreations.filter(c=>c.mint!=="So11111111111111111111111111111111111111112").reduce((n,c)=>n+BigInt(c.rent),0n);
 const priority=(BigInt(plan.authorization.computeUnits)*plan.authorization.microLamports+999999n)/1000000n;
 if(r.fee===null)reasons.push("Actual simulated fee unavailable");
 else if(BigInt(r.fee)>plan.authorization.maximumNetworkFee+priority)reasons.push("Simulated fee exceeds authorization");
 if(plan.quote.side==="sell"&&(plan.venue==="pump"||wrappedCreated)&&nativeDelta!==undefined&&r.fee!==null&&nativeDelta+BigInt(r.fee)<plan.minimumOutput)reasons.push("Native sell proceeds violate minimum output");
 if(nativeDelta!==undefined&&-nativeDelta>(plan.quote.side==="buy"&&(plan.venue==="pump"||wrappedCreated)?plan.input:0n)+plan.authorization.maximumRent+plan.authorization.maximumNetworkFee+priority)reasons.push("Simulated native spend exceeds authorization");
 let nativeDifference:bigint|undefined;
 if(plan.quote.side==="buy"&&nativeDelta!==undefined&&r.fee!==null){const debit=plan.venue==="pump"||wrappedCreated?plan.input:0n;nativeDifference=nativeDelta+debit+BigInt(r.fee)+persistentRent;if(nativeDifference<0n||nativeDifference>1n)reasons.push("Unmodeled native spend/refund differs from input, fee and persistent rent");}
 let sellOutput:bigint|undefined;
 if(plan.quote.side==="sell"&&nativeDelta!==undefined&&r.fee!==null){
  if(plan.venue==="pump"||wrappedCreated){
   sellOutput=nativeDelta+BigInt(r.fee)+persistentRent;
   nativeDifference=sellOutput-plan.quote.output;
   if(nativeDifference!==0n)reasons.push("Native sell effects differ from quote, fee and persistent rent");
  }else{
   sellOutput=wrappedDelta;
   nativeDifference=nativeDelta+BigInt(r.fee)+persistentRent;
   if(nativeDifference!==0n)reasons.push("Unmodeled native spend/refund for existing wrapped-SOL sell");
  }
 }
 if(r.unitsConsumed===null||r.unitsConsumed>plan.authorization.computeUnits)reasons.push("Measured compute use unavailable or exceeds budget");
 return{kind:"simulated-balance-assessment"as const,consistent:reasons.length===0,reasons,quoteOutput:plan.quote.output.toString(),minimumOutput:plan.minimumOutput.toString(),tokenDelta:tokenDelta?.toString(),nativeDelta:nativeDelta?.toString(),persistentRentLamports:persistentRent.toString(),nativeDifferenceLamports:nativeDifference?.toString(),wrappedDelta:wrappedDelta?.toString(),simulatedOutputAtoms:(plan.quote.side==="buy"?tokenDelta:sellOutput)?.toString(),quoteDifferenceAtoms:plan.quote.side==="buy"&&tokenDelta!==undefined?(tokenDelta-plan.quote.output).toString():sellOutput!==undefined?(sellOutput-plan.quote.output).toString():undefined,simulatedFee:r.fee,measuredComputeUnits:r.unitsConsumed,realExecution:false};
}
export function compareProviders(plan:SwapPlan,results:SimulationResult[]){
 if(results.length<2)return{status:"unknown",reason:"Independent simulation provider unavailable"};
 const fingerprints=results.map(r=>JSON.stringify({success:r.success,error:r.error,accounting:simulationAccounting(plan,r)}));
 return new Set(results.map(r=>r.provider)).size>=2&&new Set(fingerprints).size===1?{status:"verified",reason:"Independent providers agree on returned outcome/effects"}:{status:"failed",reason:"Conflicting or nonindependent simulation provider evidence"};
}
