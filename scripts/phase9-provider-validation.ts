import {mkdir,writeFile} from "node:fs/promises";
import {ProviderConsistency} from "../src/research/providers.js";
if(!process.argv.includes("--run"))throw Error("Explicit --run required for bounded read-only provider validation");
const checker=new ProviderConsistency([
 {id:"solana-public",endpoint:"https://api.mainnet-beta.solana.com"},
 {id:"publicnode",endpoint:"https://solana-rpc.publicnode.com",operator:{name:"Allnodes PublicNode",attribution:"https://www.publicnode.com/"}},
]);
// Solana's public endpoint documents a service, not independently verifiable infrastructure ownership.
// Preserve observed comparisons but never upgrade unknown operating independence to permission.
const result=await checker.inspect({accounts:["11111111111111111111111111111111"]});
const artifact={generatedAt:new Date().toISOString(),...result,status:result.status==="failed"?"failed":"unknown",eligible:false,independence:"unknown",operatorAttributionLimit:"Public endpoint service brands differ; Solana endpoint's underlying operator and independence from Allnodes were not established. No independent-infrastructure agreement claim.",liveAuthorized:false};
await mkdir("docs/phase9",{recursive:true});await writeFile((process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output")+1]! : "docs/phase9/provider-validation.json"),JSON.stringify(artifact,null,2));console.log(JSON.stringify(artifact,null,2));
