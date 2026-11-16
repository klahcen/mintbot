import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateCloudRuntime } from '../scripts/cloud-runtime.js';
const valid={API_TOKEN:'a'.repeat(64),POSTGRES_PASSWORD:'b'.repeat(64),SOLANA_RPC_URL:'https://one.invalid/secret',SOLANA_WS_URL:'wss://one.invalid/secret',SOLANA_SECONDARY_RPC_URL:'https://two.invalid/secret',SOLANA_SECONDARY_WS_URL:'wss://two.invalid/secret'};
test('Cloud runtime rejects signer inputs, weak tokens and insecure transports without disclosure',()=>{
 assert.deepEqual(validateCloudRuntime(valid),valid);
 for(const value of [null,{}, {...valid,PRIVATE_KEY:'DO_NOT_DISCLOSE'},{...valid,API_TOKEN:'short'},{...valid,POSTGRES_PASSWORD:'DO_NOT_DISCLOSE'},{...valid,SOLANA_RPC_URL:'http://one.invalid/DO_NOT_DISCLOSE'},{...valid,SOLANA_WS_URL:'https://one.invalid/DO_NOT_DISCLOSE'}])
  assert.throws(()=>validateCloudRuntime(value),(e:Error)=>!e.message.includes('DO_NOT_DISCLOSE'));
});
test('Cloud job preserves bounded entrypoint, stop fence and finalized coverage health controls',async()=>{
 const s=await readFile('compose.cloud.yaml','utf8');
 for(const value of ['profiles: [research]','restart: "no"','RESEARCH_OWNER_PATH:','RESEARCH_STOP_PATH:','researchPolicyReview','e.journal.quarantined===0','e.journal.gaps.every','research-state:/app/data','research-control:/app/research-control','REAL_MARKET_PAPER: "false"','database: {internal: true}'])assert(s.includes(value),value);
 assert(!s.includes('5432:5432'));assert(!s.includes('docker.sock'));assert(!s.includes('${API_TOKEN'));assert(!s.includes('${POSTGRES_PASSWORD'));
 const runtime=await readFile('scripts/cloud-runtime.ts','utf8');assert(runtime.includes("await import('./phase11-mainnet.js')"));
});
