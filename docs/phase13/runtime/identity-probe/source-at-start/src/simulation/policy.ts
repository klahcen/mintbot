import {VersionedTransaction,TransactionMessage,ComputeBudgetProgram,SystemProgram} from "@solana/web3.js";
import {performance} from "node:perf_hooks";
import {assertPlan,sha} from "./builders.js";
import layouts from "./instruction-layouts.json" with {type:"json"};
import type {SwapPlan} from "./types.js";
/** Independent wire inspection. No caller-supplied instruction labels or editable manifest is accepted. */
export function validateUnsigned(plan:SwapPlan,base64=plan.unsignedBase64,now=Date.now()) {
 assertPlan(plan);
 const tx=VersionedTransaction.deserialize(Buffer.from(base64,"base64"));
 if(tx.version!==0||tx.message.addressTableLookups.length||tx.signatures.length!==1||tx.signatures.some(s=>s.some(x=>x!==0)))throw Error("Only unsigned single-payer v0 without lookup tables supported");
 if(tx.message.staticAccountKeys[0].toBase58()!==plan.authorization.user||plan.user!==plan.authorization.destinationOwner)throw Error("Unauthorized payer or destination");
 if(now>=plan.authorization.expiresAt||now<plan.state.retrievedAt||now-plan.state.retrievedAt>1500||performance.now()<plan.state.retrievedMono||performance.now()-plan.state.retrievedMono>1500||now<plan.block.observedAt||now-plan.block.observedAt>5000||performance.now()>plan.quote.expiresMono)throw Error("Expired quote, authorization or blockhash evidence");
 if(plan.deployments.some(d=>d.observedAt===undefined||now<d.observedAt||now-d.observedAt>5000))throw Error("Expired deployment evidence");
 if(tx.message.recentBlockhash!==plan.block.blockhash)throw Error("Modified blockhash");
 const message=TransactionMessage.decompile(tx.message),ixs=message.instructions;
 if(ixs.length!==plan.instructions.length)throw Error("Unrecognized instruction count");
 const expectedWritable=new Set<string>([plan.user]),expectedSigners=new Set([plan.user]);
 for(const ix of plan.instructions)for(const k of ix.keys)if(k.writable)expectedWritable.add(k.address);
 for(let i=0;i<tx.message.staticAccountKeys.length;i++){
  const k=tx.message.staticAccountKeys[i].toBase58();
  if(tx.message.isAccountWritable(i)!==expectedWritable.has(k)||tx.message.isAccountSigner(i)!==expectedSigners.has(k))throw Error("Unapproved writable account or signer");
 }
 let swaps=0,units=0,rate=0n;
 for(let n=0;n<ixs.length;n++){
  const ix=ixs[n],expected=plan.instructions[n],program=ix.programId.toBase58();
  if(program!==expected.program||ix.keys.length!==expected.keys.length||ix.keys.some((k,i)=>k.pubkey.toBase58()!==expected.keys[i].address))throw Error("Unapproved account/program change");
  if(program===plan.program){
   swaps++;const layout=(layouts as any)[plan.venue==="meteora-dlmm"?"meteora":plan.venue][plan.instruction];
   const extra=plan.program===plan.roles.program&&plan.venue==="pump"&&plan.quote.side==="buy"?2:plan.venue==="pumpswap"&&plan.quote.side==="buy"?1:plan.venue==="meteora-dlmm"?4:0;
   if(ix.data.length!==24+extra||!ix.data.subarray(0,8).equals(Buffer.from(layout.discriminator)))throw Error("Unapproved discriminator/layout");
   const input=ix.data.readBigUInt64LE(8),minimum=ix.data.readBigUInt64LE(16);
   if(input!==plan.input||input>plan.authorization.maximumInput||minimum!==plan.minimumOutput||minimum<=0n||minimum<plan.authorization.minimumOutput||minimum<plan.quote.minimumOutput||minimum>plan.quote.output)throw Error("Wire spending or minimum output mismatch");
   if(extra&&ix.data.subarray(24).some((b,i)=>b!==(i===0&&plan.venue!=="meteora-dlmm"?1:0)))throw Error("Unapproved optional swap flags");
  }else if(program===ComputeBudgetProgram.programId.toBase58()){
   if(n===0&&ix.data.length===5&&ix.data[0]===2)units=ix.data.readUInt32LE(1);
   else if(n===1&&ix.data.length===9&&ix.data[0]===3)rate=ix.data.readBigUInt64LE(1);
   else throw Error("Unrecognized compute budget instruction");
  }else{
   // All supported account-management instructions are independently allowlisted by exact encoding.
   const allowed=[SystemProgram.programId.toBase58(),"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",plan.inputProgram,plan.outputProgram];
   if(!allowed.includes(program)||ix.data.toString("base64")!==expected.data)throw Error("Unrecognized account-management instruction");
  }
 }
 if(swaps!==1||units!==plan.authorization.computeUnits||rate!==plan.authorization.microLamports||
  (BigInt(units)*rate+999999n)/1000000n>plan.authorization.maximumPriorityFee||plan.rentLamports>plan.authorization.maximumRent)throw Error("Compute, fee or rent policy");
 const digest=sha(Buffer.from(tx.message.serialize()));if(digest!==plan.messageDigest)throw Error("Unexpected serialized message change");
 return {kind:"simulation-policy" as const,messageDigest:digest,input:plan.input.toString(),minimumOutput:plan.minimumOutput.toString(),liveAuthorized:false as const};
}
