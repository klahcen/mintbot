import pins from "../market/deployment-pins.json" with {type:"json"};
import {createHash} from "node:crypto";
import {performance} from "node:perf_hooks";
import {PublicKey,TransactionInstruction,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,SystemProgram} from "@solana/web3.js";
import {getAssociatedTokenAddressSync,createAssociatedTokenAccountIdempotentInstruction,createSyncNativeInstruction,createCloseAccountInstruction,TOKEN_PROGRAM_ID,TOKEN_2022_PROGRAM_ID,ExtensionType,getAccountLen} from "@solana/spl-token";
import layouts from "./instruction-layouts.json" with {type:"json"};
import swapSchema from "../market/pumpswap-layouts.json" with {type:"json"};
import dlmmSchema from "../market/meteora-layouts.json" with {type:"json"};
import {account,mint,vault,pda,struct,provenance,validateBatch,SOL,ZERO,PUMP,FEES} from "../market/accounts.js";
import {decodePump,PumpMarketAdapter,PUMP_GLOBAL,PUMP_FEES} from "../market/pump.js";
import {PoolMarketAdapter,poolSpec,SWAP,RAY,DLMM} from "../market/pools.js";
import {validateQuote} from "../market/risk.js";
import {PROTOCOL_REVISIONS} from "../verified-decoders.js";
import type {MarketBatch,MarketReader,MarketState,MarketSubject} from "../market/types.js";
import type {SwapPlan,ResearchAuthorization,BlockContext,ConstructionEvidence} from "./types.js";
const pk=(s:string)=>new PublicKey(s);
export const ata=(mint:string,user:string,program:string)=>getAssociatedTokenAddressSync(pk(mint),pk(user),true,pk(program)).toBase58();
export const sha=(b:Buffer|string)=>createHash("sha256").update(b).digest("hex");
const plans=new WeakSet<object>();
export function assertPlan(plan:SwapPlan){if(!plans.has(plan))throw Error("Untrusted or deserialized swap plan");}
function freeze(v:any){if(v&&typeof v==="object"){for(const x of Object.values(v))freeze(x);Object.freeze(v);}return v;}
function u64(n:bigint){if(n<=0n||n>(1n<<64n)-1n)throw Error("Positive u64 amount required");const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;}
function rayKey(b:MarketBatch,a:string,index:number){return new PublicKey(account(b,a,RAY).data.subarray(8+index*32,40+index*32)).toBase58();}
function validateRecipient(b:MarketBatch,address:string,buyback:boolean){
 const info=b.accounts[address];if(!info||info.executable)throw Error("Fee-recipient account unavailable");
 if(info.owner===ZERO)return;
 const data=account(b,address,FEES).data;
 if(!buyback||data.length!==208||!data.subarray(0,8).equals(Buffer.from([153,166,71,144,179,189,137,251]))||
  new PublicKey(data.subarray(8,40)).equals(PublicKey.default)||data.subarray(80).some(v=>v!==0))
  throw Error("Unsupported fee-recipient owner or buyback-vault layout");
}
/** Recompute account parsing/quote from the supplied bank; persisted or caller-asserted models cannot authorize construction. */
export async function constructSwap(e:ConstructionEvidence,authorization:ResearchAuthorization,block:BlockContext,
  rentForBytes:(bytes:number)=>Promise<bigint>):Promise<SwapPlan>{
 const {state:s,quote:q,batch:b}=e;
 const programId=({pump:PUMP,pumpswap:SWAP,"raydium-cpmm":RAY,"meteora-dlmm":DLMM}as Record<string,string>)[s.venue];
 for(const program of [programId,...(["pump","pumpswap"].includes(s.venue)?[FEES]:[])]){
  const d=e.deployments.find(d=>(d.value as any)?.program===program),pin=(pins as any)[program];
  if(!d||d.status!=="verified"||d.commitment!=="finalized"||d.provider!==s.provider||!pin||
   (d.value as any).deploymentSlot!==pin.deploymentSlot||(d.value as any).programData!==pin.dataAddress||
   !Number.isSafeInteger(d.slot)||d.slot!<("purpose"in s.launch?0:s.launch.slot)||d.observedAt===undefined||Date.now()<d.observedAt||Date.now()-d.observedAt>5000)
    throw Error("Unsupported deployment or expired program evidence");
 }
 validateBatch(b,s.provider,s.slot);validateQuote(s,q);
 if(b.contextSlot!==s.slot||s.launch.layoutRevision!==PROTOCOL_REVISIONS[s.venue])throw Error("Bank or protocol revision changed");
 const observed=new Map(provenance(b).map(a=>[a.address,a]));
 if(s.accounts.some(a=>observed.get(a.address)?.sha256!==a.sha256))throw Error("Changed required account state");
 const a=structuredClone(authorization);
 if(a.user!==a.destinationOwner||!a.strategyVersion||a.strategyVersion.length>128||!PublicKey.isOnCurve(pk(a.user).toBytes())||
   !Number.isSafeInteger(a.computeUnits)||a.computeUnits<1||a.computeUnits>1400000||a.microLamports<0n||a.microLamports>(1n<<64n)-1n||
   a.minimumOutput<=0n||a.maximumInput<=0n||a.maximumRent<0n||a.maximumPriorityFee<0n||a.maximumNetworkFee<0n||a.expiresAt<=Date.now())throw Error("Invalid research authorization");
 if(q.input>a.maximumInput||q.minimumOutput<a.minimumOutput||q.minimumOutput>q.output)throw Error("Input or minimum output limits");
 if(!Number.isSafeInteger(block.slot)||block.slot<("purpose"in s.launch?0:s.launch.slot)||!Number.isSafeInteger(block.lastValidBlockHeight)||block.lastValidBlockHeight<=0||Date.now()<block.observedAt||Date.now()-block.observedAt>5000)throw Error("Stale blockhash context");
 pk(block.blockhash);
 const reader:MarketReader={provider:b.provider,accounts:async()=>b,largest:async()=>({slot:b.contextSlot,amounts:[]})};
 const adapter=s.venue==="pump"?new PumpMarketAdapter():new PoolMarketAdapter(s.venue as "pumpswap"|"raydium-cpmm"|"meteora-dlmm");
 const checked="purpose"in s.launch?await (adapter as PoolMarketAdapter).inspect(s.launch.address,reader):await adapter.read(s.launch,reader);
 for(const k of ["mint","decimals","baseReserve","quoteReserve","liquidityLamports"]as const)if(checked[k]!==s[k])throw Error("Changed reserves or decimals");
 if(mint(b,s.mint).signals.transferRestrictions.status!=="verified")throw Error("Unsupported transfer extensions");
 const recomputed=adapter.quote(checked as MarketState,q.side,q.input,0);
 if(q.output!==recomputed.output||q.minimumOutput>recomputed.output)throw Error("Quote does not match current bank");
 const base=mint(b,s.mint),baseAta=ata(s.mint,a.user,base.program),solAta=ata(SOL,a.user,TOKEN_PROGRAM_ID.toBase58());
 const buy=q.side==="buy",inputMint=buy?SOL:s.mint,outputMint=buy?s.mint:SOL;
 const inputProgram=buy?TOKEN_PROGRAM_ID.toBase58():base.program,outputProgram=buy?base.program:TOKEN_PROGRAM_ID.toBase58();
 const userBase=b.accounts[baseAta];if(!(baseAta in b.accounts))throw Error("Missing user account evidence");
 if(userBase){const balance=vault(b,baseAta,s.mint,a.user,base.program);if(!buy&&balance<q.input)throw Error("Insufficient token balance");}
 else if(!buy)throw Error("Missing sell token account");
 const roles:Record<string,string>={};let program:string,instruction:string,remaining:SwapPlan["remaining"]=[];
 if(s.venue==="pump"){
  program=PUMP;instruction=buy?"buy_exact_sol_in":"sell";
  const curve=decodePump(b,s.launch.address,"BondingCurve"),global=decodePump(b,PUMP_GLOBAL,"Global");
  if(curve.creator===ZERO||curve.complete||curve.is_mayhem_mode||curve.is_cashback_coin||curve.is_holder_reward)throw Error("Unsupported Pump swap variant");
  const fee=global.fee_recipient,back=global.buyback_fee_recipients?.[0];
  if(!back||back===ZERO||fee===ZERO)throw Error("Missing on-chain fee recipients");
  Object.assign(roles,{global:PUMP_GLOBAL,fee_recipient:fee,mint:s.mint,bonding_curve:s.launch.address,
   associated_bonding_curve:ata(s.mint,s.launch.address,base.program),associated_user:baseAta,user:a.user,
   system_program:ZERO,token_program:base.program,creator_vault:pda(PUMP,"creator-vault",pk(curve.creator).toBuffer()),
   event_authority:pda(PUMP,"__event_authority"),program:PUMP,global_volume_accumulator:pda(PUMP,"global_volume_accumulator"),
   user_volume_accumulator:pda(PUMP,"user_volume_accumulator",pk(a.user).toBuffer()),fee_config:PUMP_FEES,fee_program:FEES});
  account(b,roles.global_volume_accumulator,PUMP);
  if(buy) account(b,roles.user_volume_accumulator,PUMP);
  if(!b.accounts[roles.creator_vault]||b.accounts[roles.creator_vault]!.owner!==ZERO)throw Error("Missing native creator-vault evidence");
  validateRecipient(b,fee,false);validateRecipient(b,back,true);
  remaining=[{address:pda(PUMP,"bonding-curve-v2",pk(s.mint).toBuffer()),writable:false},{address:back,writable:true}];
 }else{
  if(!(solAta in b.accounts))throw Error("Missing wrapped-SOL account evidence");
  if(b.accounts[solAta] && buy && vault(b,solAta,SOL,a.user,TOKEN_PROGRAM_ID.toBase58())<q.input)throw Error("Insufficient wrapped-SOL balance");
  if(b.accounts[solAta] && !buy) vault(b,solAta,SOL,a.user,TOKEN_PROGRAM_ID.toBase58());
  const spec=poolSpec(s.venue,b,s.launch.address);
  if(s.venue==="pumpswap"){
   program=SWAP;instruction=buy?"buy_exact_quote_in":"sell";
   const pool=struct(b,s.launch.address,SWAP,swapSchema,"Pool",300),g=struct(b,spec.extras[0],SWAP,swapSchema,"GlobalConfig");
   if(pool.coin_creator===ZERO)throw Error("Creatorless PumpSwap variant unsupported");
   const fee=g.protocol_fee_recipients[0],back=g.buyback_fee_recipients?.[0];
   if(!fee||fee===ZERO||!back||back===ZERO)throw Error("Missing protocol fee recipients");
   validateRecipient(b,fee,false);validateRecipient(b,back,true);
   const creator=pda(SWAP,"creator_vault",pk(pool.coin_creator).toBuffer());
   Object.assign(roles,{pool:s.launch.address,user:a.user,global_config:spec.extras[0],base_mint:s.mint,quote_mint:SOL,
    user_base_token_account:baseAta,user_quote_token_account:solAta,pool_base_token_account:spec.baseVault,pool_quote_token_account:spec.quoteVault,
    protocol_fee_recipient:fee,protocol_fee_recipient_token_account:ata(SOL,fee,TOKEN_PROGRAM_ID.toBase58()),base_token_program:base.program,
    quote_token_program:TOKEN_PROGRAM_ID.toBase58(),system_program:ZERO,associated_token_program:"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    event_authority:pda(SWAP,"__event_authority"),program:SWAP,coin_creator_vault_authority:creator,coin_creator_vault_ata:ata(SOL,creator,TOKEN_PROGRAM_ID.toBase58()),
    global_volume_accumulator:pda(SWAP,"global_volume_accumulator"),user_volume_accumulator:pda(SWAP,"user_volume_accumulator",pk(a.user).toBuffer()),fee_config:spec.extras[1],fee_program:FEES});
   account(b,roles.global_volume_accumulator,SWAP);
   if(buy)account(b,roles.user_volume_accumulator,SWAP);
   vault(b,roles.protocol_fee_recipient_token_account,SOL,fee,TOKEN_PROGRAM_ID.toBase58());
   vault(b,roles.coin_creator_vault_ata,SOL,creator,TOKEN_PROGRAM_ID.toBase58());
   vault(b,ata(SOL,back,TOKEN_PROGRAM_ID.toBase58()),SOL,back,TOKEN_PROGRAM_ID.toBase58());
   remaining=[{address:pda(SWAP,"pool-v2",pk(s.mint).toBuffer()),writable:false},{address:back,writable:false},{address:ata(SOL,back,TOKEN_PROGRAM_ID.toBase58()),writable:true}];
  }else if(s.venue==="raydium-cpmm"){
   program=RAY;instruction="swap_base_input";
   const obs=rayKey(b,s.launch.address,9);if(obs!==pda(RAY,"observation",pk(s.launch.address).toBuffer()))throw Error("Raydium observation PDA mismatch");account(b,obs,RAY);
   Object.assign(roles,{payer:a.user,authority:spec.authority,amm_config:spec.extras[0],pool_state:s.launch.address,
    input_token_account:buy?solAta:baseAta,output_token_account:buy?baseAta:solAta,input_vault:buy?spec.quoteVault:spec.baseVault,
    output_vault:buy?spec.baseVault:spec.quoteVault,input_token_program:inputProgram,output_token_program:outputProgram,
    input_token_mint:inputMint,output_token_mint:outputMint,observation_state:obs});
  }else if(s.venue==="meteora-dlmm"){
   program=DLMM;instruction="swap2";const pool=struct(b,s.launch.address,DLMM,dlmmSchema,"LbPair");
   if(Math.abs(Math.floor(pool.active_id/70))>=511)throw Error("Extended bitmap routes unsupported");
   if(pool.oracle!==pda(DLMM,"oracle",pk(s.launch.address).toBuffer()))throw Error("DLMM oracle PDA mismatch");
   account(b,pool.oracle,DLMM);
   Object.assign(roles,{lb_pair:s.launch.address,bin_array_bitmap_extension:DLMM,reserve_x:pool.reserve_x,reserve_y:pool.reserve_y,
    user_token_in:buy?solAta:baseAta,user_token_out:buy?baseAta:solAta,token_x_mint:pool.token_x_mint,token_y_mint:pool.token_y_mint,
    oracle:pool.oracle,host_fee_in:DLMM,user:a.user,token_x_program:mint(b,pool.token_x_mint).program,
    token_y_program:mint(b,pool.token_y_mint).program,memo_program:"MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr",event_authority:pda(DLMM,"__event_authority"),program:DLMM});
   const swapForY=pool.token_x_mint===inputMint,order=swapForY?[0,1,2]:[0,2,1];
   remaining=order.map(i=>spec.extras[i]).filter(k=>b.accounts[k]).map(address=>({address,writable:true}));
  }else throw Error("Unsupported swap venue");
 }
 const layout=(layouts as any)[s.venue==="meteora-dlmm"?"meteora":s.venue][instruction];
 const extra=program===PUMP&&buy?Buffer.from([1,0]):program===SWAP&&buy?Buffer.from([1]):program===DLMM?Buffer.alloc(4):Buffer.alloc(0);
 const data=Buffer.concat([Buffer.from(layout.discriminator),u64(q.input),u64(q.minimumOutput),extra]);
 const keys=layout.accounts.map((r:any)=>{const address=roles[r.name];if(!address||r.address&&r.address!==address)throw Error("Instruction account contract mismatch");return{pubkey:pk(address),isSigner:!!r.signer,isWritable:!!r.writable&&!(r.optional&&address===program)};});
 keys.push(...remaining.map(r=>({pubkey:pk(r.address),isSigner:false,isWritable:r.writable})));
 const swap=new TransactionInstruction({programId:pk(program),keys,data});
 const ixs:TransactionInstruction[]=[ComputeBudgetProgram.setComputeUnitLimit({units:a.computeUnits}),ComputeBudgetProgram.setComputeUnitPrice({microLamports:a.microLamports})];
 const creations:SwapPlan["accountCreations"]=[];
 const create=async(m:string,p:string,address:string)=>{const bytes=p===TOKEN_2022_PROGRAM_ID.toBase58()?getAccountLen([ExtensionType.ImmutableOwner]):165;
  const rent=await rentForBytes(bytes);if(rent<0n)throw Error("Invalid rent");creations.push({address,mint:m,program:p,bytes,rent:rent.toString()});
  ixs.push(createAssociatedTokenAccountIdempotentInstruction(pk(a.user),pk(address),pk(a.user),pk(m),pk(p)));};
 if(!userBase)await create(s.mint,base.program,baseAta);
 if(program!==PUMP&&!b.accounts[solAta]){await create(SOL,TOKEN_PROGRAM_ID.toBase58(),solAta);if(buy){ixs.push(SystemProgram.transfer({fromPubkey:pk(a.user),toPubkey:pk(solAta),lamports:q.input}));ixs.push(createSyncNativeInstruction(pk(solAta)));}}
 ixs.push(swap);if(program!==PUMP&&!b.accounts[solAta])ixs.push(createCloseAccountInstruction(pk(solAta),pk(a.user),pk(a.user)));
 const rent=creations.reduce((n,c)=>n+BigInt(c.rent),0n),priority=(BigInt(a.computeUnits)*a.microLamports+999999n)/1000000n;
 if(rent>a.maximumRent||priority>a.maximumPriorityFee)throw Error("Rent or priority-fee cap");
 const payer=b.accounts[a.user];if(!payer||payer.owner!==ZERO||payer.executable||!Number.isSafeInteger(payer.lamports)||BigInt(payer.lamports!)<(buy&&(program===PUMP||!b.accounts[solAta])?q.input:0n)+rent+a.maximumNetworkFee+priority)throw Error("Insufficient payer balance or invalid owner");
 const serializationStart=performance.now();
 const message=new TransactionMessage({payerKey:pk(a.user),recentBlockhash:block.blockhash,instructions:ixs}).compileToV0Message();
 const tx=new VersionedTransaction(message),serialized=tx.serialize();if(serialized.length>1232)throw Error("Unsigned packet exceeds 1232 bytes; ALT variants unsupported");
 const serializationMs=performance.now()-serializationStart;
 const plan:SwapPlan={serializationMs,venue:s.venue,revision:s.revision,instruction,program,input:q.input,minimumOutput:q.minimumOutput,quote:structuredClone(q),state:structuredClone(s),user:a.user,
  source:buy?(program===PUMP?a.user:solAta):baseAta,destination:buy?baseAta:(program===PUMP?a.user:solAta),inputMint,outputMint,inputProgram,outputProgram,roles,remaining,
  accountCreations:creations,rentLamports:rent,block:structuredClone(block),authorization:a,
  instructions:ixs.map(ix=>({program:ix.programId.toBase58(),data:ix.data.toString("base64"),keys:ix.keys.map(k=>({address:k.pubkey.toBase58(),signer:k.isSigner,writable:k.isWritable}))})),
  unsignedBase64:Buffer.from(serialized).toString("base64"),messageDigest:sha(Buffer.from(message.serialize())),evidenceDigest:s.digest,deployments:structuredClone(e.deployments)};
 freeze(plan);plans.add(plan);return plan;
}
/** Public account discovery only; the subsequent final bank is revalidated before construction. */
export function simulationAccountKeys(s:MarketState<MarketSubject>,b:MarketBatch,user:string){
 const base=mint(b,s.mint),keys=[user,ata(s.mint,user,base.program)];
 if(s.venue==="pump"){
  const g=decodePump(b,PUMP_GLOBAL,"Global"),c=decodePump(b,s.launch.address,"BondingCurve");
  keys.push(g.fee_recipient,g.buyback_fee_recipients[0],pda(PUMP,"creator-vault",pk(c.creator).toBuffer()),
   pda(PUMP,"bonding-curve-v2",pk(s.mint).toBuffer()),pda(PUMP,"global_volume_accumulator"),pda(PUMP,"user_volume_accumulator",pk(user).toBuffer()));
 }else{
  keys.push(ata(SOL,user,TOKEN_PROGRAM_ID.toBase58()));
  if(s.venue==="raydium-cpmm")keys.push(rayKey(b,s.launch.address,9));
  else if(s.venue==="meteora-dlmm")keys.push(struct(b,s.launch.address,DLMM,dlmmSchema,"LbPair").oracle);
  else if(s.venue==="pumpswap"){
   const spec=poolSpec(s.venue,b,s.launch.address),g=struct(b,spec.extras[0],SWAP,swapSchema,"GlobalConfig"),p=struct(b,s.launch.address,SWAP,swapSchema,"Pool",300);
   const creator=pda(SWAP,"creator_vault",pk(p.coin_creator).toBuffer()),fee=g.protocol_fee_recipients[0],back=g.buyback_fee_recipients[0];
   keys.push(fee,back,ata(SOL,fee,TOKEN_PROGRAM_ID.toBase58()),ata(SOL,back,TOKEN_PROGRAM_ID.toBase58()),
    creator,ata(SOL,creator,TOKEN_PROGRAM_ID.toBase58()),pda(SWAP,"pool-v2",pk(s.mint).toBuffer()),
    pda(SWAP,"global_volume_accumulator"),pda(SWAP,"user_volume_accumulator",pk(user).toBuffer()));
  }
 }
 return [...new Set(keys)];
}
