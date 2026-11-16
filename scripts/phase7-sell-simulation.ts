/** Actual read-only sell diagnostics; public holder addresses only. Never signs, funds, or broadcasts. */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, unpackAccount } from "@solana/spl-token";
import { MarketRpc } from "../src/market/rpc.js";
import { VerifiedReadRpc } from "../src/verified-rpc.js";
import { account, SOL, ZERO } from "../src/market/accounts.js";
import { publicEvidence, type MarketBatch } from "../src/market/types.js";
import { prepareConstruction, type SimulationSubject } from "../src/simulation/prepare.js";
import { constructSwap, ata } from "../src/simulation/builders.js";
import { validateUnsigned } from "../src/simulation/policy.js";
import { SimulationRpc, type SimulationPreparation } from "../src/simulation/rpc.js";
import { simulationAccounting } from "../src/simulation/accounting.js";
import { Telemetry } from "../src/telemetry.js";
const args = process.argv.slice(2), option=(name:string,fallback:string)=>args.includes(name)?args[args.indexOf(name)+1]!:fallback;
if(!args.includes("--run"))throw Error("Explicit --run required for read-only public-holder diagnostic");
const output=option("--output",`docs/phase7/sells-${Date.now()}.json`);
try{await access(output);throw Error("Existing capture preserved; choose a new output");}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
await mkdir("docs/phase7",{recursive:true});
const venues=option("--venues","pump,pumpswap,raydium-cpmm,meteora-dlmm").split(",");
if(venues.length>4||new Set(venues).size!==venues.length||venues.some(v=>!["pump","pumpswap","raydium-cpmm","meteora-dlmm"].includes(v)))throw Error("Venue bound");
const endpoint=process.env.SOLANA_RPC_URL??"https://api.mainnet-beta.solana.com",metrics=new Telemetry(),captured:unknown[]=[],rows:any[]=[],start=performance.now(),cpu=process.cpuUsage(),memory=process.memoryUsage(),delay=monitorEventLoopDelay({resolution:20});delay.enable();
class Capture extends MarketRpc {
 override async accounts(keys:string[],slot:number):Promise<MarketBatch>{const batch=await super.accounts(keys,slot);captured.push({method:"getMultipleAccounts",keys,batch});return batch;}
}
const market=new Capture(endpoint,metrics,5000),rpc=new SimulationRpc(endpoint,metrics,5000),verifier=new VerifiedReadRpc(endpoint);
// This single extra read method discovers public inventory. It cannot send arbitrary RPC methods.
async function discovery(method:"getTokenLargestAccounts"|"getSignaturesForAddress"|"getTransaction"|"getProgramAccounts",params:unknown[]){return metrics.rpc(`sell.${method}`,async()=>{
 const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(5000)});
 if(!response.ok){await response.body?.cancel();throw Error(`Public inventory ${method} HTTP ${response.status}`);}
 const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.length;if(bytes>4*1024*1024){await reader.cancel();throw Error("Inventory response byte bound");}chunks.push(item.value);}}finally{reader.releaseLock();}
 const body=JSON.parse(Buffer.concat(chunks).toString());if(body.error)throw Error(`Public inventory ${method} RPC ${Number.isInteger(body.error.code)?body.error.code:"invalid"}`);if(body.id!==1)throw Error("Inventory response identity");
 captured.push({method,params,observedAt:Date.now(),result:body.result});return body.result;
 });}
async function inventoryKeys(mint:string,program:string,subject:SimulationSubject,prior:any){
 const keys=new Set<string>(),issues:string[]=[];let slot=0;
 try{const r=await discovery("getTokenLargestAccounts",[mint,{commitment:"finalized"}]);
  if(!Number.isSafeInteger(r?.context?.slot)||!Array.isArray(r.value)||r.value.length>20||r.value.some((v:any)=>typeof v.address!=="string"||!/^\d+$/.test(v.amount)))throw Error("Invalid largest inventory response");
  slot=r.context.slot;for(const v of r.value)if(BigInt(v.amount)>0n)keys.add(v.address);
 }catch(error){issues.push((error as Error).message);}
 // Recorded public inventory is discovery only; it is always reread and validated before use.
 for(const c of prior.captured??[])for(const [address,info]of Object.entries(c.batch?.accounts??{})as [string,any][]){try{
  if(info?.owner!==program)continue;const a=unpackAccount(new PublicKey(address),{data:Buffer.from(info.data[0],"base64"),owner:new PublicKey(program),lamports:info.lamports,executable:false,rentEpoch:0},new PublicKey(program));
  if(a.mint.toBase58()===mint&&a.amount>0n&&PublicKey.isOnCurve(a.owner.toBytes()))keys.add(address);
 }catch{}}
 if(!keys.size){try{
  const signatures=await discovery("getSignaturesForAddress",[subject.address,{commitment:"finalized",limit:4}]);
  if(!Array.isArray(signatures)||signatures.length>4)throw Error("Signature discovery bound");
  for(const signature of signatures){if(signature.err)continue;try{
   const tx=await discovery("getTransaction",[signature.signature,{commitment:"finalized",encoding:"json",maxSupportedTransactionVersion:0}]);
   if(!tx||tx.meta?.err||!Array.isArray(tx.meta?.postTokenBalances))continue;
   for(const balance of tx.meta.postTokenBalances){if(balance.mint!==mint||!balance.owner||!/^\d+$/.test(balance.uiTokenAmount?.amount??"")||BigInt(balance.uiTokenAmount.amount)===0n)continue;
    if(PublicKey.isOnCurve(new PublicKey(balance.owner).toBytes()))keys.add(ata(mint,balance.owner,program));}
   if(keys.size)break;
  }catch(error){issues.push((error as Error).message);}}
 }catch(error){issues.push((error as Error).message);}}
 if(!keys.size&&mint!=="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"){try{
  const result=await discovery("getProgramAccounts",[program,{commitment:"finalized",encoding:"base64",withContext:true,dataSlice:{offset:0,length:72},filters:[{memcmp:{offset:0,bytes:mint}}]}]);
  if(!Number.isSafeInteger(result?.context?.slot)||!Array.isArray(result.value)||result.value.length>20000)throw Error("Public inventory enumeration bound");
  slot=result.context.slot;
  for(const row of result.value){const bytes=Buffer.from(row.account?.data?.[0]??"","base64");if(bytes.length!==72)continue;
   if(bytes.readBigUInt64LE(64)>0n&&PublicKey.isOnCurve(bytes.subarray(32,64))&&keys.size<20)keys.add(row.pubkey);}
 }catch(error){issues.push((error as Error).message);}}
 if(keys.size>20)throw Error("Public inventory discovery exceeds twenty accounts");
 return{keys:[...keys],slot,issues};
}
for(const venue of venues){const begun=performance.now();const attempts:any[]=[];
 try{
  const file=venue==="meteora-dlmm"?"mainnet-dlmm-current-pool.json":"mainnet-verified.json",prior=JSON.parse(await readFile(`docs/phase6/${file}`,"utf8")),old=prior.rows.find((r:any)=>r.venue===venue&&r.result?.simulation?.success);
  if(!old)throw Error("Reviewed successful buy fixture unavailable");
  let subject:SimulationSubject={venue:venue as SimulationSubject["venue"],address:old.subject.address};
  if(venue==="pump"){
   const c=old.subject.creation,launches=await verifier.verify("pump",c.signature,c.slot),creation=launches?.find(l=>l.address===subject.address);
   if(!creation)throw Error("Original Pump creation could not be reverified");
   subject={...subject,creation:{...creation,freshness:{...c.freshness,origin:"history"}}};
  }
  const mint=old.evidence.state.mint,program=old.result.intent.data.plan.quote.side==="buy"?old.result.intent.data.plan.outputProgram:old.result.intent.data.plan.inputProgram;
  const holders=await inventoryKeys(mint,program,subject,prior),keys=holders.keys;
  captured.push({method:"inventory-discovery-summary",venue,...holders});
  if(!keys.length)throw Error("No positive public token inventory");
  const holderBank=await market.accounts(keys,holders.slot),inventory:any[]=[];
  for(const address of keys){try{const a=unpackAccount(new PublicKey(address),account(holderBank,address,program),new PublicKey(program));const user=a.owner.toBase58();
   if(PublicKey.isOnCurve(a.owner.toBytes())&&ata(mint,user,program)===address&&!a.isFrozen&&!a.delegate&&!a.closeAuthority&&a.amount>0n)inventory.push({user,address,atoms:a.amount.toString()});
  }catch{}}
  const users=[...new Set(inventory.map(v=>v.user))] as string[];
  if(!users.length)throw Error("Largest inventory has no supported on-curve canonical owned ATA");
  const payerBank=await market.accounts(users,holderBank.contextSlot);
  const eligible=inventory.filter(v=>{const p=payerBank.accounts[v.user];return p?.owner===ZERO&&!p.executable&&Number.isSafeInteger(p.lamports)&&p.lamports!>=(venue==="pump"?15000:2200000);}).slice(0,2);
  if(!eligible.length)throw Error("Public holders lack native fee/rent balance (no funding performed)");
  for(const candidate of eligible){const diagnostic:any={candidate,submitted:false};try{
   // Bounded actual inventory, at most the recorded one-million-lamport buy's base output.
   const target=BigInt(old.evidence.quote.output),available=BigInt(candidate.atoms)/2n,input=available<target?available:target;
   if(input<=0n)throw Error("Insufficient positive sell amount");
   let prepared:SimulationPreparation|undefined;
   const evidence=await metrics.measureAsync("sell.market_preparation_ms",()=>prepareConstruction(subject,market,candidate.user,input,"sell",100,async slot=>{prepared=await rpc.prepare(slot);}));
   diagnostic.evidence=evidence;diagnostic.prepared=prepared;diagnostic.beforeBuildAt=Date.now();
   rpc.validatePreparation(prepared!);
   const authorization={strategyVersion:"phase7-readonly-sell-v1",user:candidate.user,destinationOwner:candidate.user,minimumOutput:evidence.quote.minimumOutput,maximumInput:input,maximumRent:10000000n,maximumNetworkFee:10000n,maximumPriorityFee:5000n,computeUnits:1000000,microLamports:1000n,expiresAt:Date.now()+1500};
   const buildStart=performance.now(),plan=await constructSwap(evidence,authorization,prepared!.block,async n=>BigInt(prepared!.rents[n]));metrics.observe("sell.build_ms",performance.now()-buildStart);metrics.observe("sell.serialization_ms",plan.serializationMs);
   diagnostic.plan=plan;
   const policy=validateUnsigned(plan),simulation=await rpc.simulate(plan),accounting=simulationAccounting(plan,simulation);
   attempts.push({candidate,evidence,plan,policy,simulation,accounting,signerAuthorization:false,submitted:false,realExecution:false});
   if(simulation.success)break;
  }catch(error){attempts.push({...diagnostic,issue:(error as Error).message});}}
  rows.push({venue,subject,mint,inventory,attempts,elapsedMs:performance.now()-begun});
 }catch(error){rows.push({venue,issue:(error as Error).message,attempts,elapsedMs:performance.now()-begun});}
 console.log(venue,rows.at(-1)?.attempts.some((a:any)=>a.simulation?.success)?"actual-sell-simulation-success":rows.at(-1)?.issue??JSON.stringify(rows.at(-1)?.attempts.map((a:any)=>a.issue??a.simulation?.error)));
}
delay.disable();
await writeFile(output,JSON.stringify(publicEvidence({generatedAt:new Date().toISOString(),provider:market.provider,rows,captured,telemetry:metrics.report(),elapsedMs:performance.now()-start,cpuMicroseconds:process.cpuUsage(cpu),memoryBefore:memory,memoryAfter:process.memoryUsage(),eventLoopDelayMs:{p50:delay.percentile(50)/1e6,p95:delay.percentile(95)/1e6,p99:delay.percentile(99)/1e6,max:delay.max/1e6},liveTrading:false,scope:"Bounded actual finalized mainnet sell simulations using public holder inventory and zero signatures. Public address impersonation is not signer authorization. No invented balances, signing, broadcasts, funding or paper entry. Each venue at most two public holders; discovery is not complete concentration evidence."}),null,2)+"\n",{flag:"wx"});
