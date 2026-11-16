/** Classify retained Phase8 failures and bounded current account rereads; no opportunity or authorizations produced. */
import {readFile,writeFile}from"node:fs/promises";
import{decodePump,PUMP_GLOBAL}from"../src/market/pump.js";import{mint,PUMP,FEES}from"../src/market/accounts.js";import{MarketRpc}from"../src/market/rpc.js";import{publicEvidence}from"../src/market/types.js";
const run=process.argv.includes("--run"),e=JSON.parse(await readFile("docs/phase8/mainnet/evidence.json","utf8")),reader=new MarketRpc(process.env.SOLANA_RPC_URL??"https://api.mainnet-beta.solana.com"),rows:any[]=[];
function explain(batch:any,launch:any){const curve=decodePump(batch,launch.address,"BondingCurve"),m=mint(batch,launch.mints[0]);return{accountLayout:"166-byte reviewed BondingCurve",creatorMatches:curve.creator===launch.creator,creationCreator:launch.creator,currentCurveCreator:curve.creator,mintSupply:m.supply.toString(),curveTotalSupply:String(curve.token_total_supply),supplyWithinCurveTotal:BigInt(curve.token_total_supply)>=m.supply,decimals:m.decimals,complete:curve.complete,mayhem:curve.is_mayhem_mode,cashback:curve.is_cashback_coin,holderRewards:curve.is_holder_reward,quoteMint:curve.quote_mint,depth:curve.depth,editableCreatorFee:curve.can_edit_creator_fee,tokenSignals:m.signals};}
for(const review of e.ledger.marketReviews){const launch=review.evidence.launch??review.evidence.state?.launch;if(!launch)throw Error("Missing original identity");
 const captures=e.captured.filter((c:any)=>c.method==="market.getMultipleAccounts"&&c.result.accounts?.[launch.address]);
 const batches=captures.map((c:any)=>c.result);let analysis:any={status:"not-retrieved",reason:review.reasons.join("; ")};
 if(batches.length){try{analysis={status:"decoded",...explain(batches.at(-1),launch)};}catch(error){analysis={status:"unsupported-layout",reason:(error as Error).message};}}
 const row:any={id:review.id,originalReasons:review.reasons,launch,originalDecisionAt:review.at,retainedAnalysis:analysis,retainedBatches:batches,scope:"Historical diagnosis retains original context; no renewed eligibility or balances"};
 if(run){try{const batch=await reader.accounts([launch.address,launch.mints[0],PUMP_GLOBAL],launch.slot);row.current={batch,analysis:explain(batch,launch),inspectionOnly:true};}catch(error){row.current={issue:(error as Error).message,inspectionOnly:true};}}
 rows.push(row);
}
let deployments:unknown;
if(run){deployments=await Promise.all([PUMP,FEES].map(async program=>{try{return{program,evidence:await reader.deployment(program,0)};}catch(error){return{program,issue:(error as Error).message};}}));}
await writeFile((process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output")+1]! : "docs/phase9/market-diagnostics.json"),JSON.stringify(publicEvidence({generatedAt:new Date().toISOString(),provider:reader.provider,rows,deployments,liveTrading:false,scope:"Eight actual retained verified-creation decisions, exact parsed field comparisons, optional current finalized account evidence. No unsupported variant enabled."}),null,2)+"\n");console.log(JSON.stringify(rows.map(r=>({id:r.id,analysis:r.retainedAnalysis,current:r.current?.issue}))));
