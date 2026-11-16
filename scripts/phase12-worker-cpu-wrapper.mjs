/** Diagnostic observation surrounds the unchanged actual worker entrypoint, no protocol messages added. */
import {workerData,threadId} from 'node:worker_threads';
import {appendFileSync,readlinkSync} from 'node:fs';
const tid=readlinkSync('/proc/thread-self').split('/').at(-1);
function emit(){appendFileSync(workerData.__phase12CpuLog,JSON.stringify({kind:'wal-worker',pid:process.pid,tid,threadId,entrypoint:workerData.__phase12Original,journalPath:workerData.journal.path,monotonicNs:process.hrtime.bigint().toString(),cpu:process.threadCpuUsage()})+'\n');}
emit();setInterval(emit,20).unref();
await import(workerData.__phase12Original);
