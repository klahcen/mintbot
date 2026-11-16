import { inspectSignedWire } from "../src/research/signed-wire-inspection.js";
/** Bounded current-chain diagnostics only. No paper engine, ledger, signer, approval or broadcaster imported. */
import { readFile, mkdir, open } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { ReadOnlyProbe, probeWebSocket, compareAccountBanks } from '../src/research/validation-probe.js';
import { VERIFIED_PROGRAMS } from '../src/chain.js';
import { MAINNET_GENESIS } from '../src/research/providers.js';
import { MarketRpc } from '../src/market/rpc.js';
import { PoolMarketAdapter } from '../src/market/pools.js';
import { PumpMarketAdapter } from '../src/market/pump.js';
import { publicEvidence, type MarketReader, type MarketState } from '../src/market/types.js';
import { decodeVerifiedTransaction } from '../src/verified-decoders.js';
import { FEES } from '../src/market/accounts.js';
if(!process.argv.includes('--run'))throw Error('Explicit --run required');
const index=process.argv.indexOf('--output');if(index<0||!process.argv[index+1])throw Error('New --output directory required');
const output=process.argv[index+1]!;await mkdir(output,{recursive:false});
const env={...parseEnv(await readFile('.env','utf8')),...process.env};
if((env.MODE??'paper')!=='paper')throw Error('MODE must remain paper');
const emit=async(name:string,value:unknown)=>{const file=await open(`${output}/${name}`,'wx',0o600);try{await file.writeFile(JSON.stringify(publicEvidence(value),null,2)+'\n');await file.sync();}finally{await file.close();}};
const safeError=(error:unknown)=>{const message=error instanceof Error?error.message:'Diagnostic unavailable';return message.includes('://')?'Diagnostic unavailable':message.slice(0,250);};
const providers=[{id:'primary',http:env.SOLANA_RPC_URL,ws:env.SOLANA_WS_URL},{id:'secondary',http:env.SOLANA_SECONDARY_RPC_URL,ws:env.SOLANA_SECONDARY_WS_URL}];
await emit('configuration.json',{checkedAt:Date.now(),mode:'paper',providers:providers.map(p=>({id:p.id,httpConfigured:!!p.http,websocketConfigured:!!p.ws})),providerAttributionConfigured:!!env.RESEARCH_PROVIDERS_PATH,authentication:'unknown; accepted reads do not prove service credentials or entitlement',operatorIndependence:'unknown',executionEligible:false});
const accounts=VERIFIED_PROGRAMS.map(p=>p.address);
const rows=await Promise.all(providers.map(async provider=>{
 const row:any={id:provider.id,authentication:'unverified',operatorIndependence:'unknown',executionEligible:false};
 if(!provider.http){row.status='missing';return row;}
 const rpc=new ReadOnlyProbe(provider.http);
 const capture=async(label:string,method:string,params:unknown[])=>{try{row[label]=await rpc.read(method,params);return row[label];}catch(e){row[`${label}Issue`]=safeError(e);return undefined;}};
 row.websocketPromise=probeWebSocket(provider.ws,VERIFIED_PROGRAMS);
 await Promise.all([capture('genesis','getGenesisHash',[]),capture('finalizedSlot','getSlot',[{commitment:'finalized'}]),capture('nodeVersion','getVersion',[])]);
 if(row.genesis===MAINNET_GENESIS&&Number.isSafeInteger(row.finalizedSlot)){
  await capture('accounts','getMultipleAccounts',[accounts,{commitment:'finalized',encoding:'base64',minContextSlot:row.finalizedSlot}]);
  await capture('firstAvailableBlock','getFirstAvailableBlock',[]);
  row.history=[];
  for(const program of VERIFIED_PROGRAMS){
   try{const result=await rpc.read('getSignaturesForAddress',[program.address,{commitment:'finalized',limit:2}]);
    row.history.push({venue:program.name,result,scope:'Two provider-reported finalized signatures; not a launch proof or a completeness interval'});
   }catch(e){row.history.push({venue:program.name,issue:safeError(e)});}
  }
  const retained=JSON.parse(await readFile('docs/phase12/raydium-current-creation-fixture.json','utf8'));
  const recent=row.history.flatMap((h:any)=>(h.result??[]).filter((r:any)=>r.err===null)).slice(0,1);
  const subjects=[...recent.map((r:any)=>({signature:r.signature,slot:r.slot,origin:'bounded-current-history'})),{signature:retained.originalObservation.signature,slot:retained.originalObservation.slot,origin:'retained-historical-control'}];
  row.transactions=[];
  for(const subject of subjects){const tx:any={...subject,executionEligible:false};
   for(const encoding of ['json','base64'])try{tx[encoding]=await rpc.read('getTransaction',[subject.signature,{commitment:'finalized',encoding,maxSupportedTransactionVersion:1}]);}catch(e){tx[`${encoding}Issue`]=safeError(e);}
   tx.signedWireInspection=inspectSignedWire(tx.base64,tx.json,subject.signature);
   row.transactions.push(tx);
  }
  // Current finalized account inspection of retained subjects, never fresh creation evidence.
  row.venues=[];
  const market=new MarketRpc(provider.http,undefined,4000);let marketCalls=0;
  const budget=()=>{if(++marketCalls>32)throw Error('Diagnostic account-read budget exhausted');};
  const reader:MarketReader={provider:market.provider,accounts:async(keys,slot)=>{budget();return market.accounts(keys,slot);},largest:async(mint,slot)=>{budget();return market.largest(mint,slot);},holders:async(mint,program,slot)=>{budget();return market.holders(mint,program,slot);}};
  for(const program of [...VERIFIED_PROGRAMS,{name:'fee-program',address:FEES}]){
   const venue:any={venue:program.name,executionEligible:false};
   try{venue.deployment=await market.deployment(program.address,row.finalizedSlot);}catch(e){venue.deploymentIssue=safeError(e);}
   if(program.name!=='fee-program')try{
    let state:MarketState<any>,adapter:any;
    if(program.name==='pump'){
     const tx=JSON.parse(await readFile('docs/phase3/fixtures/pump-creation.json','utf8'));
     const evidence=JSON.parse(await readFile('docs/phase3/fixtures/pump-accounts.json','utf8'));
     const launch=decodeVerifiedTransaction('pump',tx.result,evidence)[0];
     // Historical identity retained as history; this reader never enters MarketService.
     state=await (adapter=new PumpMarketAdapter()).read({...launch,creationCommitment:'finalized'},reader);
    }else{
     let address:string;
     if(program.name==='pumpswap'){
      const tx=JSON.parse(await readFile('docs/phase3/fixtures/pumpswap-creation.json','utf8'));
      const evidence=JSON.parse(await readFile('docs/phase3/fixtures/pumpswap-accounts.json','utf8'));
      address=decodeVerifiedTransaction('pumpswap',tx.result,evidence)[0].address;
     }else address=JSON.parse(await readFile(`docs/phase5/fixtures/${program.name}-liquid.json`,'utf8')).address;
     state=await (adapter=new PoolMarketAdapter(program.name as any)).inspect(address,reader);
    }
    venue.state=state;const buy=adapter.quote(state,'buy',100000000n,100);venue.buy=buy;
    venue.sell=adapter.quote(state,'sell',buy.minimumOutput,100);
    venue.scope='Current finalized account estimate on retained subject; not current launch, unsigned transaction simulation or trading eligibility';
   }catch(e){venue.marketIssue=safeError(e);}
   row.venues.push(venue);
  }
  row.marketHealth=market.health.snapshot();row.marketAccountCalls=marketCalls;
 }
 row.websocket=await row.websocketPromise;delete row.websocketPromise;
 row.observations=rpc.observations;
 // Never expose endpoint hosts, paths, queries, authentication configuration or remote error text.
 const serialized=JSON.stringify(publicEvidence(row)).replaceAll(new URL(provider.http).host,provider.id);
 return JSON.parse(serialized);
}));
await emit('provider-validation.json',{generatedAt:Date.now(),providers:rows,accountAgreement:compareAccountBanks(rows.map(r=>({id:r.id,result:r.accounts}))),
 entries:0,exits:0,liveTrading:false,executionEligible:false,scope:'Read-only bounded diagnostics. No independence, authenticated quotas, archive completeness, epoch approval or fresh creation eligibility inferred.'});
console.log(JSON.stringify({providers:rows.map(r=>({id:r.id,genesisMatches:r.genesis===MAINNET_GENESIS,readFailures:r.observations?.filter((o:any)=>!o.ok).length,websocket:r.websocket?.status})),executionEligible:false}));
