/** Final-only accounting: every selected receipt has an evidence-backed outcome, never invented eligibility. */
import { readFile, writeFile } from 'node:fs/promises';
const args=process.argv.slice(2),opt=(k,d)=>args.includes(k)?args[args.indexOf(k)+1]:d;
const root=opt('--root','docs/phase11'),run=`${root}/runtime/${opt('--run-name','mainnet-validated')}`;
const e=JSON.parse(await readFile(`${run}/evidence.json`,'utf8'));
const reconciliation=JSON.parse(await readFile(`${root}/${opt('--reconciliation','runtime-reconciliation.json')}`,'utf8'));
const quarantine=new Map(reconciliation.quarantined.map(q=>[`${q.observation.program}:${q.observation.signature}`,q]));
const bySignature=new Map();
for(const review of e.ledger.marketReviews){
 const launch=review.evidence.launch??review.evidence.state?.launch;
 if(launch?.signature){const key=`${launch.program}:${launch.signature}`,entries=bySignature.get(key)??[];entries.push(review);bySignature.set(key,entries);}
}
const outcomes=e.rows.map(row=>{
 const review=bySignature.get(`${row.event.program}:${row.event.signature}`)??[],q=quarantine.get(`${row.event.program}:${row.event.signature}`);
 let outcome,reason;
 if(q){outcome='quarantined-processing';reason=q.lastFailure??q.decode;}
 else if(row.verificationIssue){
  outcome=/HTTP 429/.test(row.verificationIssue)?'verification-http-429':/HTTP [45]|timed out|RPC error|unavailable|Abort/i.test(row.verificationIssue)?'verification-rpc-or-finality-unavailable':'strict-creation-verification-rejected';reason=row.verificationIssue;
 }else if(row.verifiedLaunches===0){outcome='no-supported-verified-creation';reason='Bounded finalized verification returned no supported creation; not a token-risk determination';}
 else if(review.length){outcome=review.some(r=>r.reasons?.length)?'market-rejected':'market-reviewed-see-ledger';reason=review.flatMap(r=>r.reasons??[]);}
 else{outcome='unresolved-at-bounded-stop';reason='No durable review, finalized rejection or retained quarantine explains completion; do not infer eligibility';}
 return {program:row.event.program,signature:row.event.signature,slot:row.event.slot,originalObservedAt:row.event.observedAt,receiptProvider:row.receiptProvider,receiptCommitment:row.receiptCommitment,verifiedLaunches:row.verifiedLaunches,finalityPolls:row.finalityPolls,outcome,reason,reviewIds:review.map(r=>r.id),normalizedOriginalEvent:row.event};
});
const counts={};for(const row of outcomes)counts[row.outcome]=(counts[row.outcome]??0)+1;
if(Object.values(counts).reduce((a,b)=>a+b,0)!==e.rows.length)throw Error('Candidate population mismatch');
await writeFile(`${root}/${opt('--output-name','candidate-outcomes.json')}`,JSON.stringify({generatedAt:new Date().toISOString(),selectedReceipts:e.rows.length,counts,outcomes,paperEntries:e.ledger.trades.filter(t=>t.side==='buy').length,paperExits:e.ledger.trades.filter(t=>t.side==='sell').length,liveTrading:false,scope:'All selected receipts, not all network launches. Original normalized notification fields and receipt time retained; raw wire-arrival latency/envelope completeness is not claimed. A quarantine, missing proof or absent review never becomes an eligible fill.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({selected:e.rows.length,counts,trades:e.ledger.trades.length}));
