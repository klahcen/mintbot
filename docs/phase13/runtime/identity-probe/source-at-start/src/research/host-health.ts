import { readFile } from 'node:fs/promises';
import { dirname,join } from 'node:path';
import { createHash } from 'node:crypto';
export interface ClockHealthRecord {
 requestedSeconds:number;actualMonotonicSeconds:number;stableForRequestedInterval:boolean;
 issues:string[];containerSamples:number;containerBoundsPassed:boolean;
 endedClocksNs:{realtime:number;monotonic:number};maxSampleMonotonicIntervalMs:number;
 maxAbsRealtimeMonotonicStepMs:number;
}
/** Process timing preflight only. Never changes a chain timestamp or grants research/trading authorization. */
export function validateHostHealth(e:ClockHealthRecord,seconds:number,nowWallMs:number,nowMonoMs:number){
 if(!Number.isInteger(seconds)||seconds<15||seconds>7200||!e||e.stableForRequestedInterval!==true||!Array.isArray(e.issues)||e.issues.length||e.containerBoundsPassed!==true||!Number.isInteger(e.containerSamples)||e.containerSamples<2||!Number.isFinite(e.actualMonotonicSeconds)||e.actualMonotonicSeconds<seconds||!Number.isInteger(e.requestedSeconds)||e.requestedSeconds<seconds||!Number.isFinite(e.maxSampleMonotonicIntervalMs)||e.maxSampleMonotonicIntervalMs>3000||!Number.isFinite(e.maxAbsRealtimeMonotonicStepMs)||e.maxAbsRealtimeMonotonicStepMs>1000)throw Error('Host health interval/bounds not established');
 const endWall=e.endedClocksNs?.realtime/1e6,endMono=e.endedClocksNs?.monotonic/1e6,wallAge=nowWallMs-endWall,monoAge=nowMonoMs-endMono;
 // Nanosecond JSON numbers are used only as millisecond timing bounds (sub-ms rounding), never chain quantities.
 if(![endWall,endMono,wallAge,monoAge].every(Number.isFinite)||Math.min(wallAge,monoAge)<-1||Math.max(wallAge,monoAge)>900000||Math.abs(wallAge-monoAge)>1000)throw Error('Host health evidence stale, clock-discontinuous, or from another monotonic origin');
 return {status:'bounded-stability-observed' as const,validatedBudgetSeconds:seconds,evidenceAgeMs:Math.max(wallAge,monoAge),tradingAuthorized:false as const};
}
export async function loadHostHealth(path:string,seconds:number){
 const bytes=await readFile(path);if(bytes.length>65536)throw Error('Host health evidence byte bound');
 const e:ClockHealthRecord=JSON.parse(bytes.toString());
 const facts=JSON.parse(await readFile(join(dirname(path),'system-start.json'),'utf8'));
 const boot=createHash('sha256').update(await readFile('/proc/sys/kernel/random/boot_id','utf8')).digest('hex');
 if(facts.bootIdSha256!==boot)throw Error('Host health evidence boot identity mismatch');
 const status=validateHostHealth(e,seconds,Date.now(),Number(process.hrtime.bigint())/1e6);
 return {...status,evidenceSha256:createHash('sha256').update(bytes).digest('hex'),scope:'Same-boot bounded timing preflight. Does not prove future host stability, chain coverage, provider agreement or policy approval.'};
}
