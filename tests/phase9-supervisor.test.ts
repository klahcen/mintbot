import test from "node:test";
import assert from "node:assert/strict";
import {EventEmitter}from"node:events";
import {MonitorSupervisor}from"../src/research/monitor-supervisor.js";
import{SolanaMonitor,VERIFIED_PROGRAMS}from"../src/chain.js";
function setup(extra:object={},observe:()=>void=()=>{}){let now=0,next=0;const tasks=new Map<number,{at:number;fn:()=>void}>(),sockets:Fake[]=[];
 class Fake extends EventEmitter{sent:string[]=[];send(v:string){this.sent.push(v);}close(){}terminate(){}}
 const scheduler={schedule:(fn:()=>void,ms:number)=>{tasks.set(++next,{at:now+ms,fn});return next;},cancel:(id:unknown)=>{tasks.delete(id as number);}};
 const supervisor=new MonitorSupervisor(["wss://first.invalid","wss://second.invalid"],VERIFIED_PROGRAMS.slice(0,1),observe, {clock:()=>now,wallClock:()=>now,scheduler,ackTimeoutMs:100,receiptStaleMs:1000,stableMs:50,cooldownMs:100,attemptsPerIncident:1,maxConnections:3,maxIncidents:5,maxDurationMs:10000,socketFactory:()=>{const socket=new Fake();sockets.push(socket);return socket;},...extra});
 const advance=(ms:number)=>{const end=now+ms;let guard=0;for(;;){const due=[...tasks].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;if(++guard>1000)throw Error("Unbounded scheduler");tasks.delete(due[0]);now=due[1].at;due[1].fn();}now=end;};
 const ready=()=>{const socket=sockets.at(-1)!;socket.emit("open");socket.emit("message",JSON.stringify({jsonrpc:"2.0",id:1,result:9}));};
 const receipt=()=>sockets.at(-1)!.emit("message",JSON.stringify({method:"logsNotification",params:{subscription:9,result:{context:{slot:12},value:{signature:"unit-public-sig",logs:[],err:null}}}}));return{supervisor,sockets,advance,ready,receipt};}
test("Subscribed socket alone is not healthy; receipts stale, missing ACK and circuit budgets are bounded",()=>{
 const c=setup();c.supervisor.start();c.ready();assert.equal(c.supervisor.snapshot().liveReady,false);c.receipt();assert.equal(c.supervisor.snapshot().liveReady,true);c.advance(1200);assert(c.supervisor.snapshot().incidents>=1);c.advance(8000);assert.equal(c.supervisor.snapshot().state,"terminal");assert.equal(c.supervisor.snapshot().connections,3);c.supervisor.stop();
});
test("Fresh subscriptions resynchronize after incident, provider cooldown switches endpoints, stale socket callbacks are ignored",()=>{
 const c=setup({maxConnections:6});c.supervisor.start();c.ready();c.receipt();const old=c.sockets[0]!;old.emit("error",Object.assign(Error("Invalid WebSocket frame: invalid status code 1006"),{code:"WS_ERR_INVALID_CLOSE_CODE"}));c.advance(1000);assert.equal(c.supervisor.snapshot().provider,1);c.ready();c.receipt();assert.equal(c.supervisor.snapshot().liveReady,true);const incidents=c.supervisor.snapshot().incidents;old.emit("close",1006);assert.equal(c.supervisor.snapshot().incidents,incidents);assert(c.supervisor.snapshot().events.some(e=>e.code==="WS_ERR_INVALID_CLOSE_CODE"));c.supervisor.stop();
});
test("Stable receipts reset only incident attempts; finite run deadline freezes durations and cannot auto restart",()=>{
 const c=setup({maxDurationMs:500,ackTimeoutMs:400});c.supervisor.start();c.ready();c.receipt();c.advance(60);c.receipt();assert.equal(c.supervisor.snapshot().attemptsThisIncident,0);c.advance(440);assert.equal(c.supervisor.snapshot().state,"stopped");const elapsed=c.supervisor.snapshot().elapsedMs;c.advance(2000);assert.equal(c.supervisor.snapshot().elapsedMs,elapsed);c.supervisor.start();assert.equal(c.supervisor.snapshot().connections,1);
});
test("Observer failure closes the socket and produces a terminal state instead of an untracked retry",()=>{
 const c=setup({onDisconnect:()=>{throw Error("WAL unavailable");}});c.supervisor.start();c.ready();c.sockets[0]!.emit("close",1006);assert.equal(c.supervisor.snapshot().state,"terminal");assert(c.supervisor.snapshot().events.some(e=>e.kind==="terminal-observer-failure"));c.advance(9000);assert.equal(c.supervisor.snapshot().connections,1);
});
test("Backpressure pauses fence old sockets and resume without resetting lifetime budgets or deadline",()=>{
 const c=setup({maxConnections:2});c.supervisor.start();c.ready();c.receipt();c.supervisor.pauseForBackpressure();assert.equal(c.supervisor.snapshot().state,"paused");assert.equal(c.supervisor.snapshot().liveReady,false);c.advance(500);assert.equal(c.supervisor.snapshot().connections,1);c.supervisor.resumeAfterBackpressure();assert.equal(c.supervisor.snapshot().connections,2);c.ready();c.receipt();c.supervisor.pauseForBackpressure();c.supervisor.resumeAfterBackpressure();assert.equal(c.supervisor.snapshot().state,"terminal");assert.equal(c.supervisor.snapshot().connections,2);
});

test("Terminal supervisor completion wakes its controller exactly once and fences further work",()=>{
 const reasons:string[]=[];const c=setup({maxConnections:1,onStopped:(reason:string)=>reasons.push(reason)});
 c.supervisor.start();c.advance(1000);
 assert.equal(c.supervisor.snapshot().state,"terminal");assert.deepEqual(reasons,["terminal-budget-exhausted"]);
 c.supervisor.stop();c.advance(20000);assert.equal(reasons.length,1);
});
test("Synchronous observation failures terminate instead of being retried as provider faults",()=>{
 const reasons:string[]=[];const c=setup({onStopped:(reason:string)=>{reasons.push(reason);throw Error("controller failed");}},()=>{throw Error("gap persistence failed");});
 c.supervisor.start();c.ready();c.receipt();
 assert.equal(c.supervisor.snapshot().state,"terminal");assert.equal(c.supervisor.snapshot().liveReady,false);
 assert.deepEqual(reasons,["terminal-observer-failure"]);c.advance(20000);assert.equal(c.supervisor.snapshot().connections,1);
});

test("Subscription readiness requires one unique acknowledged request for every program",()=>{
 for(const acknowledgements of [ [[1,9],[1,10]], [[1,9],[2,9]], [[1,-1]], [[1,1.5]] ]){
  const socket=new EventEmitter() as any;socket.send=()=>{};socket.close=()=>{};
  let ready=0;const errors:string[]=[];
  const monitor=new SolanaMonitor("wss://unit.invalid",VERIFIED_PROGRAMS.slice(0,2),()=>{}, {maxReconnects:0,onReady:()=>ready++,onError:e=>errors.push(e.message)},()=>socket);
  monitor.start();socket.emit("open");
  for(const [id,result] of acknowledgements)socket.emit("message",JSON.stringify({id,result}));
  assert.equal(ready,0);assert(errors.some(e=>e.includes("acknowledgement")));monitor.stop();
 }
 const socket=new EventEmitter() as any;socket.send=()=>{};socket.close=()=>{};let ready=0;
 const monitor=new SolanaMonitor("wss://unit.invalid",VERIFIED_PROGRAMS.slice(0,2),()=>{}, {onReady:()=>ready++},()=>socket);
 monitor.start();socket.emit("open");
 for(const [id,result] of [[1,9],[1,9],[2,10],[2,10]])socket.emit("message",JSON.stringify({id,result}));
 assert.equal(ready,1);monitor.stop();
});

test("Provider JSON-RPC subscription errors retain bounded reason and code with endpoint redaction",()=>{
 const c=setup();c.supervisor.start();c.sockets[0]!.emit("open");
 c.sockets[0]!.emit("message",JSON.stringify({id:1,error:{code:429,message:"Rate limit at https://unit.invalid/?key=secret "+"x".repeat(300)}}));
 const incident=c.supervisor.snapshot().events.find(e=>e.kind==="incident");
 assert.equal(incident?.code,429);assert.match(incident?.reason??"",/Rate limit at \[endpoint\]/);
 assert(!incident?.reason?.includes("secret"));assert((incident?.reason?.length??0)<=200);
 assert.equal(c.supervisor.snapshot().liveReady,false);c.supervisor.stop();
});

test("Host suspension or forward/backward wall-clock discontinuity terminates coverage immediately",()=>{
 for(const jump of [6000,-6000]){
  let wall=0;const reasons:string[]=[];const c=setup({wallClock:()=>wall,onStopped:(reason:string)=>reasons.push(reason)});
  c.supervisor.start();c.ready();c.receipt();wall=jump;
  const snapshot=c.supervisor.snapshot();assert.equal(snapshot.state,"terminal");assert.equal(snapshot.liveReady,false);
  assert.equal(snapshot.clockDiscontinuityMs,jump);assert.deepEqual(reasons,["terminal-clock-discontinuity"]);
  c.advance(20000);assert.equal(c.supervisor.snapshot().connections,1);assert.equal(reasons.length,1);
 }
});
test("A notification after suspension cannot reset freshness or enter the observer before a delayed watchdog runs",()=>{
 let wall=0,observed=0;const c=setup({wallClock:()=>wall},()=>{observed++;});
 c.supervisor.start();c.ready();wall=7200001;c.receipt();
 assert.equal(observed,0);assert.equal(c.supervisor.snapshot().state,"terminal");assert.equal(c.supervisor.snapshot().liveReady,false);
});
