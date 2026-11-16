/** Bounded actual RPC simulation. Public payer addresses only; no private keys, signing, airdrops or submissions. */
import{readFile,writeFile,access}from"node:fs/promises";import{Telemetry}from"../src/telemetry.js";import{MarketRpc}from"../src/market/rpc.js";import{VerifiedReadRpc}from"../src/verified-rpc.js";
import{SimulationRpc}from"../src/simulation/rpc.js";import{prepareConstruction,type SimulationSubject}from"../src/simulation/prepare.js";import{SimulationService}from"../src/simulation/service.js";import{IntentLedger}from"../src/simulation/intent-ledger.js";import{SOL}from"../src/market/accounts.js";import{publicEvidence,type MarketBatch}from"../src/market/types.js";import{localPostgres}from"./local-postgres.js";
if(!process.argv.includes("--run"))throw Error("Explicit --run required for bounded read-only mainnet simulation");
const output=process.argv.includes("--output")?process.argv[process.argv.indexOf("--output")+1]!: `docs/phase6/mainnet-simulation-${Date.now()}.json`;
try{await access(output);throw Error("Capture exists; choose a new output path");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
const endpoint=process.env.SOLANA_RPC_URL??"https://api.mainnet-beta.solana.com",metrics=new Telemetry(),rows:any[]=[],captured:any[]=[],pg=await localPostgres(),ledger=new IntentLedger(pg.pool,metrics);
const rpc=new SimulationRpc(endpoint,metrics,5000),verifier=new VerifiedReadRpc(endpoint);
class Capture extends MarketRpc{override async accounts(keys:string[],slot:number){const b=await super.accounts(keys,slot);captured.push({keys,batch:b});return b;}}
const market=new Capture(endpoint,metrics,5000);let stopped=false;const service=new SimulationService(rpc,ledger,()=>stopped,metrics);
try{
 await ledger.migrate();
 const requested=process.argv.includes("--venues")?process.argv[process.argv.indexOf("--venues")+1]!.split(","):["pump","pumpswap","raydium-cpmm","meteora-dlmm"];
 if(requested.some(v=>!["pump","pumpswap","raydium-cpmm","meteora-dlmm"].includes(v))||requested.length>4||new Set(requested).size!==requested.length)throw Error("Venue bound");
 for(const venue of requested as ("pump"|"pumpswap"|"raydium-cpmm"|"meteora-dlmm")[]){
  const begin=Date.now();
  try{
   let subject:SimulationSubject,user:string;
   if(venue==="pump"){
    const previous=JSON.parse(await readFile("docs/phase5/mainnet/evidence.json","utf8"));
    const historical=previous.ledger.marketReviews.find((r:any)=>r.evidence.state).evidence.state.launch;
    const launches=await verifier.verify("pump",historical.signature,historical.slot);if(!launches?.length)throw Error("Historical strict Pump creation unavailable");
    subject={venue,address:launches[0].address,creation:{...launches[0],freshness:{origin:"history",receiptAt:historical.freshness.receiptAt,eventSlot:launches[0].slot,chainHeadSlot:null,eventTimeMs:launches[0].blockTimeMs}}};user=launches[0].creator!;
   }else if(venue==="pumpswap"){
    const f=JSON.parse(await readFile("docs/phase3/fixtures/pumpswap-creation.json","utf8")),accounts=JSON.parse(await readFile("docs/phase3/fixtures/pumpswap-accounts.json","utf8"));
    const {decodeVerifiedTransaction}=await import("../src/verified-decoders.js");const launch=decodeVerifiedTransaction(venue,f.result,accounts)[0];subject={venue,address:launch.address};user=f.result.transaction.message.accountKeys[0].pubkey;
   }else{
    const f=JSON.parse(await readFile(`docs/phase5/fixtures/${venue}-liquid.json`,"utf8"));subject={venue,address:venue==="meteora-dlmm"&&process.env.SIMULATION_DLMM_POOL?process.env.SIMULATION_DLMM_POOL:f.address};
    // Public historic creation creator, not an authorized funded signer. sigVerify:false is explicitly recorded.
    const creation=JSON.parse(await readFile("docs/phase3/fixtures/pump-creation.json","utf8")),acc=JSON.parse(await readFile("docs/phase3/fixtures/pump-accounts.json","utf8"));
    const {decodeVerifiedTransaction}=await import("../src/verified-decoders.js");user=decodeVerifiedTransaction("pump",creation.result,acc)[0].creator!;
   }
   if(process.env.SIMULATION_PUBLIC_PAYER)user=process.env.SIMULATION_PUBLIC_PAYER;
   let prepared:Awaited<ReturnType<SimulationRpc["prepare"]>>|undefined;
   const input=venue==="pump"?10000n:1000000n,evidence=await prepareConstruction(subject,market,user,input,"buy",100,async slot=>{prepared=await rpc.prepare(slot);});
   const authorization={strategyVersion:"phase6-readonly-diagnostic-v1",user,destinationOwner:user,minimumOutput:evidence.quote.minimumOutput,maximumInput:input,
    maximumRent:10000000n,maximumNetworkFee:10000n,maximumPriorityFee:5000n,computeUnits:1000000,microLamports:1000n,expiresAt:Date.now()+1500};
   await ledger.budget(`wallet:${user}`,SOL,BigInt(evidence.batch.accounts[user]?.lamports??0));
   await ledger.budget(`${user}:${authorization.strategyVersion}`,SOL,BigInt(evidence.batch.accounts[user]?.lamports??0));
   const result=await service.review({opportunity:evidence.state.launch.id,strategy:authorization.strategyVersion,side:"buy",generation:"diagnostic-v1",wallet:user},evidence,authorization,undefined,prepared);
   if("intent"in result&&result.intent?.status==="SIMULATED"&&result.intent.owner){
    await ledger.transition(result.intent.id,result.intent.owner,result.intent.fence,"SIMULATED","CANCELLED",{
     ...result.intent.data,reason:"Bounded diagnostic completed; no paper entry, signing or submission authorized"});
   }
   rows.push({venue,user,subject,result,evidence,elapsedMs:Date.now()-begin,signerAuthorization:false,paperEntryAttempted:false});
  }catch(e){rows.push({venue,issue:(e as Error).message,elapsedMs:Date.now()-begin,paperEntryAttempted:false});}
  console.log(venue,rows.at(-1)?.issue??(rows.at(-1)?.result?.simulation?.success?"simulation-success":"simulation-failed"));
 }
 stopped=true;await service.close();
 const intents=(await pg.pool.query("SELECT * FROM simulation_intent ORDER BY created_at")).rows,audit=(await pg.pool.query("SELECT * FROM simulation_intent_audit ORDER BY sequence")).rows,budgets=(await pg.pool.query("SELECT * FROM simulation_budget ORDER BY scope,asset")).rows;
 await pg.restart();const restored=(await pg.pool.query("SELECT id,status FROM simulation_intent ORDER BY created_at")).rows;
 await writeFile(output,JSON.stringify(publicEvidence({generatedAt:new Date().toISOString(),provider:market.provider,rows,captured,intents,audit,budgets,restart:{rows:restored,preserved:restored.length===intents.length},telemetry:metrics.report(),liveTrading:false,
  scope:"Four bounded current finalized market/account attempts and actual unsigned simulateTransaction calls where construction succeeded. Public-address impersonation with sigVerify:false is not signer authorization, funding, submission, eligibility or a fill. Historical creations retain historical identity and cannot enter fast paper strategies."}),null,2)+"\n",{flag:"wx"});
}finally{stopped=true;await service.close();await pg.close();}
