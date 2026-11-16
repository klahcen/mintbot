/** File-based secrets: never interpolated by Compose or retained in image layers. */
import { readFile } from 'node:fs/promises';
const keys = ['API_TOKEN','POSTGRES_PASSWORD','SOLANA_RPC_URL','SOLANA_WS_URL','SOLANA_SECONDARY_RPC_URL','SOLANA_SECONDARY_WS_URL'];
export function validateCloudRuntime(value: unknown): Record<string,string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid cloud credentials');
  const record=value as Record<string,unknown>;
  if (Object.keys(record).some(k=>!keys.includes(k)) || keys.some(k=>typeof record[k]!=='string')) throw Error('Invalid cloud credentials');
  const r=record as Record<string,string>;
  if(r.API_TOKEN!.length<32 || /REPLACE|[\r\n]/.test(r.API_TOKEN!) || !/^[a-fA-F0-9]{32,}$/.test(r.POSTGRES_PASSWORD!)) throw Error('Invalid cloud credentials');
  for(const k of keys.slice(2)) {
    let url: URL;try { url=new URL(r[k]!); } catch { throw Error('Invalid cloud credentials'); }
    if(url.protocol!==(k.includes('WS_URL')?'wss:':'https:') || url.username || url.password) throw Error('Invalid cloud credentials');
  }
  return r;
}
async function main(){
  const target=process.argv[2];
  if(!['server','research','diagnostic'].includes(target??'') || process.env.MODE!=='paper' || process.env.REAL_MARKET_PAPER!=='false') throw Error('Cloud safety precondition');
  const config=validateCloudRuntime(JSON.parse(await readFile('/run/secrets/runtime.json','utf8')));
  Object.assign(process.env,config);
  if(target==='server') {
    process.env.CLOUD_DEPLOYMENT='true';
    process.env.DATABASE_URL=`postgres://mintbot:${config.POSTGRES_PASSWORD}@postgres:5432/mintbot`;
    await import('../src/server.js');
  } else if(target==='diagnostic') {
    process.argv=[process.argv[0]!,process.argv[1]!,...process.argv.slice(3)];
    await import('./phase18-rpc-diagnostics.js');
  } else {
    // Existing bounded entrypoint owns all locks, stop, clock, coverage and WAL gates.
    process.argv=[process.argv[0]!,process.argv[1]!,...process.argv.slice(3)];
    await import('./phase11-mainnet.js');
  }
}
if(process.argv[1]?.endsWith('/cloud-runtime.js') || process.argv[1]?.endsWith('/cloud-runtime.ts'))
  main().catch(()=>{console.error('Cloud startup failed; inspect credentials, database and retained safety status locally');process.exitCode=1;});
