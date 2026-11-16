// Reproduce with Node22: node --import tsx docs/phase17/deployment-header-probe.mjs
// Fresh output filename required for another run; no protocol approvals are written.
import {readFile,open} from 'node:fs/promises';
import {parseEnv} from 'node:util';
import {PublicKey} from '@solana/web3.js';
import {ReadOnlyProbe} from '../../src/research/validation-probe.ts';
const env={...parseEnv(await readFile('.env','utf8')),...process.env};if((env.MODE??'paper')!=='paper')throw Error('Paper mode required');
const pins=JSON.parse(await readFile('src/market/deployment-pins.json','utf8'));
const keys=[...Object.keys(pins),...Object.values(pins).map(p=>p.dataAddress)];
const rows=await Promise.all([{id:'primary',endpoint:env.SOLANA_RPC_URL},{id:'secondary',endpoint:env.SOLANA_SECONDARY_RPC_URL}].map(async p=>{
 if(!p.endpoint)return {id:p.id,status:'missing'};
 const reader=new ReadOnlyProbe(p.endpoint,4000,1);
 try{const batch=await reader.read('getMultipleAccounts',[keys,{commitment:'finalized',encoding:'base64',dataSlice:{offset:0,length:45}}]);
  if(!Number.isSafeInteger(batch?.context?.slot)||!Array.isArray(batch.value)||batch.value.length!==keys.length)throw Error();
  const headers=Object.entries(pins).map(([program,pin],i)=>{
   const prog=batch.value[i],data=batch.value[i+Object.keys(pins).length],pb=Buffer.from(prog?.data?.[0]??'','base64'),db=Buffer.from(data?.data?.[0]??'','base64');
   const loader='BPFLoaderUpgradeab1e11111111111111111111111';
   const structurallyValid=prog?.owner===loader&&data?.owner===loader&&prog.executable===true&&data.executable===false&&pb.length===36&&db.length===45&&pb.readUInt32LE(0)===2&&db.readUInt32LE(0)===3;
   const pointer=structurallyValid?new PublicKey(pb.subarray(4,36)).toBase58():null;
   const observedDeploymentSlot=structurallyValid?db.readBigUInt64LE(4).toString():null;
   return {program,programData:pin.dataAddress,reviewedDeploymentSlot:pin.deploymentSlot,observedDeploymentSlot,structurallyValid,pointerMatches: pointer===pin.dataAddress,pinMatches:structurallyValid&&pointer===pin.dataAddress&&observedDeploymentSlot===String(pin.deploymentSlot),executionEligible:false};
  });
  return {id:p.id,batch,headers,observations:reader.observations};
 }catch{return {id:p.id,status:'unavailable',observations:reader.observations};}
}));
const file=await open('docs/phase17/deployment-headers.json','wx',0o600);try{await file.writeFile(JSON.stringify({generatedAt:Date.now(),rows,scope:'Finalized upgradeable-loader header comparison; no ELF hash/semantic equivalence or new deployment approval',executionEligible:false},null,2)+'\n');await file.sync();}finally{await file.close();}
console.log(JSON.stringify(rows.map(r=>({provider:r.id,headers:r.headers}))));
