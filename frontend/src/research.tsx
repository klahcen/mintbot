import React, { useEffect, useState } from "react";

type EvidenceStatus = "verified"|"unknown"|"stale"|"failed"|"rejected"|"eligible"|"healthy"|"quarantined"|"unavailable"|"passed"|"blocked";
type Snapshot = {
  generatedAt:number; scope:string; runStatus?:"running"|"stopped"|"failed"; notifications:number; verifiedCreations:number;
  launches:{identity:string;protocol:string;slot:number;verification:EvidenceStatus;market:EvidenceStatus;decision:EvidenceStatus;reasons:string[];buySimulation:EvidenceStatus;sellSimulation:EvidenceStatus}[];
  paper?:{positions:number;trades:number;realizedPnlSol:string;unrealizedPnlSol?:string;positionsDetail:{mint:string;protocol:string;quantityAtoms:string;markStatus:EvidenceStatus;markAt?:number;pnlSol?:string}[]};
  providers:{identity:string;status:EvidenceStatus;finalizedSlot?:number;errors:number;rateLimits:number}[];
  wal?:{status:EvidenceStatus;bytes?:number;queueDepth?:number;backlogAgeMs?:number;recoveryGaps?:number;detail?:string};
  intents:{id:string;state:string;updatedAt?:number}[];
  latencies:{name:string;count:number;p50:number;p95:number;p99:number}[];
  readiness:{name:string;status:EvidenceStatus;detail:string}[];
};
type Result={status:string;reason?:string;ageMs?:number;evidence?:Snapshot};
const display=(v:unknown)=>v===undefined ? "Unknown" : String(v);
function Table({headers, rows, empty}:{headers:string[];rows:React.ReactNode[][];empty:string}) {
  return rows.length ? <div className="research-table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div> : <p className="research-empty">{empty}</p>;
}
export function ResearchEvidence({result,now=Date.now()}:{result:Result;now?:number}) {
  const e=result.evidence;
  const required=["Research coverage","Independent provider agreement","Epoch research policy"];
  const blockers = e?.readiness.filter(r => r.name !== "Funded execution" && r.status !== "verified" && r.status !== "passed") ?? [];
  for(const name of required)if(!e?.readiness.some(r=>r.name===name))blockers.push({name,status:"unknown",detail:"Required independent evidence unavailable"});
  const current = result.status === "available" && e?.runStatus === "running" && now >= e.generatedAt && now-e.generatedAt<=30000;
  const transportReady=!!e?.providers.length && e.providers.every(p=>p.status==="healthy"||p.status==="verified");
  const monitoringReady=current && transportReady && blockers.length===0;
  const marketStatus=monitoringReady?"Verified real-market paper monitoring":"Blocked or stale market evidence";
  const freshMark=(r:NonNullable<Snapshot["paper"]>["positionsDetail"][number])=>result.status==="available" && r.markStatus==="verified" && r.markAt!==undefined && now>=r.markAt && now-r.markAt<=1500;
  const eligiblePositions=monitoringReady ? e?.paper?.positionsDetail.filter(freshMark).length??0 : 0;
  const completeMarks=e?.paper && e.paper.positionsDetail.length===e.paper.positions && e.paper.positionsDetail.every(freshMark);
  return <div className="research-evidence">
    <section className="card research-card"><h2>Read-only mainnet research</h2>
      <p>Real market evidence and unsigned RPC simulation are separate from synthetic replay. Funded execution is disabled. This view grants no execution authority.</p>
      <div className="research-labels"><span>Synthetic replay: separate workspace</span><span>{marketStatus}</span><span>Eligible paper positions: {eligiblePositions}</span><span>RPC simulation: unsigned</span><span>Funded execution: disabled</span></div>
      <p role="status">Snapshot: <strong>{result.status}</strong>{result.ageMs!==undefined && ` · ${Math.round(result.ageMs/1000)} seconds old`}{result.reason && ` · ${result.reason}`}</p>
      <p>Target paper strategy: 0.10 SOL per entry · +90% take-profit · −5% stop-loss · maximum 5 positions. Fees and slippage affect net returns.</p>
      {blockers.length > 0 && <p className="research-warning">Execution blockers: {blockers.map(r => `${r.name}: ${r.detail}`).join("; ")}</p>}
      {e && <><p>Monitor: {e.runStatus ?? "unknown"} · Recorded {new Date(e.generatedAt).toISOString()} · {e.scope}</p><p>{e.notifications} notifications · {e.verifiedCreations} verified creation events. Counts describe the recorded research run.</p></>}
      {result.status==="stale" && <p className="research-warning">Historical snapshot. Provider status and quotes are not current authorization or trading evidence.</p>}
    </section>
    {!e ? <section className="card research-card"><p>No validated research snapshot available. Unknown evidence is not an eligible opportunity.</p></section> : <>
      <section className="card research-card"><h2>Observed launches and decisions</h2><Table headers={["Identity / protocol","Slot","Verification / market","Decision / simulation","Rejection reasons"]} rows={e.launches.map(r=>[<><code>{r.identity}</code><br/>{r.protocol}</>,r.slot,<>{r.verification}<br/>{r.market}</>,<>{r.decision}<br/>Buy: {r.buySimulation}<br/>Sell: {r.sellSimulation}</>,r.reasons.length?r.reasons.join("; "):"No rejection recorded; eligibility requires all checks"])} empty="No launch observations recorded. No opportunity is inferred."/></section>
      <section className="card research-card"><h2>Research paper positions and P&amp;L</h2>{e.paper ? <><p>{e.paper.positions} positions · {e.paper.trades} simulated fills · Realized {e.paper.realizedPnlSol} SOL · Unrealized {display(completeMarks?e.paper.unrealizedPnlSol:undefined)} SOL</p><Table headers={["Mint / protocol","Quantity (integer atoms)","Mark evidence","P&L (SOL)"]} rows={e.paper.positionsDetail.map(r=>[<><code>{r.mint}</code><br/>{r.protocol}</>,r.quantityAtoms,freshMark(r)?"verified":r.markStatus==="verified"?"stale":r.markStatus,display(freshMark(r)?r.pnlSol:undefined)])} empty="No research paper positions recorded. Simulation success alone is not a paper fill."/></>:<p>Research paper ledger unavailable. Synthetic balances are not used here.</p>}</section>
      <section className="card research-card"><h2>RPC provider health</h2><Table headers={["Public provider identity","Status","Finalized slot","Errors / rate limits"]} rows={e.providers.map(r=>[r.identity,r.status,display(r.finalizedSlot),`${r.errors} / ${r.rateLimits}`])} empty="Provider identity and agreement unknown."/></section>
      <section className="card research-card"><h2>WAL, queue and backfill</h2>{e.wal?<><p>Status: {e.wal.status} · Bytes: {display(e.wal.bytes)} · Queue: {display(e.wal.queueDepth)} · Backlog age: {display(e.wal.backlogAgeMs)} ms · Recovery gaps: {display(e.wal.recoveryGaps)}</p><p>{e.wal.detail}</p></>:<p>WAL and backfill status unknown.</p>}</section>
      <section className="card research-card"><h2>Execution-intent research records</h2><p>Database intent states are research records and grant no permission to spend.</p><Table headers={["Intent ID","Research state","Recorded update"]} rows={e.intents.map(r=>[<code>{r.id}</code>,r.state,r.updatedAt?new Date(r.updatedAt).toISOString():"Unknown"])} empty="No execution-intent research records in this snapshot."/></section>
      <section className="card research-card"><h2>Measured latency</h2><p>Milliseconds. Local receipt, chain time and RPC response timing remain separate; names identify measured stages.</p><Table headers={["Stage","Count","p50 ms","p95 ms","p99 ms"]} rows={e.latencies.map(r=>[r.name,r.count,r.p50.toFixed(3),r.p95.toFixed(3),r.p99.toFixed(3)])} empty="No measured latency samples. No zero latency is inferred."/></section>
      <section className="card research-card"><h2>Security and deployment readiness</h2><Table headers={["Requirement","Evidence status","Detail"]} rows={e.readiness.map(r=>[r.name,r.status,r.detail])} empty="Production readiness unverified; funded execution disabled."/></section>
    </>}
  </div>;
}
export function ResearchPanel({apiToken}:{apiToken:string}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(timer);},[]);
  const [result,setResult]=useState<Result>({status:"unavailable",reason:"Loading authenticated research snapshot"});
  useEffect(()=>{
    const controller=new AbortController(); let pending=false;
    setResult({status:"unavailable",reason:"Loading authenticated research snapshot"});
    const poll=async()=>{
      if(pending)return;pending=true;
      try {
        const response=await fetch("/api/research/status",{headers:apiToken?{Authorization:`Bearer ${apiToken}`}:{},signal:controller.signal});
        if(!response.ok)throw Error(response.status===401?"API token required":"Research endpoint unavailable");
        const data=await response.json() as Result;
        if(!controller.signal.aborted)setResult(data);
      }catch(error){if(!controller.signal.aborted)setResult({status:"unavailable",reason:error instanceof Error?error.message:"Research endpoint unavailable"});}
      finally{pending=false;}
    };
    void poll();const timer=setInterval(()=>void poll(),3000);
    return()=>{controller.abort();clearInterval(timer);};
  },[apiToken]);
  return <ResearchEvidence result={result} now={now}/>;
}
