import { readFile } from 'node:fs/promises';
/** Both Docker healthcheck and host monitoring use authenticated, DB-aware readiness. */
try {
  const {API_TOKEN}=JSON.parse(await readFile('/run/secrets/runtime.json','utf8'));
  const response=await fetch('http://127.0.0.1:3001/api/ops/health',{headers:{authorization:`Bearer ${API_TOKEN}`},signal:AbortSignal.timeout(5000)});
  if(!response.ok) throw Error();
  if(process.argv.includes('--report'))console.log(JSON.stringify(await response.json()));
} catch { console.error('Application readiness failed');process.exitCode=1; }
