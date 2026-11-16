import {Pool}from"pg";import{IntentLedger}from"../../src/simulation/intent-ledger.js";
const pool=new Pool({host:process.argv[2],port:5432,user:process.argv[3],database:"postgres"});
const ledger=new IntentLedger(pool),key={opportunity:"actual-crash-boundary",strategy:"unit-v1",side:"buy"as const,generation:"1",wallet:"unit-wallet"};
await ledger.budget("wallet:unit-wallet","SOL",1000n);await ledger.budget("unit-wallet:unit-v1","SOL",1000n);const intent=await ledger.reserve(key,[{asset:"SOL",atoms:"100"}],{scope:"crash unit"});const lease=await ledger.claim(intent.id,"child-owner",100);
process.stdout.write(JSON.stringify({id:intent.id,fence:lease.fence})+"\n",()=>process.kill(process.pid,"SIGKILL"));
