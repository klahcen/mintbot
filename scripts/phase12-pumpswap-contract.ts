/** Exact current signed-custody diagnostics for the observed rejected variant. Never enables trading. */
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { PublicKey } from '@solana/web3.js';
import { unpackAccount,unpackMint } from '@solana/spl-token';
import { BorshReader } from '../src/borsh-reader.js';
import { MarketRpc } from '../src/market/rpc.js';
import { publicEvidence } from '../src/market/types.js';
const args=process.argv.slice(2);if(!args.includes('--run'))throw Error('Explicit --run required');
const opt=(k:string,d:string)=>args.includes(k)?args[args.indexOf(k)+1]!:d;
const output=opt('--output','docs/phase12/pumpswap-contract.json'),endpoint=process.env.SOLANA_RPC_URL??'https://api.mainnet-beta.solana.com';
const priorBytes=await readFile('docs/phase11/alternate-candidate-inspections.json'),prior=JSON.parse(priorBytes.toString()).rows[0],launch=prior.originalLaunch;
const idlBytes=await readFile('docs/phase12/official/pump-fun-pump-public-docs-idl-pump_amm.json'),idl=JSON.parse(idlBytes.toString()),definition=idl.types.find((t:any)=>t.name==='Pool').type,disc=Buffer.from(idl.accounts.find((a:any)=>a.name==='Pool').discriminator),program='pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const rpc=new MarketRpc(endpoint);const captured:unknown[]=[];const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
function pool(batch:any){const a=batch.accounts[launch.address];if(!a||a.owner!==program)throw Error('Pool owner missing');const b=Buffer.from(a.data[0],'base64');if(!b.subarray(0,8).equals(disc))throw Error('Pool discriminator mismatch');const r=new BorshReader(b.subarray(8),idl.types),v=r.read(definition);r.finish();return v;}
let result:any;
try{
 const first=await rpc.accounts([launch.address],launch.slot);captured.push(first);const p=pool(first);
 const keys=[launch.address,p.pool_base_token_account,p.pool_quote_token_account,p.base_mint,p.quote_mint,p.lp_mint];const batch=await rpc.accounts(keys,first.contextSlot);captured.push(batch);const v=pool(batch);
 for(const k of ['base_mint','quote_mint','pool_base_token_account','pool_quote_token_account','lp_mint'])if(v[k]!==p[k])throw Error('Pool topology changed between reads');
 const info=(key:string)=>{const a=batch.accounts[key];if(!a||typeof a.lamports!=='number'||!Number.isSafeInteger(a.lamports)||a.lamports<0)throw Error('Missing custody/mint account or balance');return {...a,lamports:a.lamports,owner:new PublicKey(a.owner),data:Buffer.from(a.data[0],'base64')};};
 const base=unpackAccount(new PublicKey(v.pool_base_token_account),info(v.pool_base_token_account),info(v.base_mint).owner),quote=unpackAccount(new PublicKey(v.pool_quote_token_account),info(v.pool_quote_token_account),info(v.quote_mint).owner);
 if(base.owner.toBase58()!==launch.address||quote.owner.toBase58()!==launch.address||base.mint.toBase58()!==v.base_mint||quote.mint.toBase58()!==v.quote_mint)throw Error('Pool vault authority/mint relationship mismatch');
 const mint=unpackMint(new PublicKey(v.base_mint),info(v.base_mint),info(v.base_mint).owner),raw=quote.amount,signed=BigInt(v.virtual_quote_reserves),protocol=BigInt(v.protocol_fees),creator=BigInt(v.creator_fees),held=protocol+creator,effective=raw+signed,boost=signed+held,spendable=raw-held,max=(1n<<64n)-1n;
 if([raw,protocol,creator,effective,spendable].some(n=>n<0n||n>max)||signed<-(1n<<127n)||signed>=(1n<<127n)||boost<0n||base.amount===0n)throw Error('Signed reserve/custody bounds inconsistent with documented contract');
 const req=createRequire('/tmp/mintbot-pump-reference/package.json'),sdk=req('@pump-fun/pump-swap-sdk'),BN=req('bn.js'),sdkCap=sdk.poolMarketCap({baseMintSupply:new BN(mint.supply.toString()),baseReserve:new BN(base.amount.toString()),quoteReserve:new BN(raw.toString()).add(new BN(signed.toString())),isMayhemMode:false}).toString(),ours=(effective*mint.supply/base.amount).toString();
 if(sdkCap!==ours)throw Error('Independent SDK reserve-based arithmetic mismatch');
 result={batch,pool:v,baseVault:{mint:base.mint.toBase58(),owner:base.owner.toBase58(),atoms:base.amount.toString()},quoteVault:{mint:quote.mint.toBase58(),owner:quote.owner.toBase58(),atoms:raw.toString()},retainedFeeAtoms:held.toString(),signedVirtualQuoteAtoms:signed.toString(),effectiveQuoteAtoms:effective.toString(),spendableQuoteAtoms:spendable.toString(),inferredBoostAtomsFromPublishedIdentity:boost.toString(),signedOffsetExactlyNegatesFees:signed===-held,reference:{package:'@pump-fun/pump-swap-sdk',version:JSON.parse(await readFile('/tmp/mintbot-pump-reference/node_modules/@pump-fun/pump-swap-sdk/package.json','utf8')).version,operation:'poolMarketCap in quote atoms, no native denomination inferred',actual:ours,sdk:sdkCap,equal:ours===sdkCap,nonDegenerateSupply:mint.supply>0n,scope:mint.supply>0n?'Reserve-based SDK arithmetic only, not bidirectional quote/wire proof':'Zero native mint supply makes this equality trivial; it is not quote validation'},routeBlockers:['Production pool allocation guard remains unchanged','SOL is base and quote is non-native; paper budget/instruction direction and fee denomination require separate reviewed routing','Signed accounting correspondence does not approve initializer, custody sweep, financial wire or bidirectional simulation','No independently authorized provider/coverage epoch'],executionAuthorized:false};
}catch(error){result={issue:(error as Error).message,executionAuthorized:false};}
await writeFile(output,JSON.stringify(publicEvidence({generatedAt:new Date().toISOString(),provider:new URL(endpoint).host,originalLaunch:launch,priorArtifactSha256:sha(priorBytes),officialIdlSha256:sha(idlBytes),captured,result,liveTrading:false,scope:'Current finalized equal-batch custody and signed-reserve inspection of the original rejected launch. Original receipt/time are never refreshed. Published formula is not source-to-binary proof or a newly approved financial route.'}),null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({issue:result.issue,raw:result.quoteVault?.atoms,signed:result.signedVirtualQuoteAtoms,held:result.retainedFeeAtoms,effective:result.effectiveQuoteAtoms,boost:result.inferredBoostAtomsFromPublishedIdentity,reference:result.reference,executionAuthorized:false}));
