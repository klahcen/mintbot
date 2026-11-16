import { createHash, randomUUID } from 'node:crypto';
import { readFile, open, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { researchCoverage } from './coverage.js';
export interface CoverageEpoch {
 schemaVersion:1;id:string;createdAt:number;programs:string[];
 history:{path:string;sha256:string;unresolvedGaps:number;quarantined:number;sourceArtifact?:{path:string;sha256:string;bytes:number}}[];
 researchPolicyReview:'unmet';fundedAuthorized:false;
}
/** An epoch isolates measurement scope, never resets history or grants research permission. */
export async function createCoverageEpoch(output:string,programs:string[],historyPaths:string[]):Promise<CoverageEpoch>{
 if(historyPaths.length>16||new Set(historyPaths).size!==historyPaths.length)throw Error('Epoch history bound');
 const history=[];
 for(const path of historyPaths){
  if((await stat(path)).size>64*1024*1024)throw Error('Epoch history byte bound');
  const bytes=await readFile(path);
  const evidence=JSON.parse(bytes.toString());
  if(!evidence.endedAt||!Array.isArray(evidence.journal?.gaps)||!Number.isSafeInteger(evidence.journal?.quarantined))throw Error('Final historical coverage evidence required');
  history.push({path,sha256:createHash('sha256').update(bytes).digest('hex'),unresolvedGaps:evidence.journal.gaps.filter((g:{status:string})=>g.status!=='recovered').length,quarantined:evidence.journal.quarantined,...(evidence.sourceArtifact?{sourceArtifact:evidence.sourceArtifact}:{})});
 }
 const epoch:CoverageEpoch={schemaVersion:1,id:randomUUID(),createdAt:Date.now(),programs:[...programs],history,researchPolicyReview:'unmet',fundedAuthorized:false};
 const file=await open(output,'wx',0o600);try{await file.writeFile(JSON.stringify(epoch,null,2)+'\n');await file.sync();}finally{await file.close();}
 const directory=await open(dirname(output),'r');try{await directory.sync();}finally{await directory.close();}
 return epoch;
}
export function epochCoverage(epoch:CoverageEpoch,feed:Parameters<typeof researchCoverage>[0],journal:Parameters<typeof researchCoverage>[1],fatal?:string|null){
 const current=researchCoverage(feed,journal,fatal);
 return {status:current.status==='failed'?'failed' as const:'unknown' as const,currentWindow:current,
  reasons:[...current.reasons,'Independent review of run-scoped research coverage policy is unmet'],
  epochId:epoch.id,historicalUnresolved:epoch.history.reduce((n,h)=>n+h.unresolvedGaps,0),fundedAuthorized:false as const};
}
