/** Diagnostic transports have no execution, signing, recovery or approval capability. */
import WebSocket from 'ws';
import { createHash } from 'node:crypto';
import { hasDuplicateJsonKeys, transactionIdentityIssue } from './wire-identity.js';
const methods = new Set(['getHealth','getGenesisHash','getSlot','getVersion','getFirstAvailableBlock',
  'getSignaturesForAddress','getTransaction','getMultipleAccounts']);
export class ProbeFailure extends Error {
  constructor(readonly kind: 'transport'|'http'|'rpc'|'identity'|'bound', readonly httpStatus?:number, readonly rpcCode?:number) {
    super(`Diagnostic ${kind} failure`);
  }
}
export class ReadOnlyProbe {
  private sequence=0;
  readonly observations: {method:string;at:number;elapsedMs:number;ok:boolean;httpStatus?:number;rpcCode?:number;kind?:string}[]=[];
  constructor(private endpoint:string, private timeoutMs=4000, private maximumCalls=40) {
    if(!['https:','http:'].includes(new URL(endpoint).protocol) || !Number.isInteger(timeoutMs) || timeoutMs<1 || timeoutMs>8000 ||
      !Number.isInteger(maximumCalls)||maximumCalls<1||maximumCalls>80)throw new ProbeFailure('bound');
  }
  async read(method:string, params:unknown[]):Promise<any>{
    if(!methods.has(method)||this.sequence>=this.maximumCalls||Buffer.byteLength(JSON.stringify(params))>65536)throw new ProbeFailure('bound');
    const id=++this.sequence,at=Date.now(),began=performance.now();
    try{
      const response=await fetch(this.endpoint,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({jsonrpc:'2.0',id,method,params}),signal:AbortSignal.timeout(this.timeoutMs),redirect:'error'});
      if(!response.ok||!response.body){await response.body?.cancel();throw new ProbeFailure('http',response.status);}
      const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
      try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;
        if(length>4*1024*1024){await reader.cancel();throw new ProbeFailure('bound');}chunks.push(part.value);}}
      finally{reader.releaseLock();}
      const body=JSON.parse(Buffer.concat(chunks).toString());
      if(body.id!==id||body.jsonrpc!=='2.0')throw new ProbeFailure('identity');
      if(body.error)throw new ProbeFailure('rpc',undefined,Number.isInteger(body.error.code)?body.error.code:undefined);
      if(!Object.hasOwn(body,'result'))throw new ProbeFailure('identity');
      this.observations.push({method,at,elapsedMs:performance.now()-began,ok:true});return body.result;
    }catch(error){const safe=error instanceof ProbeFailure?error:new ProbeFailure('transport');
      this.observations.push({method,at,elapsedMs:performance.now()-began,ok:false,kind:safe.kind,httpStatus:safe.httpStatus,rpcCode:safe.rpcCode});throw safe;}
  }
}
export async function probeWebSocket(endpoint:string|undefined, programs:readonly {name:string;address:string}[], durationMs=12000){
  if(!endpoint)return {status:'missing',venues:[],scope:'No endpoint configured; no fallback inferred'};
  if(!['ws:','wss:'].includes(new URL(endpoint).protocol)||!Number.isInteger(durationMs)||durationMs<20||durationMs>20000||programs.length<1||programs.length>4)throw new ProbeFailure('bound');
  return new Promise<any>(resolve=>{
    const rows=programs.map((p,i)=>({venue:p.name,requestId:i+1,subscriptionId:undefined as number|undefined,ack:false,notifications:0,validIdentities:0,invalidIdentities:0,firstReceiptAt:undefined as number|undefined,lastReceiptAt:undefined as number|undefined}));
    let opened=false,failures=0,pongs=0,finished=false,invalidEnvelopes=0;
    const socket=new WebSocket(endpoint,{handshakeTimeout:Math.min(durationMs,5000),maxPayload:1024*1024,followRedirects:false});
    const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);
      let forcedTerminate=false;
      const closeTimer=setTimeout(()=>{forcedTerminate=true;socket.terminate();},500);
      const publish=(closeObserved:boolean,closeCode?:number)=>{clearTimeout(closeTimer);resolve({closeObserved,closeCode,forcedTerminate,status:!opened?'unavailable':failures?'failed':rows.every(r=>r.ack&&r.validIdentities>0)?'observed-delivery':'unknown',opened,pongs,failures,invalidEnvelopes,venues:rows,
      scope:'Bounded finalized logs subscriptions; acknowledgements and valid-identity delivery only. Quiet venues remain unknown; no completeness, authentication or operator independence inferred.'});};
      socket.once('close',(code)=>publish(true,code));
      if(socket.readyState===WebSocket.OPEN)socket.close(1000,'Bounded diagnostic complete');
      else if(socket.readyState===WebSocket.CONNECTING)socket.terminate();
      else if(socket.readyState===WebSocket.CLOSED)publish(true);
    };
    const timer=setTimeout(finish,durationMs);
    socket.on('open',()=>{opened=true;rows.forEach((r,i)=>socket.send(JSON.stringify({jsonrpc:'2.0',id:r.requestId,method:'logsSubscribe',params:[{mentions:[programs[i].address]},{commitment:'finalized'}]})));socket.ping();});
    socket.on('pong',()=>pongs++);
    socket.on('message',bytes=>{if(finished)return;try{const text=bytes.toString();const m=JSON.parse(text);if(hasDuplicateJsonKeys(text))throw Error();if(m.jsonrpc!=='2.0')throw Error();
      if(m.id!==undefined){const row=rows.find(r=>r.requestId===m.id);if(!row||row.ack||!Number.isSafeInteger(m.result)||rows.some(r=>r.subscriptionId===m.result))throw Error();row.ack=true;row.subscriptionId=m.result;return;}
      const row=rows.find(r=>r.subscriptionId===m.params?.subscription);
      if(m.method!=='logsNotification'||!row||!row.ack||(!Number.isSafeInteger(m.params?.result?.context?.slot)||m.params.result.context.slot<0))throw Error();
      const value=m.params.result.value;row.notifications++;if(rows.reduce((n,r)=>n+r.notifications,0)>=100)finish();
      if(transactionIdentityIssue(value?.signature))row.invalidIdentities++;else{row.validIdentities++;row.firstReceiptAt??=Date.now();row.lastReceiptAt=Date.now();}
    }catch{invalidEnvelopes++;}});
    socket.on('error',()=>{failures++;finish();});socket.on('close',()=>{if(!finished){failures++;finish();}});
  });
}
export function compareAccountBanks(rows: {id:string;result:any}[]) {
  const valid=rows.length>=2 && rows.every(r=>Number.isSafeInteger(r.result?.context?.slot)&&Array.isArray(r.result?.value)&&r.result.value.length>0&&r.result.value.every((a:any)=>a!==null));
  const sameBank=!!valid&&new Set(rows.map(r=>r.result.context.slot)).size===1;
  const digest=(v:any):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
  const hashes=rows.map(r=>({id:r.id,slot:r.result?.context?.slot,sha256:r.result?.value?createHash('sha256').update(digest(r.result.value)).digest('hex'):undefined}));
  return {status:!sameBank?'unknown':new Set(hashes.map(r=>r.sha256)).size===1?'matching-reported-bank':'conflict',sameBank,observations:hashes,executionEligible:false};
}
