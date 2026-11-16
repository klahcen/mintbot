/** Offline pinned SDK comparisons against recorded, unmodified mainnet accounts. No transaction builders invoked. */
import { readFile,writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { PoolMarketAdapter } from "../src/market/pools.js";
import { quoteDlmm } from "../src/market/dlmm-quote.js";
import { publicEvidence, type MarketReader } from "../src/market/types.js";
const sdkRoot=process.env.REFERENCE_SDK_ROOT??"/tmp/mintbot-phase5-reference";
const require=createRequire(`${sdkRoot}/package.json`), BN=require("bn.js");
const ray=require("@raydium-io/raydium-sdk-v2"), meteora=require("@meteora-ag/dlmm");
const rows:any[]=[], pins:any[]=[];
for(const name of ["@raydium-io/raydium-sdk-v2","@meteora-ag/dlmm"]) {
 const pkg=JSON.parse(await readFile(`${sdkRoot}/node_modules/${name}/package.json`,"utf8"));
 const lock=JSON.parse(await readFile(`${sdkRoot}/package-lock.json`,"utf8"));
 pins.push({name,version:pkg.version,integrity:lock.packages[`node_modules/${name}`].integrity,
  entrySha256:createHash("sha256").update(await readFile(require.resolve(name))).digest("hex"),repository:pkg.repository});
}
for(const venue of ["raydium-cpmm","meteora-dlmm"] as const) {
 let fixture:any;
 try{fixture=JSON.parse(await readFile(`docs/phase5/fixtures/${venue}-liquid.json`,"utf8"));}
 catch(e){rows.push({venue,issue:"Positive real-chain fixture unavailable"});continue;}
 const b=fixture.batch;
 const reader:MarketReader={provider:b.provider,accounts:async(keys)=>({...b,retrievedAt:Date.now(),retrievedMono:performance.now(),
  accounts:Object.fromEntries(keys.map(k=>[k,b.accounts[k]??null]))}),largest:async()=>({slot:b.contextSlot,amounts:[]})};
 const adapter=new PoolMarketAdapter(venue),state=await adapter.inspect(fixture.address,reader);
 for(const input of [10000n,1000000n,10000000n,1000000000n]) {
  const buy=adapter.quote(state,"buy",input,100);
  for(const [side,amount] of [["buy",input],["sell",buy.minimumOutput]] as const) {
   const ours=adapter.quote(state,side,amount,100);let expectedOutput:string,expectedFee:string,binsVisited:number|undefined;
   if(venue==="raydium-cpmm") {
    const model=state.signals.quoteModel.value as any,fee=state.signals.feeDistribution.value as any;
    const q=ray.CurveCalculator.swapBaseInput(new BN(amount.toString()),new BN((side==="buy"?state.quoteReserve:state.baseReserve).toString()),
      new BN((side==="buy"?state.baseReserve:state.quoteReserve).toString()),new BN(model.fees[0]),new BN(model.fees[1]),
      new BN(fee.protocolRate),new BN(fee.fundRate),side==="buy"?model.feeOnBuyInput:model.feeOnSellInput);
    expectedOutput=q.outputAmount.toString();expectedFee=q.tradeFee.add(q.creatorFee).toString();
   } else {
    const m=state.signals.dlmmModel.value as any,p=m.parameters,v=m.volatility;
    const swapForY=m.solIsX ? side==="buy" : side==="sell";
    const onInput=p.collect_fee_mode===0||!swapForY;
    const elapsed=BigInt(m.timestamp)-BigInt(v.last_update_timestamp);
    let reference=BigInt(v.volatility_reference),index=v.index_reference;
    // Same explicit chain Clock timestamp as Mintbot, rather than SDK wall-clock expiry of a replay.
    if(elapsed>=BigInt(p.filter_period)){index=m.activeId;reference=elapsed<BigInt(p.decay_period)?BigInt(v.volatility_accumulator)*BigInt(p.reduction_factor)/10000n:0n;}
    let left=new BN(amount.toString()),out=new BN(0),fee=new BN(0);binsVisited=0;
    for(let id=m.activeId;!left.isZero()&&binsVisited<210;id+=swapForY?-1:1,binsVisited++) {
      const cell=m.bins.find((b:any)=>b.id===id);if(!cell)throw Error("SDK route exceeds recorded arrays");
      if(BigInt(swapForY?cell.y:cell.x)===0n)continue;
      const accumulator=reference+BigInt(Math.abs(index-id))*10000n;
      const q=meteora.swapExactInQuoteAtBin({amountX:new BN(cell.x),amountY:new BN(cell.y),price:new BN(cell.price),
        openOrderAmount:new BN(0),processedOrderRemainingAmount:new BN(0),limitOrderAskSide:0},m.binStep,
        {baseFactor:p.base_factor,baseFeePowerFactor:p.base_fee_power_factor,variableFeeControl:p.variable_fee_control,
          maxVolatilityAccumulator:p.max_volatility_accumulator,protocolShare:p.protocol_share},
        {volatilityAccumulator:Number(accumulator>BigInt(p.max_volatility_accumulator)?BigInt(p.max_volatility_accumulator):accumulator)},
        left,swapForY,false,onInput);
      left=left.sub(q.amountIn);out=out.add(q.amountOut);fee=fee.add(q.fee).add(q.protocolFee);
    }
    if(!left.isZero())throw Error("SDK incomplete quote");expectedOutput=out.toString();expectedFee=fee.toString();
   }
   const totalFee=ours.poolFee+(ours.outputFee?.atoms??0n);
   rows.push({venue,address:fixture.address,stateSlot:state.slot,input:amount.toString(),side,
     output:ours.output.toString(),fee:totalFee.toString(),expectedOutput,expectedFee,binsVisited,
     equal:ours.output.toString()===expectedOutput&&totalFee.toString()===expectedFee,
     scope:"SDK pure quote calculation from actual recorded reserves/bins; no RPC simulation, signing, or submission"});
  }
 }
}
await writeFile("docs/phase5/quote-reference.json",JSON.stringify(publicEvidence({pins,rows,scope:"Offline captured-state comparison. Replay clocks reset solely to run pure math; original account bytes/slot preserved. Full transaction simulation is not claimed."}),null,2)+"\n");
console.log(JSON.stringify(rows.map(r=>({venue:r.venue,input:r.input,side:r.side,equal:r.equal,issue:r.issue}))));
if(rows.some(r=>!r.equal)) process.exitCode=1;
