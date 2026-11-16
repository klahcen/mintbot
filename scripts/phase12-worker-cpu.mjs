/** Diagnostic-only preload: identify actual WAL workers without changing their messages/acknowledgement. */
import workers from 'node:worker_threads';
import {syncBuiltinESMExports} from 'node:module';
import {appendFileSync,readlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
if(workers.isMainThread){
const log=process.env.PHASE12_CPU_LOG;
if(!log)throw Error('Diagnostic CPU output required');
function emit(){appendFileSync(log,JSON.stringify({kind:'main',pid:process.pid,tid:readlinkSync('/proc/thread-self').split('/').at(-1),monotonicNs:process.hrtime.bigint().toString(),performanceMs:performance.now(),cpu:process.threadCpuUsage()})+'\n');}
emit();setInterval(emit,20).unref();
const Original=workers.Worker;
workers.Worker=class extends Original{
 constructor(file,options={}){
  const href=file instanceof URL?file.href:pathToFileURL(resolve(String(file))).href;
  if(/journal-worker(?:-bootstrap)?\.(?:mjs|js|ts)$/.test(href))super(new URL('./phase12-worker-cpu-wrapper.mjs',import.meta.url),{...options,workerData:{...options.workerData,__phase12Original:href,__phase12CpuLog:log}});
  else super(file,options);
 }
};
syncBuiltinESMExports();

}
