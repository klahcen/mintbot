/** Final-only accounting: every selected receipt has an evidence-backed outcome, never invented eligibility. */
import { readFile, writeFile } from 'node:fs/promises';
const root='docs/phase10',run=`${root}/runtime/mainnet-validated`;
const e=JSON.parse(await readFile(`${run}/evidence.json`,'utf8'));
const reconciliation=JSON.parse(await readFile(`${root}/runtime-reconciliation.json`,'utf8'));
const quarantine=new Map(reconciliation.quarantined.map(q=>[q.id.split(':').at(-1),q]));
const bySignature=new Map();
for(const review of e.ledger.marketReviews){
 const launch=review.evidence.launch??review.evidence.state?.launch;
 if(launch?.signature){const entries=bySignature.get(launch.signature)??[];entries.push(review);bySignature.set(launch.signature,entries);}
}
const outcomes=e.rows.map(row=>{
 const review=bySignature.get(row.event.signature)??[],q=quarantine.get(row.event.signature);
 let outcome,reason;
 if(q){outcome='quarantined-processing';reason=q.lastFailure??q.decode;}
 else if(row.verificationIssue){
  outcome=/HTTP 429/.test(row.verificationIssue)?'verification-http-429':/HTTP [45]|timed out|RPC error|unavailable|Abort/i.test(row.verificationIssue)?'verification-rpc-or-finality-unavailable':'strict-creation-verification-rejected';reason=row.verificationIssue;
 }else if(row.verifiedLaunches===0){outcome='no-supported-verified-creation';reason='Bounded finalized verification returned no supported creation; not a token-risk determination';}
 else if(review.length){outcome=review.some(r=>r.reasons?.length)?'market-rejected':'market-reviewed-see-ledger';reason=review.flatMap(r=>r.reasons??[]);}
 else{outcome='unresolved-at-bounded-stop';reason='No durable review, finalized rejection or retained quarantine explains completion; do not infer eligibility';}
 return {signature:row.event.signature,slot:row.event.slot,originalObservedAt:row.event.observedAt,receiptProvider:row.receiptProvider,receiptCommitment:row.receiptCommitment,verifiedLaunches:row.verifiedLaunches,finalityPolls:row.finalityPolls,outcome,reason,reviewIds:review.map(r=>r.id),normalizedOriginalEvent:row.event};
});
const counts={};for(const row of outcomes)counts[row.outcome]=(counts[row.outcome]??0)+1;
if(Object.values(counts).reduce((a,b)=>a+b,0)!==e.rows.length)throw Error('Candidate population mismatch');
await writeFile(`${root}/candidate-outcomes.json`,JSON.stringify({generatedAt:new Date().toISOString(),selectedReceipts:e.rows.length,counts,outcomes,paperEntries:e.ledger.trades.filter(t=>t.side==='buy').length,paperExits:e.ledger.trades.filter(t=>t.side==='sell').length,liveTrading:false,scope:'All selected receipts, not all network launches. Original normalized notification fields and receipt time retained; raw wire-arrival latency/envelope completeness is not claimed. A quarantine, missing proof or absent review never becomes an eligible fill.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({selected:e.rows.length,counts,trades:e.ledger.trades.length}));
