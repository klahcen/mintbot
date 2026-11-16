/** Public research metadata is derived from durable evidence, never inferred from a callback completing. */
export function researchLaunches(rows:any[],reviews:any[],diagnostics:unknown[]=[],now=Date.now()){
 return rows.slice(-100).map(row=>{
  const prefix=`${row.event.program}:${row.event.signature}`,review=reviews.find(r=>r.id===prefix||r.id.startsWith(`${prefix}:`));
  const state=review?.evidence?.state;
  const market=state&&state.commitment==="finalized"&&typeof state.mint==="string"&&Array.isArray(state.accounts)&&Number.isFinite(state.retrievedAt)?(now>=state.retrievedAt&&now-state.retrievedAt<=1500?"verified":"stale"):"unknown";
  const diagnostic=(diagnostics as any[]).find(r=>r.id===prefix||r.id?.startsWith(`${prefix}:`));
  const simulation=(side:string)=>{const result=diagnostic?.evidenceRows?.find((e:any)=>e.plan?.quote?.side===side)?.simulation;return !result?"unknown":result.kind==="unsigned-protocol-simulation"&&result.submitted===false&&result.signatureVerified===false?(result.success?"verified":"failed"):"unknown";};
  return{identity:row.event.signature,protocol:row.event.program,slot:row.event.slot,verification:row.verificationIssue?"failed":row.verifiedLaunches>0?"verified":"unknown",market,
   decision:row.decision?.reasons?.length?"rejected":row.decision?.positionId?"eligible":"unknown",reasons:row.decision?.reasons??(row.verificationIssue?[row.verificationIssue]:[]),buySimulation:simulation("buy"),sellSimulation:simulation("sell")};
 });
}
