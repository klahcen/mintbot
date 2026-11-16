import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { WebSocketServer } from 'ws';
import { loadResearchProviders, validateResearchProviders, safeResearchIssue } from '../src/research/provider-config.js';
import { ProviderConsistency } from '../src/research/providers.js';
import { ReadOnlyProbe, probeWebSocket } from '../src/research/validation-probe.js';
const primary='https://primary.example/SECRET',secondary='https://secondary.example/SECRET';
const providers=[{id:'primary',endpoint:primary},{id:'secondary',endpoint:secondary}];

test('Phase18 private configuration rejects invalid shapes, duplicate identities, transports and both endpoint mismatches without input disclosure',()=>{
 for(const value of [null,{},[],[...providers,{id:'primary',endpoint:'https://other.example'}],
  [{...providers[0],endpoint:'INVALID_SECRET'},providers[1]],
  [{...providers[0],endpoint:'https://user:SECRET@example.test'},providers[1]],
  [providers[0],{...providers[1],operator:{name:'Chainstack',attribution:'INVALID_SECRET'}}],
  [providers[0],{...providers[1],unexpected:'SECRET'}]]){
  assert.throws(()=>validateResearchProviders(value,primary,secondary),(e:Error)=>!String(e).includes('SECRET'));
 }
 assert.throws(()=>validateResearchProviders(providers,secondary,secondary),/mapping mismatch/);
 assert.throws(()=>validateResearchProviders(providers,primary,primary),/mapping mismatch/);
 assert.throws(()=>new ProviderConsistency([{id:'one',endpoint:'INVALID_SECRET'},providers[1]]),(e:Error)=>!JSON.stringify(e).includes('SECRET'));
 assert.deepEqual(validateResearchProviders(providers,primary,secondary),providers);
});
test('Phase18 explicit missing or malformed private files fail closed; absent optional path retains unattributed defaults',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'phase18-'));
 const path=join(dir,'providers.json'),env={RESEARCH_PROVIDERS_PATH:path,SOLANA_RPC_URL:primary,SOLANA_SECONDARY_RPC_URL:secondary};
 try{
  await assert.rejects(loadResearchProviders(env),/file unavailable or invalid JSON/);
  await writeFile(path,'{"SECRET":');await assert.rejects(loadResearchProviders(env),(e:Error)=>!String(e).includes('SECRET'));
  await writeFile(path,JSON.stringify([providers[0],{...providers[1],endpoint:primary}]));await assert.rejects(loadResearchProviders(env));
  await writeFile(path,JSON.stringify(providers));assert.deepEqual(await loadResearchProviders(env),providers);
  const fallback=await loadResearchProviders({});assert(fallback.every(p=>p.operator===undefined));
 }finally{await rm(dir,{recursive:true});}
});
test('Phase18 compose keeps private file read-only, paper mode, resource mounts and fencing; Docker context excludes secrets',async()=>{
 const compose=await readFile('compose.research.yaml','utf8');
 for(const required of ['RESEARCH_PROVIDERS_PATH: /app/private/research-providers.json','./private/research-providers.json:/app/private/research-providers.json:ro',
  'read_only: true','MODE: paper','REAL_MARKET_PAPER: "false"','restart: "no"','RESEARCH_OWNER_PATH:','RESEARCH_STOP_PATH:',
  'research-state:/app/data','research-control:/app/research-control','researchPolicyReview'])assert(compose.includes(required),required);
 assert((await readFile('.gitignore','utf8')).split('\n').includes('/private/'));
 assert((await readFile('.dockerignore','utf8')).split('\n').includes('/private/'));
});
test('Phase18 every research entrypoint validates configuration before creating output or ledger',async()=>{
 for(const phase of [8,9,10,11]){
  const source=await readFile(`scripts/phase${phase}-mainnet.ts`,'utf8');
  assert(source.indexOf('await loadResearchProviders()')<source.indexOf('await mkdir('));
  assert(!source.includes('JSON.parse(await readFile(process.env.RESEARCH_PROVIDERS_PATH'));
 }
 assert(!safeResearchIssue(Error(primary)).includes('SECRET'));
 assert.equal(safeResearchIssue({httpStatus:429,message:primary}),'Provider HTTP 429');
 assert.equal(safeResearchIssue({rpcCode:-32005,message:primary}),'Provider RPC -32005');
});
test('Phase18 HTTP health is read-only and rate limits and timeouts expose no remote secrets',async()=>{
 let calls=0;const server=createServer((_q,r)=>{calls++;if(calls===1){r.writeHead(429);r.end('SECRET');}});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{
  const endpoint=`http://127.0.0.1:${(server.address() as any).port}/SECRET`;
  const probe=new ReadOnlyProbe(endpoint,80,2);
  await assert.rejects(probe.read('getHealth',[]),(e:any)=>e.httpStatus===429);
  await assert.rejects(probe.read('getHealth',[]),(e:any)=>e.kind==='transport');
  assert(!JSON.stringify(probe.observations).includes('SECRET'));assert.equal(calls,2);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
test('Phase18 WebSocket close handshake completes and unexpected disconnect never establishes delivery',async()=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise<void>(r=>server.once('listening',r));
 let disconnect=false;
 server.on('connection',s=>s.on('message',b=>{const q=JSON.parse(b.toString());s.send(JSON.stringify({jsonrpc:'2.0',id:q.id,result:11}));if(disconnect)s.close(1011,'SECRET');}));
 try{
  const url=`ws://127.0.0.1:${(server.address() as any).port}`;
  const clean=await probeWebSocket(url,[{name:'unit',address:'11111111111111111111111111111111'}],80);
  assert.equal(clean.closeObserved,true);assert.equal(clean.closeCode,1000);assert.equal(clean.forcedTerminate,false);assert.equal(clean.status,'unknown');
  disconnect=true;const failed=await probeWebSocket(url,[{name:'unit',address:'11111111111111111111111111111111'}],80);
  assert.equal(failed.status,'failed');assert(!JSON.stringify(failed).includes('SECRET'));
 }finally{for(const c of server.clients)c.terminate();await new Promise<void>(r=>server.close(()=>r()));}
});

test('Phase18 malformed startup configuration exits before filesystem state creation in all research entrypoints',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'phase18-startup-'));
 try{
  const path=join(dir,'providers.json');await writeFile(path,'{"SECRET":');
  for(const phase of [8,9,10,11]){
   const output=join(dir,`phase${phase}`);
   const result=spawnSync(process.execPath,['--import','tsx',`scripts/phase${phase}-mainnet.ts`,'--run','--seconds','15','--output',output],
    {env:{...process.env,MODE:'paper',RESEARCH_PROVIDERS_PATH:path},encoding:'utf8',timeout:15000});
   assert.equal(result.error,undefined);assert.notEqual(result.status,0);assert.equal(existsSync(output),false);
   assert(result.stderr.includes('Research provider file unavailable or invalid JSON'));assert(!result.stderr.includes('SECRET'));
  }
 }finally{await rm(dir,{recursive:true});}
});

test('Phase18 WebSocket diagnostic processes at most 100 queued notifications and closes cleanly',async()=>{
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await new Promise<void>(r=>server.once('listening',r));
 server.on('connection',s=>s.on('message',b=>{const q=JSON.parse(b.toString());s.send(JSON.stringify({jsonrpc:'2.0',id:q.id,result:11}));
  for(let i=0;i<150;i++)s.send(JSON.stringify({jsonrpc:'2.0',method:'logsNotification',params:{subscription:11,result:{context:{slot:100},value:{signature:'1'.repeat(64),logs:[],err:null}}}}));
 }));
 try{
  const result=await probeWebSocket(`ws://127.0.0.1:${(server.address() as any).port}`,[{name:'unit',address:'11111111111111111111111111111111'}],1000);
  assert.equal(result.venues[0].notifications,100);assert.equal(result.closeCode,1000);assert.equal(result.forcedTerminate,false);
 }finally{for(const c of server.clients)c.terminate();await new Promise<void>(r=>server.close(()=>r()));}
});
