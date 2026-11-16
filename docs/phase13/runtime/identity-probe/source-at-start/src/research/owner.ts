import { open, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { dirname } from 'node:path';
/** Shared-filesystem owner fence. Never infers a foreign container's liveness from its PID. */
export async function acquireResearchOwner(path:string){
 const token=randomUUID(),payload=JSON.stringify({token,host:hostname(),pid:process.pid,createdAt:Date.now(),scope:'single research decision owner; no automatic stale-lock takeover'})+'\n';
 const file=await open(path,'wx',0o600);
 try{await file.writeFile(payload);await file.sync();}finally{await file.close();}
 const syncDirectory=async()=>{const d=await open(dirname(path),'r');try{await d.sync();}finally{await d.close();}};
 await syncDirectory();
 return async()=>{if(await readFile(path,'utf8')!==payload)throw Error('Research owner token changed; offline inspection required');await unlink(path);await syncDirectory();};
}
