/** Bounded read-only discovery scan; filtered GPA, 4 MiB response cap, at most six recently updated inspected roots. */
import {writeFile} from "node:fs/promises";
import {MarketRpc} from "../src/market/rpc.js";
import {PoolMarketAdapter} from "../src/market/pools.js";
import {publicEvidence,type MarketBatch} from "../src/market/types.js";
const endpoint=process.env.SOLANA_RPC_URL??"https://api.mainnet-beta.solana.com", program="LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const rows:any[]=[];
try {
const response=await fetch(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getProgramAccounts",params:[program,{commitment:"finalized",encoding:"base64",dataSlice:{offset:0,length:904},filters:[{dataSize:904},{memcmp:{offset:35,bytes:"2"}},{memcmp:{offset:120,bytes:"So11111111111111111111111111111111111111112"}}]}]}),signal:AbortSignal.timeout(10000)});
const reader=response.body!.getReader();const chunks:Uint8Array[]=[];let size=0;
for(;;){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>4*1024*1024){await reader.cancel();throw Error("Discovery response bound");}chunks.push(p.value);}
const body=JSON.parse(Buffer.concat(chunks).toString());if(body.error||!Array.isArray(body.result))throw Error(`Discovery RPC unavailable: ${response.status}`);
const addresses=body.result.sort((a:any,b:any)=>Number(Buffer.from(b.account.data[0],"base64").readBigInt64LE(56)-Buffer.from(a.account.data[0],"base64").readBigInt64LE(56))).map((r:any)=>r.pubkey);
rows.push({method:"getProgramAccounts",provider:new URL(endpoint).host,filters:{dataSize:904,tokenYMIntOffset:120},count:addresses.length,bytes:size});
// Inspect at most six roots ranked by the pinned volatility last-update field.
for(let i=0;i<Math.min(6,addresses.length);i++) {
 const address=addresses[i],batches:MarketBatch[]=[];
 class Capture extends MarketRpc {override async accounts(keys:string[],slot:number){const b=await super.accounts(keys,slot);batches.push(b);return b;}}
 const rpc=new Capture(endpoint),adapter=new PoolMarketAdapter("meteora-dlmm");
 try {const state=await adapter.inspect(address,rpc), buy=adapter.quote(state,"buy",1000000n,100),sell=adapter.quote(state,"sell",buy.minimumOutput,100);
 const fixture={venue:"meteora-dlmm",address,discoverySource:"docs/phase6/dlmm-discovery.json",state,buy,sell,batch:batches.at(-1),creationProof:false};
 rows.push(fixture);await writeFile("docs/phase6/fixtures/meteora-dlmm-liquid.json",JSON.stringify(publicEvidence(fixture),null,2)+"\n");break;
 }catch(e){rows.push({address,issue:(e as Error).message,batches});}
 await new Promise(r=>setTimeout(r,1000));
}
}catch(e){rows.push({issue:(e as Error).message});}
await writeFile("docs/phase6/dlmm-discovery.json",JSON.stringify(publicEvidence({capturedAt:new Date().toISOString(),scope:"Filtered finalized account discovery only, not a creation proof",rows}),null,2)+"\n");
console.log(rows.map(r=>({address:r.address,issue:r.issue,buy:r.buy?.output.toString(),count:r.count})));
