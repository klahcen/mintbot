/** Read-only, finite RPC diagnostics. No ledger, coverage state, owner, signer or engine imports. */
import { stat } from 'node:fs/promises';
import { loadResearchProviders } from '../src/research/provider-config.js';
import { ProviderConsistency, MAINNET_GENESIS } from '../src/research/providers.js';
import { ReadOnlyProbe, ProbeFailure, probeWebSocket } from '../src/research/validation-probe.js';
import { VERIFIED_PROGRAMS } from '../src/chain.js';

async function main() {
  if (!process.argv.includes('--run') || process.env.MODE !== 'paper' || process.env.REAL_MARKET_PAPER !== 'false')
    throw Error('Diagnostic safety precondition');
  const configs=await loadResearchProviders();
  if(configs.length!==2 || !process.env.RESEARCH_PROVIDERS_PATH)throw Error('Explicit two-provider file required');
  const file=await stat(process.env.RESEARCH_PROVIDERS_PATH);
  const websockets=[process.env.SOLANA_WS_URL,process.env.SOLANA_SECONDARY_WS_URL];
  if(websockets.some(value=>{try{return !value || new URL(value).protocol!=='wss:';}catch{return true;}}))throw Error('Secure WebSocket configuration required');
  const probes=configs.map(p=>new ReadOnlyProbe(p.endpoint,5000,8));
  // At most one diagnostic read per provider per 1.1 seconds; no retry or quota escalation.
  const readers=probes.map(probe=>{
    let tail:Promise<unknown>=Promise.resolve(),lastStart=0;
    return (method:string,args:unknown[])=>{
      const next=tail.catch(()=>undefined).then(async()=>{
        const delay=1100-(performance.now()-lastStart);
        if(delay>0)await new Promise(r=>setTimeout(r,delay));
        lastStart=performance.now();return probe.read(method,args);
      });
      tail=next;return next;
    };
  });
  const ws=websockets.map(endpoint=>probeWebSocket(endpoint,VERIFIED_PROGRAMS,12000));
  const health=await Promise.all(readers.map(async read=>{
    try{return {ok:(await read('getHealth',[]))==='ok'};}
    catch(e){return {ok:false,kind:e instanceof ProbeFailure?e.kind:'transport'};}
  }));
  const history=await Promise.all(readers.map(async read=>{
    try{const slot=await read('getFirstAvailableBlock',[]);return {firstAvailableBlock:Number.isSafeInteger(slot)?slot:undefined,coverageApproved:false};}
    catch{return {unavailable:true,coverageApproved:false};}
  }));
  const identities=await Promise.all(readers.map(async read=>{
    let genesisMatches:boolean|null=null,finalizedSlot:number|undefined;
    try{genesisMatches=(await read('getGenesisHash',[]))===MAINNET_GENESIS;}catch{}
    try{const slot=await read('getSlot',[{commitment:'finalized'}]);if(Number.isSafeInteger(slot))finalizedSlot=slot;}catch{}
    return {genesisMatches,finalizedSlot};
  }));
  const consistency=new ProviderConsistency(configs,(p,m,args)=>readers[configs.findIndex(c=>c.id===p.id)](m,args));
  const assessment=await consistency.inspect({accounts:VERIFIED_PROGRAMS.map(p=>p.address)});
  const sockets=await Promise.all(ws);
  const providerRows=configs.map((p,i)=>({id:i===0?'primary':'secondary',operatorMetadataPresent:!!p.operator,
    health:health[i],identity:identities[i],history:history[i],http:probes[i].observations,websocket:sockets[i],
    rateLimits:probes[i].observations.filter(o=>o.httpStatus===429).length,
    failures:probes[i].observations.filter(o=>!o.ok).length}));
  console.log(JSON.stringify({checkedAt:new Date().toISOString(),mode:'paper',realMarketPaper:false,
    runtime:{uid:process.getuid?.(),gid:process.getgid?.(),fileUid:file.uid,fileGid:file.gid,fileMode:(file.mode&0o777).toString(8),privateFileReadable:true},
    providers:providerRows,consistency:{status:assessment.status,eligible:assessment.eligible,reasons:assessment.reasons,
      independence:assessment.independence,independentlyVerified:false,
      observations:assessment.observations.map((o,i)=>({provider:i===0?'primary':'secondary',genesisMatches:o.genesis===undefined?null:o.genesis===MAINNET_GENESIS,
        finalizedSlot:o.finalizedSlot,state:o.state,error:o.error})),quarantineCount:assessment.quarantined.length,gaps:assessment.gaps.length},
    historicalCoverage:'Not approved; firstAvailableBlock alone cannot establish original gap recovery or transaction retention',
    operatorIndependence:'Not independently verified; configured metadata is not approval',
    executionEligible:false,liveTrading:false,entries:0,exits:0}));
}
main().catch(()=>{console.log(JSON.stringify({status:'failed',error:'Read-only diagnostic unavailable or invalid configuration',executionEligible:false}));process.exitCode=1;});
