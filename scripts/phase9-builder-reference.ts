/** Independent pinned SDK instruction serialization, with explicitly UNIT user/fee account stubs. No signing, RPC or submission. */
import {createRequire}from"node:module";import{readFile,writeFile}from"node:fs/promises";import{PublicKey}from"@solana/web3.js";
import{constructionCase}from"../tests/simulation-fixtures.js";import{sha}from"../src/simulation/builders.js";import{publicEvidence}from"../src/market/types.js";
const pumpRequire=createRequire("/tmp/mintbot-pump-reference/package.json"),poolRequire=createRequire("/tmp/mintbot-phase5-reference/package.json");
const BN=poolRequire("bn.js"),pump=pumpRequire("@pump-fun/pump-sdk"),swap=pumpRequire("@pump-fun/pump-swap-sdk"),ray=poolRequire("@raydium-io/raydium-sdk-v2"),dlmm=poolRequire("@meteora-ag/dlmm");
const pk=(s:string)=>new PublicKey(s),camel=(s:string)=>s.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
const rows:any[]=[],pins:any[]=[];
for(const[root,req,name]of[["/tmp/mintbot-pump-reference",pumpRequire,"@pump-fun/pump-sdk"],["/tmp/mintbot-pump-reference",pumpRequire,"@pump-fun/pump-swap-sdk"],["/tmp/mintbot-phase5-reference",poolRequire,"@raydium-io/raydium-sdk-v2"],["/tmp/mintbot-phase5-reference",poolRequire,"@meteora-ag/dlmm"]]as const){const p=JSON.parse(await readFile(`${root}/node_modules/${name}/package.json`,"utf8")),lock=JSON.parse(await readFile(`${root}/package-lock.json`,"utf8"));pins.push({name,version:p.version,integrity:lock.packages[`node_modules/${name}`].integrity,entrySha256:sha(await readFile(req.resolve(name)))});}
for(const venue of["pump","pumpswap","raydium-cpmm","meteora-dlmm"]as const)for(const side of["buy","sell"]as const){
 try{
 const c=await constructionCase(venue,side),p=await c.plan();let expected:any;
 if(venue==="raydium-cpmm"){
  const r=p.roles;expected=ray.makeSwapCpmmBaseInInstruction(pk(p.program),...(["payer","authority","amm_config","pool_state","input_token_account","output_token_account","input_vault","output_vault","input_token_program","output_token_program","input_token_mint","output_token_mint","observation_state"].map(k=>pk(r[k]))),new BN(p.input.toString()),new BN(p.minimumOutput.toString()));
 }else{
  const program=venue==="pump"?pump.PUMP_SDK.offlinePumpProgram:venue==="pumpswap"?swap.PUMP_AMM_SDK.offlineProgram:dlmm.createProgram({});
  const name=camel(p.instruction),idl=program.idl.instructions.find((i:any)=>i.name===name);
  const args=[new BN(p.input.toString()),new BN(p.minimumOutput.toString()),...(venue==="pump"&&side==="buy"?[{0:true},{0:false}]:venue==="pumpswap"&&side==="buy"?[{0:true}]:venue==="meteora-dlmm"?[{slices:[]}]:[])];
  const accounts=Object.fromEntries(idl.accounts.map((a:any)=>{const role=Object.keys(p.roles).find(k=>camel(k)===a.name)!;return[a.name,a.optional&&p.roles[role]===p.program?null:pk(p.roles[role])];}));
  expected=await program.methods[name](...args).accountsStrict(accounts).remainingAccounts(p.remaining.map(r=>({pubkey:pk(r.address),isSigner:false,isWritable:r.writable}))).instruction();
 }
 const actual=p.instructions.find(i=>i.program===p.program)!,reference={program:expected.programId.toBase58(),data:expected.data.toString("base64"),keys:expected.keys.map((k:any)=>({address:k.pubkey.toBase58(),signer:k.isSigner,writable:k.isWritable}))};
 rows.push({venue,side,revision:p.revision,input:p.input.toString(),minimumOutput:p.minimumOutput.toString(),actual,reference,equal:JSON.stringify(actual)===JSON.stringify(reference),packetBytes:Buffer.from(p.unsignedBase64,"base64").length,
  scope:"Real recorded market bytes plus explicitly UNIT execution accounts; independent SDK instruction serialization, not RPC simulation or real account availability"});
 }catch(e){rows.push({venue,side,equal:false,issue:(e as Error).message});}
}
await writeFile(process.argv.includes("--output")?process.argv[process.argv.indexOf("--output")+1]!:"docs/phase9/builder-reference.json",JSON.stringify(publicEvidence({generatedAt:new Date().toISOString(),pins,rows,liveTrading:false}),null,2)+"\n");console.log(rows.map(({venue,side,equal,issue,packetBytes})=>({venue,side,equal,issue,packetBytes})));if(rows.some(r=>!r.equal))process.exitCode=1;
