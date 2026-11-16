import { statSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname } from 'node:path';
/** Presence is a sticky fail-closed stop fence. APIs cannot reset a running research epoch. */
export function assertResearchNotStopped(path?:string){if(!path)return;try{statSync(path);}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return;throw error;}throw Error('Research global stop fence active');}
export async function requestResearchStop(path:string,action:'stop'|'kill'){
 let file;
 try{file=await open(path,'wx',0o600);}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;}
 if(file)try{await file.writeFile(JSON.stringify({schemaVersion:1,action,requestedAt:Date.now(),liveTrading:false})+'\n');await file.sync();}finally{await file.close();}
 const directory=await open(dirname(path),'r');try{await directory.sync();}finally{await directory.close();}
 return {status:'requested' as const,action,scope:'Durable stop intent; sidecar completion must be confirmed from its stopped status. No restart/reset granted.'};
}
