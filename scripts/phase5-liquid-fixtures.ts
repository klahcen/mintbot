/** Account-only fixtures: no invented creation signature and no paper eligibility. */
import { writeFile } from "node:fs/promises";
import { MarketRpc } from "../src/market/rpc.js";
import { PoolMarketAdapter } from "../src/market/pools.js";
import { publicEvidence, type MarketBatch } from "../src/market/types.js";
import { Telemetry } from "../src/telemetry.js";
const metrics = new Telemetry();
const rows: unknown[] = [];
const endpoint = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const candidates: ["raydium-cpmm"|"meteora-dlmm",string,string][] = [
  ["raydium-cpmm","7JuwJuNU88gurFnyWeiyGKbFmExMWcmRZntn9imEzdny","https://github.com/raydium-io/raydium-sdk-V2-demo/blob/master/src/cpmm/swap.ts"],
  ["meteora-dlmm","EDonP8DgRNR2xX59587WzD83cS2x4YYUjPdKvLa9hqQL","docs/phase5/dlmm-active-mining-scan.json"],
];
for (const [venue,address,discoverySource] of candidates) {
  if (rows.some((r:any)=>r.venue===venue && r.state)) continue;
  const batches:MarketBatch[]=[];
  class Capture extends MarketRpc {
    override async accounts(keys:string[],slot:number) { const b=await super.accounts(keys,slot);batches.push(b);return b; }
  }
  const rpc = new Capture(endpoint,metrics), adapter=new PoolMarketAdapter(venue);
  try {
    const state=await adapter.inspect(address,rpc);
    const buy=adapter.quote(state,"buy",1000000n,100),sell=adapter.quote(state,"sell",buy.minimumOutput,100);
    rows.push({venue,address,discoverySource,state,buy,sell,batches,creationProof:false});
    await writeFile(`docs/phase5/fixtures/${venue}-liquid.json`,JSON.stringify(publicEvidence({venue,address,discoverySource,state,buy,sell,batch:batches.at(-1),creationProof:false}),null,2)+"\n");
    console.log(venue,address,"positive",buy.output.toString(),sell.output.toString());
  } catch(e) { rows.push({venue,address,discoverySource,issue:(e as Error).message,batches,creationProof:false});console.log(venue,address,(e as Error).message); }
}
await writeFile("docs/phase5/liquid-fixture-refresh.json",JSON.stringify(publicEvidence({capturedAt:new Date().toISOString(),rows,telemetry:metrics.report(),liveTrading:false}),null,2)+"\n");
