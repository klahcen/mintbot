import test from"node:test";import assert from"node:assert/strict";
import {VersionedTransaction}from"@solana/web3.js";
import {constructionCase}from"./simulation-fixtures.js";
import {validateUnsigned}from"../src/simulation/policy.js";
for(const venue of["pump","pumpswap","raydium-cpmm","meteora-dlmm"]as const)for(const side of["buy","sell"]as const)test(`Pinned ${venue} ${side} builds a policy-checked unsigned packet (unit execution accounts)`,async()=>{
 const c=await constructionCase(venue,side),p=await c.plan();assert.equal(validateUnsigned(p).liveAuthorized,false);
 const tx=VersionedTransaction.deserialize(Buffer.from(p.unsignedBase64,"base64"));assert(tx.signatures.every(s=>s.every(b=>b===0)));assert(Buffer.from(p.unsignedBase64,"base64").length<=1232);
 assert.equal(p.input,c.evidence.quote.input);assert.equal(p.minimumOutput,c.evidence.quote.minimumOutput);
});
for(const field of["input","minout","payer","program","priority","signature","extra"]as const)test(`Wire policy rejects modified ${field}`,async()=>{
 const c=await constructionCase(),p=await c.plan(),tx=VersionedTransaction.deserialize(Buffer.from(p.unsignedBase64,"base64"));
 const ix=tx.message.compiledInstructions.find(i=>tx.message.staticAccountKeys[i.programIdIndex].toBase58()===p.program)!;
 if(field==="input")Buffer.from(ix.data.buffer,ix.data.byteOffset,ix.data.length).writeBigUInt64LE(p.input+1n,8);
 if(field==="minout")Buffer.from(ix.data.buffer,ix.data.byteOffset,ix.data.length).writeBigUInt64LE(0n,16);
 if(field==="payer")tx.message.staticAccountKeys[0]=tx.message.staticAccountKeys[1];
 if(field==="program")ix.programIdIndex=0;
 if(field==="priority")tx.message.compiledInstructions[1].data[1]=255;
 if(field==="signature")tx.signatures[0][0]=1;
 if(field==="extra")tx.message.compiledInstructions.push(ix);
 assert.throws(()=>validateUnsigned(p,Buffer.from(tx.serialize()).toString("base64")));
});
for(const fault of["owner","reserves","authority","deployment","decimals","balance","missing","rent","expiry","blockhash"]as const)test(`Construction fails closed on ${fault}`,async()=>{
 const c=await constructionCase();
 if(fault==="owner")c.evidence.batch.accounts[c.evidence.state.mint]!.owner=c.authorization.user;
 if(fault==="reserves")c.evidence.state.quoteReserve+=1n;
 if(fault==="authority"){const a=c.evidence.batch.accounts[c.evidence.state.mint]!,b=Buffer.from(a.data[0],"base64");b.writeUInt32LE(1,0);b.fill(7,4,36);a.data[0]=b.toString("base64");}
 if(fault==="deployment")(c.evidence.deployments[0].value as any).deploymentSlot++;
 if(fault==="decimals")c.evidence.state.decimals++;
 if(fault==="balance")c.evidence.batch.accounts[c.authorization.user]!.lamports=0;
 if(fault==="missing")delete c.evidence.batch.accounts[c.authorization.user];
 if(fault==="rent")c.authorization.maximumRent=0n;
 if(fault==="expiry")c.evidence.state.retrievedAt=Date.now()-2000;
 if(fault==="blockhash")c.block.observedAt=Date.now()-6000;
 await assert.rejects(c.plan());
});
