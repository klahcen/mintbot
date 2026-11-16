/** Matched read-only controls. Never owns WAL candidates or authorizes paper work. */
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import WebSocket from 'ws';
import { MonitorSupervisor } from '../src/research/monitor-supervisor.js';
import { VERIFIED_PROGRAMS } from '../src/chain.js';
import { transactionIdentityIssue } from '../src/research/wire-identity.js';
const args=process.argv.slice(2), option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
if(!args.includes('--run')) throw Error('Explicit --run required');
const seconds=Number(option('--seconds','60'));
if(!Number.isSafeInteger(seconds)||seconds<10||seconds>300) throw Error('10–300 second diagnostic bound');
const output=option('--output','docs/phase14/delivery-control.json');
const programs=VERIFIED_PROGRAMS.filter(p=>p.name==='meteora-dlmm');
const startWall=Date.now(), startMono=performance.now(), endMono=startMono+seconds*1000;
const rows=await Promise.all(['solana-rpc.publicnode.com','api.mainnet-beta.solana.com'].map(async host=>{
 const row={host,programs,requests:[],acks:[],socketEvents:[],normalizedNotifications:0,logEnvelopes:0,allMessages:0,
  invalidIdentities:0,issues:{},samples:[],wire:[],wireDropped:0,errors:[],history:[]};
 let bytes=0,connection=0;
 const stamp=()=>({at:Date.now(),offsetMs:performance.now()-startMono,connection});
 const monitor=new MonitorSupervisor([`wss://${host}`],programs,event=>{
  row.normalizedNotifications++;row.firstReceiptAt??=event.observedAt;row.lastReceiptAt=event.observedAt;
  const issue=transactionIdentityIssue(event.signature);
  if(issue){row.invalidIdentities++;row.issues[issue]=(row.issues[issue]??0)+1;}
  if(!issue&&row.samples.length<3)row.samples.push({...event});
 },{maxDurationMs:seconds*1000,maxConnections:8,maxIncidents:8,strictRpcNotifications:true,
  onIdentityTrace:trace=>{const size=Buffer.byteLength(JSON.stringify(trace));if(bytes+size<=2*1024*1024){row.wire.push(trace);bytes+=size;}else row.wireDropped++;},
  onError:error=>{if(row.errors.length<32)row.errors.push({...stamp(),message:error.message.replace(/(?:https?|wss?):\/\/\S+/g,'[endpoint]')});},
  socketFactory:url=>{
   connection++;const socket=new WebSocket(url,{maxPayload:262144,handshakeTimeout:10000});
   const send=socket.send.bind(socket);socket.send=(data,...rest)=>{
    try{const request=JSON.parse(String(data));if(row.requests.length<64)row.requests.push({...stamp(),request});}catch{}
    return send(data,...rest);
   };
   for(const kind of ['open','close','ping','pong','error'])socket.on(kind,(value)=>{
    if(row.socketEvents.length<256)row.socketEvents.push({...stamp(),kind,code:kind==='error'?value.code:kind==='close'?value:undefined});
   });
   socket.on('message',raw=>{
    row.allMessages++;try{const m=JSON.parse(raw.toString());if(m.method==='logsNotification')row.logEnvelopes++;
     if(m.id!==undefined&&row.acks.length<64)row.acks.push({...stamp(),message:m});}catch{}
   });return socket;
  }});
 monitor.start();
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,endMono-performance.now())));
 monitor.stop();row.supervisor=monitor.snapshot();row.end={...stamp()};
 // Separate bounded finalized samples; limit 10 is explicitly not complete chain history.
 let id=0;
 async function rpc(method,params){const request={jsonrpc:'2.0',id:++id,method,params},at=Date.now();
  const response=await fetch(`https://${host}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(8000)});
  if(!response.ok){await response.body?.cancel();throw Error(`HTTP ${response.status}`);}
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>4*1024*1024){await reader.cancel();throw Error('RPC byte bound');}chunks.push(part.value);}}finally{reader.releaseLock();}
  const body=JSON.parse(Buffer.concat(chunks).toString());row.history.push({at,request,response:body});if(body.id!==id||body.jsonrpc!=='2.0'||body.error)throw Error(`RPC response identity/error ${body.error?.code??''}`);
  return body.result;
 }
 try{row.genesis=await rpc('getGenesisHash',[]);}catch(error){row.genesisIssue=error.message;}
 try{row.recentFinalized=await rpc('getSignaturesForAddress',[programs[0].address,{limit:10,commitment:'finalized'}]);}catch(error){row.historyIssue=error.message;}
 const subject=row.samples[0]?.signature??row.recentFinalized?.find(x=>x.err===null)?.signature;
 if(subject)try{const tx=await rpc('getTransaction',[subject,{commitment:'finalized',encoding:'json',maxSupportedTransactionVersion:0}]);
  row.finalizedSample={signature:subject,source:row.samples[0]?.signature===subject?'delivered':'history',available:!!tx,
   identityMatches:tx?.transaction?.signatures?.[0]===subject,programInvocation:tx?.meta?.logMessages?.includes(`Program ${programs[0].address} invoke [1]`)??false};
 }catch(error){row.transactionIssue=error.message;}
 row.invalidNormalizedRate=row.normalizedNotifications?row.invalidIdentities/row.normalizedNotifications:null;
 row.scope='Normalized-rate denominator includes every delivered normalized identity; malformed/unrouted envelopes counted separately by wire outcome. Finalized history is clipped sample, never total chain events or recovered coverage.';
 return row;
}));
await mkdir('docs/phase14',{recursive:true});
await writeFile(output,JSON.stringify({startedAt:startWall,endedAt:Date.now(),requestedSeconds:seconds,
 controlWindowMs:seconds*1000,rows,independentProviderPolicy:false,coverageAuthorized:false,paperEntries:0,paperExits:0,liveTrading:false,
 scope:'Concurrent same-program controls with shared stop deadline. Per-connection ACK/receipt intervals differ and are retained. Follow-up finalized reads excluded from monitoring duration. No research decisions or coverage recovery.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(rows.map(r=>({host:r.host,notifications:r.normalizedNotifications,acks:r.acks.length,invalid:r.invalidIdentities,errors:r.errors,finalizedSample:r.finalizedSample}))));
