/** Cryptographic inspection of historical signed evidence only. Never returns execution approval. */
import { createPublicKey, verify, createHash } from 'node:crypto';
import { VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
export function inspectSignedWire(raw:any,json:any,signature:string){
  const fail=(reason:string)=>({status:'failed' as const,reasons:[reason],executionEligible:false as const});
  try{
    if(!raw||!json||raw.slot!==json.slot||raw.version!==json.version||raw.meta?.err!==null||json.meta?.err!==null||
      !Number.isSafeInteger(raw.slot)||!Array.isArray(raw.transaction)||raw.transaction[1]!=='base64'||typeof raw.transaction[0]!=='string')return fail('Missing successful matching-slot/version JSON and signed-base64 evidence');
    const bytes=Buffer.from(raw.transaction[0],'base64');
    if(bytes.length<65||bytes.length>4096||bytes.toString('base64')!==raw.transaction[0])return fail('Noncanonical or out-of-bounds wire encoding');
    const tx=VersionedTransaction.deserialize(bytes),message=tx.message;
    if(!['legacy',0,1].includes(tx.version)||tx.version!==raw.version)return fail('Unsupported or conflicting signed transaction version');
    let messageBytes:Uint8Array;
    if(tx.version===1){
      if(bytes[0]!==0x81||bytes[1]!==tx.signatures.length)return fail('Invalid v1 signature envelope');
      messageBytes=bytes.subarray(0,bytes.length-tx.signatures.length*64);
    }else{
      // Canonical Solana shortvec signature prefix; maximum 64 signatures under the wire bound.
      if(bytes[0]!==tx.signatures.length||bytes[0]>=128)return fail('Unsupported noncanonical signature envelope');
      messageBytes=bytes.subarray(1+tx.signatures.length*64);
      if(!Buffer.from(message.serialize()).equals(messageBytes))return fail('Signed-message roundtrip mismatch');
    }
    if(!tx.signatures.length||bs58.encode(tx.signatures[0])!==signature||
      JSON.stringify(tx.signatures.map(s=>bs58.encode(s)))!==JSON.stringify(json.transaction?.signatures))return fail('Requested signature or JSON signature list mismatch');
    const staticKeys=message.staticAccountKeys;
    if(message.header.numRequiredSignatures>staticKeys.length||message.header.numReadonlySignedAccounts>message.header.numRequiredSignatures||
      message.header.numReadonlyUnsignedAccounts>staticKeys.length-message.header.numRequiredSignatures)return fail('Invalid account header bounds');
    for(let i=0;i<tx.signatures.length;i++){
      const key=createPublicKey({key:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),staticKeys[i].toBuffer()]),format:'der',type:'spki'});
      if(!verify(null,messageBytes,key,tx.signatures[i]))return fail('Invalid Ed25519 transaction signature');
    }
    const jm=json.transaction.message,loaded=json.meta.loadedAddresses;
    if(!Array.isArray(jm.accountKeys)||jm.accountKeys.some((k:any)=>typeof k!=='string')||
      JSON.stringify(staticKeys.map(k=>k.toBase58()))!==JSON.stringify(jm.accountKeys)||
      ["numRequiredSignatures","numReadonlySignedAccounts","numReadonlyUnsignedAccounts"].some(k=>(message.header as any)[k]!==jm.header?.[k])||message.recentBlockhash!==jm.recentBlockhash)return fail('Static account/header/blockhash reconstruction mismatch');
    if(tx.version===1){
      const config=(message as any).transactionConfig,fields=['computeUnitLimit','heapSize','loadedAccountsDataSizeLimit','priorityFee'];
      if(!jm.transactionConfig||Object.keys(jm.transactionConfig).some(k=>!fields.includes(k))||fields.some(k=>
        config[k]!==jm.transactionConfig[k] || config[k]!==null && (!Number.isSafeInteger(config[k])||config[k]<0)) ||
        !(config.computeUnitLimit>0)||!(config.loadedAccountsDataSizeLimit>0) ||
        !Number.isSafeInteger(json.meta.fee)||json.meta.fee<(config.priorityFee??0)||
        json.meta.computeUnitsConsumed!==undefined && (!Number.isSafeInteger(json.meta.computeUnitsConsumed)||json.meta.computeUnitsConsumed<0||json.meta.computeUnitsConsumed>config.computeUnitLimit))
        return fail('Invalid or conflicting v1 resource config, total priority fee or compute use');
    }
    const lookupKeys=tx.version===0?[...(loaded?.writable??[]),...(loaded?.readonly??[])]:[];
    if(tx.version===0&&(!Array.isArray(loaded?.writable)||!Array.isArray(loaded?.readonly)))return fail('Missing loaded-address reconstruction');
    if(tx.version===1&&((loaded?.writable?.length??0)||(loaded?.readonly?.length??0)))return fail('Unexpected v1 loaded addresses');
    const keyCount=staticKeys.length+lookupKeys.length;
    if(!Array.isArray(json.meta.preBalances)||!Array.isArray(json.meta.postBalances)||json.meta.preBalances.length!==keyCount||json.meta.postBalances.length!==keyCount||
      [...json.meta.preBalances,...json.meta.postBalances].some(v=>!Number.isSafeInteger(v)||v<0))return fail('Incomplete balance metadata');
    if(!Array.isArray(jm.instructions)||jm.instructions.length!==message.compiledInstructions.length)return fail('Instruction count mismatch');
    for(let i=0;i<message.compiledInstructions.length;i++){
      const ix=message.compiledInstructions[i],j=jm.instructions[i];
      if(ix.programIdIndex>=keyCount||ix.accountKeyIndexes.some(k=>k>=keyCount)||ix.programIdIndex!==j.programIdIndex||
        JSON.stringify(ix.accountKeyIndexes)!==JSON.stringify(j.accounts)||bs58.encode(ix.data)!==j.data)return fail('Instruction account/index/data reconstruction mismatch');
    }
    return {status:'signed-payload-matched' as const,version:tx.version,slot:raw.slot,signatures:tx.signatures.length,
      accountKeys:keyCount,instructions:message.compiledInstructions.length,
      ...(tx.version===1?{transactionConfig:(message as any).transactionConfig}:{}),
      wireSha256:createHash('sha256').update(bytes).digest('hex'),
      unresolved:['Independent provider attribution and signed payload agreement','v0 lookup-table provenance where applicable','Complete metadata/inner-instruction invocation and venue semantics','Version-specific fee/config economic validation','Fresh creation, risk and coverage-epoch approval'],executionEligible:false as const};
  }catch{return fail('Signed-wire decoding or reconstruction rejected');}
}
