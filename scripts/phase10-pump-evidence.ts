/** Bounded authoritative loader/ProgramData capture and official-schema review; no pin changes. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
if(!process.argv.includes("--run"))throw Error("Explicit --run required");
const i=process.argv.indexOf("--output-dir"),output=i<0?"docs/phase10/pump-deployment":process.argv[i+1]!;
await mkdir(output); // Captures are immutable by default.
const sha=(bytes:Buffer|string)=>createHash("sha256").update(bytes).digest("hex");
async function bounded(url:string,options:RequestInit={},limit=20*1024*1024){
 const response=await fetch(url,{...options,redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!response.ok){await response.body?.cancel();throw Error(`HTTP ${response.status}`);}
 const reader=response.body!.getReader(),chunks:Uint8Array[]=[];let bytes=0;
 try{for(;;){const item=await reader.read();if(item.done)break;bytes+=item.value.length;if(bytes>limit){await reader.cancel();throw Error("Capture response byte bound");}chunks.push(item.value);}}finally{reader.releaseLock();}
 return Buffer.concat(chunks);
}
const program="6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",pins=JSON.parse(await readFile("src/market/deployment-pins.json","utf8")),pin=pins[program];
const observations:any[]=[],sources:any[]=[];
for(const endpoint of [process.env.SOLANA_RPC_URL??"https://api.mainnet-beta.solana.com",process.env.SOLANA_SECONDARY_RPC_URL??"https://solana-rpc.publicnode.com"]){
 const row:any={provider:new URL(endpoint).host,startedAt:new Date().toISOString()};
 try{
  const params=[[program,pin.dataAddress],{commitment:"finalized",encoding:"base64"}];
  const body=JSON.parse((await bounded(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"getMultipleAccounts",params})})).toString());
  if(body.id!==1||body.error||!Number.isSafeInteger(body.result?.context?.slot)||body.result?.value?.length!==2)throw Error("Invalid finalized account response");
  const [p,d]=body.result.value,pb=Buffer.from(p.data[0],"base64"),db=Buffer.from(d.data[0],"base64"),loader="BPFLoaderUpgradeab1e11111111111111111111111";
  if(p.owner!==loader||d.owner!==loader||!p.executable||d.executable||pb.length!==36||db.length<45||db.length>16*1024*1024||pb.readUInt32LE(0)!==2||db.readUInt32LE(0)!==3||new PublicKey(pb.subarray(4)).toBase58()!==pin.dataAddress)throw Error("Loader identity unsupported");
  const payload=db.subarray(45);if(payload.length<64||payload.subarray(0,4).toString("hex")!=="7f454c46"||payload[4]!==2||payload[5]!==1)throw Error("Expected ELF64 little-endian payload unavailable");
  const bound=(n:bigint)=>{if(n<0n||n>BigInt(payload.length))throw Error("ELF range exceeds captured payload");return Number(n);};
  const phoff=bound(payload.readBigUInt64LE(32)),shoff=bound(payload.readBigUInt64LE(40)),phsize=payload.readUInt16LE(54),phnum=payload.readUInt16LE(56),shsize=payload.readUInt16LE(58),shnum=payload.readUInt16LE(60);
  if(phnum>128||shnum>1024||(phnum&&phsize!==56)||(shnum&&shsize!==64))throw Error("Unreviewed ELF header table shape");
  let extent=Math.max(64,bound(BigInt(phoff+phsize*phnum)),bound(BigInt(shoff+shsize*shnum)));
  for(let n=0;n<phnum;n++){const at=phoff+n*phsize;extent=Math.max(extent,bound(payload.readBigUInt64LE(at+8)+payload.readBigUInt64LE(at+32)));}
  for(let n=0;n<shnum;n++){const at=shoff+n*shsize;if(payload.readUInt32LE(at+4)!==8)extent=Math.max(extent,bound(payload.readBigUInt64LE(at+24)+payload.readBigUInt64LE(at+32)));}
  await writeFile(`${output}/programdata.bin`,db,{flag:"wx"});await writeFile(`${output}/elf-referenced-image.bin`,payload.subarray(0,extent),{flag:"wx"});
  Object.assign(row,{context:body.result.context,request:{method:"getMultipleAccounts",params},programHeader:p,programDataHeader:{...d,data:[db.subarray(0,45).toString("base64"),"base64"]},observedDeploymentSlot:db.readBigUInt64LE(4).toString(),programDataBytes:db.length,programDataSha256:sha(db),allocatedPayloadBytes:payload.length,allocatedPayloadSha256:sha(payload),elfReferencedBytes:extent,elfReferencedSha256:sha(payload.subarray(0,extent)),trailingBytesAllZero:payload.subarray(extent).every(b=>b===0),elfMachine:payload.readUInt16LE(18),elfFlags:payload.readUInt32LE(48),authorityOption:db[12],reviewedPinMatches:db.readBigUInt64LE(4)===BigInt(pin.deploymentSlot)});
  observations.push(row);break;
 }catch(error){row.issue=(error as Error).message;observations.push(row);}
}
try{
 const commits=JSON.parse((await bounded("https://api.github.com/repos/pump-fun/pump-public-docs/commits?per_page=1",{headers:{"user-agent":"Mintbot-read-only-evidence"}},1024*1024)).toString());
 const commit=commits[0].sha;
 for(const path of ["README.md","idl/pump.json","docs/PUMP_PROGRAM_README.md","docs/instructions/CREATE_WITH_PUMP_COIN_QUOTE.md"]){
  const url=`https://raw.githubusercontent.com/pump-fun/pump-public-docs/${commit}/${path}`,row:any={repository:"pump-fun/pump-public-docs",commit,path,url};
  try{const bytes=await bounded(url,{},4*1024*1024);row.sha256=sha(bytes);row.bytes=bytes.length;row.local=path.replaceAll("/","-");await writeFile(`${output}/${row.local}`,bytes,{flag:"wx"});}catch(error){row.issue=(error as Error).message;}
  sources.push(row);
 }
}catch(error){sources.push({issue:(error as Error).message});}
await writeFile(`${output}/evidence.json`,JSON.stringify({generatedAt:new Date().toISOString(),program,reviewedPin:pin,observations,sources,newVariantEnabled:false,sourceToBinaryEquivalence:"unknown",liveTrading:false,scope:"At most two full ProgramData fetches and five bounded official source reads. ELF extent is computed from file-backed headers/segments/sections; allocated payload hash includes storage padding. Neither hash proves source correspondence, correct arithmetic, unsigned swap compatibility or eligibility. Existing pin remains unchanged."},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify(observations.map(({provider,observedDeploymentSlot,programDataBytes,elfReferencedSha256,issue})=>({provider,observedDeploymentSlot,programDataBytes,elfReferencedSha256,issue}))));
