/** Finalized current observations. Historical pool addresses are diagnostic subjects, never launch receipts. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { PublicKey } from '@solana/web3.js';
import { MarketRpc } from '../src/market/rpc.js';
import { PoolMarketAdapter } from '../src/market/pools.js';
import { PUMP_GLOBAL } from '../src/market/pump.js';
import { PUMP } from '../src/market/accounts.js';
import { BorshReader } from '../src/borsh-reader.js';
import { boundedProviderRead, MAINNET_GENESIS } from '../src/research/providers.js';
import { Telemetry } from '../src/telemetry.js';
import { publicEvidence, type MarketBatch } from '../src/market/types.js';
const args=process.argv.slice(2),opt=(k:string,d:string)=>args.includes(k)?args[args.indexOf(k)+1]!:d;
if(!args.includes('--run'))throw Error('Explicit --run required');
const output=opt('--output','docs/phase11/current-network');await mkdir(output);
const endpoint=process.env.SOLANA_RPC_URL??'https://api.mainnet-beta.solana.com',metrics=new Telemetry(),captured:unknown[]=[],rows:any[]=[],sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const genesis=await boundedProviderRead({id:'primary',endpoint},'getGenesisHash',[]);if(genesis!==MAINNET_GENESIS)throw Error('Unexpected chain genesis');
class Capture extends MarketRpc{override async accounts(keys:string[],slot:number):Promise<MarketBatch>{const batch=await super.accounts(keys,slot);captured.push({keys,batch});return batch;}}
const rpc=new Capture(endpoint,metrics,10000),pins=JSON.parse(await readFile('src/market/deployment-pins.json','utf8'));
const addresses=Object.entries(pins).flatMap(([program,pin]:[string,any])=>[program,pin.dataAddress]);
let deployments:any;
try{
 const response=await boundedProviderRead({id:'primary',endpoint},'getMultipleAccounts',[addresses,{commitment:'finalized',encoding:'base64',dataSlice:{offset:0,length:45}}]);
 const observations=Object.entries(pins).map(([program,pin]:[string,any],i)=>{
  const p=response.value[i*2],d=response.value[i*2+1],pb=Buffer.from(p?.data?.[0]??'','base64'),db=Buffer.from(d?.data?.[0]??'','base64');
  const valid=p?.executable===true&&d?.executable===false&&p.owner==='BPFLoaderUpgradeab1e11111111111111111111111'&&d.owner===p.owner&&pb.length===36&&db.length===45&&pb.readUInt32LE(0)===2&&db.readUInt32LE(0)===3&&new PublicKey(pb.subarray(4)).toBase58()===pin.dataAddress;
  return{program,programData:pin.dataAddress,loaderIdentityValid:valid,observedSlot:valid?db.readBigUInt64LE(4).toString():null,reviewedSlot:pin.deploymentSlot,reviewedPinMatches:valid&&db.readBigUInt64LE(4)===BigInt(pin.deploymentSlot)};
 });deployments={response,observations};
}catch(error){deployments={issue:(error as Error).message};}
let global:any;
try{
 const batch=await rpc.accounts([PUMP_GLOBAL],0),a=batch.accounts[PUMP_GLOBAL];if(!a||a.owner!==PUMP)throw Error('Global owner unavailable');
 const bytes=Buffer.from(a.data[0],'base64'),idlPath=opt('--pump-idl','docs/phase11/pump-deployment/idl-pump.json'),idlBytes=await readFile(idlPath),idl=JSON.parse(idlBytes.toString());
 const type=idl.types.find((t:any)=>t.name==='Global').type,account=idl.accounts.find((a:any)=>a.name==='Global');
 if(!bytes.subarray(0,8).equals(Buffer.from(account.discriminator)))throw Error('Global discriminator mismatch');
 const reader=new BorshReader(bytes.subarray(8),idl.types),fields=reader.read(type);let exactLayout=true,layoutIssue:string|undefined;
 try{reader.finish();}catch(error){exactLayout=false;layoutIssue=(error as Error).message;}
 global={address:PUMP_GLOBAL,batch,bytes:bytes.length,sha256:sha(bytes),officialIdlSha256:sha(idlBytes),fields,exactLayout,layoutIssue,executionAuthorized:false,scope:'Diagnostic official schema decode only. Unknown allocation tail is retained; neither named fields nor length establish deployed financial semantics.'};
}catch(error){global={issue:(error as Error).message,executionAuthorized:false};}
for(const venue of ['pumpswap','raydium-cpmm','meteora-dlmm'] as const){
 const start=performance.now();let inspected:unknown;try{
  let address:string;
  if(venue==='pumpswap'){const b=JSON.parse(await readFile('docs/phase4/fixtures/pumpswap-market.json','utf8'));address=b.address??b.launch?.address??b.subject?.address;if(!address){const fixture=JSON.parse(await readFile('docs/phase3/fixtures/pumpswap-accounts.json','utf8'));const tx=JSON.parse(await readFile('docs/phase3/fixtures/pumpswap-creation.json','utf8'));const {decodeVerifiedTransaction}=await import('../src/verified-decoders.js');address=decodeVerifiedTransaction(venue,tx.result,fixture)[0]!.address;}}
  else address=JSON.parse(await readFile(`docs/phase5/fixtures/${venue}-liquid.json`,'utf8')).address;
  const adapter=new PoolMarketAdapter(venue),state=await adapter.inspect(address,rpc);inspected=state;const buy=adapter.quote(state,'buy',1000000n,100),sell=adapter.quote(state,'sell',buy.minimumOutput,100);
  rows.push({venue,address,elapsedMs:performance.now()-start,state,buy,sell,purpose:'current-state inspection of historical address; never a fresh creation or paper entry'});
 }catch(error){rows.push({venue,state:inspected,stage:inspected?'quote':'state',elapsedMs:performance.now()-start,issue:(error as Error).message,purpose:'read-only inspection failure, not a failed swap simulation'});}
}
await writeFile(`${output}/evidence.json`,JSON.stringify(publicEvidence({generatedAt:new Date().toISOString(),genesis,provider:new URL(endpoint).host,deployments,global,rows,captured,telemetry:metrics.report(),liveTrading:false}),null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({deployments:deployments.observations,global:{bytes:global.bytes,exactLayout:global.exactLayout,issue:global.issue??global.layoutIssue},venues:rows.map(({venue,issue,elapsedMs})=>({venue,issue,elapsedMs}))}));
