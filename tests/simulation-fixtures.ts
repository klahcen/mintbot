/** Explicit unit execution-account stubs around recorded market bytes. Never used as mainnet evidence. */
import {performance}from"node:perf_hooks";
import {PublicKey}from"@solana/web3.js";
import {TOKEN_PROGRAM_ID}from"@solana/spl-token";
import {recorded,json}from"./market-fixtures.js";
import {PumpMarketAdapter}from"../src/market/pump.js";
import {PoolMarketAdapter}from"../src/market/pools.js";
import {simulationAccountKeys,ata,constructSwap}from"../src/simulation/builders.js";
import {SOL,ZERO,FEES}from"../src/market/accounts.js";
import {VERIFIED_PROGRAMS}from"../src/chain.js";
import pins from"../src/market/deployment-pins.json"with{type:"json"};
import type{MarketBatch,MarketState,MarketSubject,MarketReader}from"../src/market/types.js";
import type{ConstructionEvidence,ResearchAuthorization,BlockContext}from"../src/simulation/types.js";
export const USER="7KtbPfNU3XHAfW3fNvxeAjGbbAxs7w9sEbXJXs2oVnSX";
export function tokenAccount(mint:string,owner:string,amount=1000000000000000000n){const b=Buffer.alloc(165);new PublicKey(mint).toBuffer().copy(b);new PublicKey(owner).toBuffer().copy(b,32);b.writeBigUInt64LE(amount,64);b[108]=1;if(mint===SOL){b.writeUInt32LE(1,109);b.writeBigUInt64LE(2039280n,113);}return{owner:TOKEN_PROGRAM_ID.toBase58(),executable:false,lamports:100000000000,data:[b.toString("base64"),"base64"]as[string,"base64"]};}
export async function constructionCase(venue:"pump"|"pumpswap"|"raydium-cpmm"|"meteora-dlmm"="raydium-cpmm",side:"buy"|"sell"="buy"){
 let state:MarketState<MarketSubject>,batch:MarketBatch,adapter:any;
 if(venue==="pump"){
  const report=await json("docs/phase5/mainnet/evidence.json"),row=report.ledger.marketReviews.find((r:any)=>r.evidence.state);
  state=structuredClone(row.evidence.state);
  batch=structuredClone(report.captured.filter((r:any)=>r.method==="market.getMultipleAccounts").map((r:any)=>r.result).find((b:any)=>state.accounts.every(a=>a.address in b.accounts)));
  adapter=new PumpMarketAdapter();
  // Public evidence contains decimal strings, restored to integer arithmetic without changing recorded bytes.
  for(const field of["supply","baseReserve","quoteReserve","liquidityLamports","protocolFeeBps","creatorFeeBps"]as const)(state as any)[field]=BigInt((state as any)[field]);
 }else if(venue==="pumpswap"){
  const r=await recorded(venue);state=await r.adapter.read(r.launch,r.rpc);batch={...r.fixture,provider:r.rpc.provider,retrievedAt:Date.now(),retrievedMono:performance.now()};adapter=r.adapter;
 }else{
  const f=await json(`docs/phase5/fixtures/${venue}-liquid.json`);batch=structuredClone(f.batch);batch.retrievedAt=Date.now();batch.retrievedMono=performance.now();
  const reader:MarketReader={provider:batch.provider,accounts:async()=>batch,largest:async()=>({slot:batch.contextSlot,amounts:[]})};adapter=new PoolMarketAdapter(venue);state=await adapter.inspect(f.address,reader);
 }
 state.retrievedAt=batch.retrievedAt=Date.now();state.retrievedMono=batch.retrievedMono=performance.now();
 const keys=simulationAccountKeys(state,batch,USER),program=VERIFIED_PROGRAMS.find(p=>p.name===venue)!.address;
 for(const k of keys)if(!(k in batch.accounts))batch.accounts[k]={owner:ZERO,executable:false,lamports:100000000000,data:["","base64"]};
 if(venue==="pump"||venue==="pumpswap"){
  const {pda}=await import("../src/market/accounts.js");
  for(const key of [pda(program,"global_volume_accumulator"),pda(program,"user_volume_accumulator",new PublicKey(USER).toBuffer())])
   batch.accounts[key]={owner:program,executable:false,lamports:100000000,data:[Buffer.alloc(128).toString("base64"),"base64"]};
 }
 const mintProgram=batch.accounts[state.mint]!.owner,base=ata(state.mint,USER,mintProgram),wrapped=ata(SOL,USER,TOKEN_PROGRAM_ID.toBase58());
 batch.accounts[base]=side==="sell"?{...tokenAccount(state.mint,USER),owner:mintProgram}:null;
 batch.accounts[USER]={owner:ZERO,executable:false,lamports:100000000000,data:["","base64"]};
 if(venue!=="pump")batch.accounts[wrapped]=venue==="pumpswap"?tokenAccount(SOL,USER):null;
 if(venue==="pumpswap"){
  // Discover exact on-chain fee recipient/creator PDA ATA mappings by decoding the pinned account layout.
  const {struct}=await import("../src/market/accounts.js"),{poolSpec,SWAP}=await import("../src/market/pools.js"),schema=(await import("../src/market/pumpswap-layouts.json",{with:{type:"json"}})).default;
  const spec=poolSpec(venue,batch,state.launch.address),g=struct(batch,spec.extras[0],SWAP,schema,"GlobalConfig"),pool=struct(batch,state.launch.address,SWAP,schema,"Pool",300);
  const {pda}=await import("../src/market/accounts.js");const creator=pda(SWAP,"creator_vault",new PublicKey(pool.coin_creator).toBuffer());
  for(const wallet of[g.protocol_fee_recipients[0],g.buyback_fee_recipients[0],creator])batch.accounts[ata(SOL,wallet,TOKEN_PROGRAM_ID.toBase58())]=tokenAccount(SOL,wallet);
 }
 if(venue==="raydium-cpmm"||venue==="meteora-dlmm")for(const k of keys)if(k!==USER&&k!==base&&k!==wrapped&&batch.accounts[k]?.data[0]==="")batch.accounts[k]={owner:program,executable:false,lamports:1000000,data:[Buffer.alloc(128).toString("base64"),"base64"]};
 const buy=adapter.quote(state,"buy",venue==="pump"?10000n:1000000n,100),quote=side==="buy"?buy:adapter.quote(state,"sell",buy.minimumOutput,100);
 const deployments=[program,...(venue==="pump"||venue==="pumpswap"?[FEES]:[])].map(program=>({status:"verified"as const,value:{program,programData:(pins as any)[program].dataAddress,deploymentSlot:(pins as any)[program].deploymentSlot},reason:"UNIT deployment stub",slot:batch.contextSlot,provider:batch.provider,commitment:"finalized"as const,observedAt:Date.now()}));
 const evidence:ConstructionEvidence={state,quote,batch,deployments};
 const authorization:ResearchAuthorization={strategyVersion:"UNIT-v1",user:USER,destinationOwner:USER,minimumOutput:quote.minimumOutput,maximumInput:quote.input,maximumRent:10000000n,maximumNetworkFee:10000n,maximumPriorityFee:1000n,computeUnits:500000,microLamports:1000n,expiresAt:Date.now()+1000};
 const block:BlockContext={blockhash:new PublicKey(Buffer.alloc(32,2)).toBase58(),slot:state.slot,lastValidBlockHeight:1000000,observedAt:Date.now()};
 return{evidence,authorization,block,plan:()=>constructSwap(evidence,authorization,block,async()=>2039280n)};
}
