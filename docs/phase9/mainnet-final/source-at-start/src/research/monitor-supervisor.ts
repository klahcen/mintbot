import WebSocket from "ws";
import { performance } from "node:perf_hooks";
import { SolanaMonitor,type ProgramDefinition,type ProgramObservation,type MonitorOptions,type MonitorScheduler,type SocketLike } from "../chain.js";
import { Telemetry } from "../telemetry.js";
export interface SupervisorOptions extends Pick<MonitorOptions,"onReady"|"onDisconnect"|"onError"> {
 metrics?:Telemetry; maxDurationMs?:number; maxConnections?:number; maxIncidents?:number;
 attemptsPerIncident?:number; cooldownMs?:number; stableMs?:number; ackTimeoutMs?:number; receiptStaleMs?:number;
 scheduler?:MonitorScheduler; clock?:()=>number; socketFactory?:(url:string)=>SocketLike;
}
/** Bounded run + per-incident retry budgets. Successful subscriptions alone never establish receipt coverage. */
export class MonitorSupervisor {
 private metrics:Telemetry;private clock:()=>number;private scheduler:MonitorScheduler;
 private active?:SolanaMonitor;private socket?:SocketLike;private timer?:unknown;private watch?:unknown;private deadline?:unknown;
 private started=false;private ended?:number;private stopped=true;private terminal=false;private paused=false;private generation=0;private began=0;private connectedAt?:number;private acked=false;private receiptAt?:number;
 private attempts=0;private connections=0;private incidents=0;private provider=0;private cooldowns:number[];private stableSince?:number;
 private intervals:{provider:number;fromMs:number;toMs:number;subscribed:boolean;lastReceiptMs?:number}[]=[];private intervalStart?:number;
 private events:{atMs:number;provider:number;kind:string;code?:string|number;reason?:string}[]=[];
 constructor(private urls:string[],private programs:readonly ProgramDefinition[],private observe:(e:ProgramObservation)=>void,private options:SupervisorOptions={}){
  if(!urls.length||urls.length>3||new Set(urls).size!==urls.length||urls.some(u=>!/^wss?:\/\//.test(u)))throw Error("Supervisor providers bound");
  for(const [v,min,max]of [[options.maxDurationMs??7200000,100,86400000],[options.maxConnections??512,1,1000],[options.maxIncidents??256,1,1000],[options.attemptsPerIncident??3,1,10],[options.cooldownMs??30000,1,300000],[options.stableMs??30000,0,300000],[options.ackTimeoutMs??10000,1,60000],[options.receiptStaleMs??30000,1,300000]])if(!Number.isSafeInteger(v)||v<min||v>max)throw Error("Supervisor budget bound");
  this.metrics=options.metrics??new Telemetry();this.clock=options.clock??(()=>performance.now());this.scheduler=options.scheduler??{schedule:(fn,ms)=>setTimeout(fn,ms),cancel:t=>clearTimeout(t as ReturnType<typeof setTimeout>)};this.cooldowns=urls.map(()=>0);
 }
 private event(kind:string,code?:string|number,reason?:string){this.events.push({atMs:this.clock()-this.began,provider:this.provider,kind,code,reason});if(this.events.length>2048)this.events.shift();}
 start(){if(this.started)return;this.started=true;this.stopped=false;this.began=this.clock();this.deadline=this.scheduler.schedule(()=>this.finish("run-deadline"),this.options.maxDurationMs??7200000);this.connect();}
 private closeInterval(){if(this.intervalStart!==undefined){this.intervals.push({provider:this.provider,fromMs:this.intervalStart-this.began,toMs:this.clock()-this.began,subscribed:this.acked,lastReceiptMs:this.receiptAt===undefined?undefined:this.receiptAt-this.began});if(this.intervals.length>1000)this.intervals.shift();this.intervalStart=undefined;}}
 private finish(reason:string){if(this.stopped)return;this.closeInterval();this.ended=this.clock();this.stopped=true;this.terminal=reason!=="operator-stop"&&reason!=="run-deadline";this.generation++;for(const t of[this.timer,this.watch,this.deadline])if(t!==undefined)this.scheduler.cancel(t);this.active?.stop();try{(this.socket as any)?.terminate?.();}catch{}this.event(reason);}
 stop(){this.finish("operator-stop");}
 failClosed(){this.finish("terminal-ingestion-failed");}
 pauseForBackpressure(){
  if(this.stopped||this.paused)return;
  this.closeInterval();this.paused=true;this.generation++;this.incidents++;
  for(const timer of[this.timer,this.watch])if(timer!==undefined)this.scheduler.cancel(timer);
  this.active?.stop();try{(this.socket as any)?.terminate?.();}catch{}
  this.acked=false;this.receiptAt=undefined;this.metrics.increment("supervisor.backpressure_pauses");this.event("backpressure-pause");
  try{this.options.onDisconnect?.({latestSlot:this.active?.latestSlot??0});}catch{this.finish("terminal-observer-failure");}
 }
 resumeAfterBackpressure(){if(this.stopped||!this.paused)return;this.paused=false;this.event("backpressure-resume");this.connect();}
 private connect(){
  if(this.stopped||this.paused)return;if(this.connections>=(this.options.maxConnections??512)||this.incidents>=(this.options.maxIncidents??256))return this.finish("terminal-budget-exhausted");
  const now=this.clock(),available=this.urls.map((_,i)=>(this.provider+i)%this.urls.length).find(i=>this.cooldowns[i]!<=now);
  if(available===undefined){const wait=Math.max(1,Math.min(...this.cooldowns)-now);this.event("all-providers-cooldown");this.timer=this.scheduler.schedule(()=>this.connect(),wait);return;}
  this.provider=available;this.connections++;this.attempts++;this.metrics.increment("supervisor.connections");this.acked=false;this.connectedAt=undefined;this.receiptAt=undefined;this.stableSince=undefined;
  const gen=++this.generation;let failed=false;
  const fail=(error:Error)=>{if(failed||this.stopped||gen!==this.generation)return;failed=true;this.closeInterval();this.generation++;this.active?.stop();try{(this.socket as any)?.terminate?.();}catch{}if(this.watch!==undefined)this.scheduler.cancel(this.watch);
   this.incidents++;this.metrics.increment("supervisor.incidents");this.event("incident",(error as any).code,String(error.message).replace(/(?:https?|wss?):\/\/\S+/g,"[endpoint]").slice(0,200));try{this.options.onDisconnect?.({latestSlot:this.active?.latestSlot??0});this.options.onError?.(error);}catch{this.finish("terminal-observer-failure");return;}
   if(this.attempts>=(this.options.attemptsPerIncident??3)){this.cooldowns[this.provider]=this.clock()+(this.options.cooldownMs??30000);this.event("provider-cooldown");this.provider=(this.provider+1)%this.urls.length;this.attempts=0;}
   const wait=Math.min(5000,250*2**Math.min(4,this.attempts));this.timer=this.scheduler.schedule(()=>this.connect(),wait);
  };
  const factory=(url:string)=>{const socket=this.options.socketFactory?.(url)??new WebSocket(url,{maxPayload:262144,handshakeTimeout:10000});this.socket=socket;
   socket.on("open",()=>{if(gen!==this.generation||this.stopped)return;this.connectedAt=this.clock();this.intervalStart=this.clock();this.event("socket-open");});
   socket.on("close",(code:number)=>{if(gen===this.generation)this.event("socket-close",code);});
   socket.on("error",(error:any)=>{if(gen===this.generation)this.event("transport-error",typeof error?.code==="string"?error.code:undefined);});
   return socket;};
  this.active=new SolanaMonitor(this.urls[this.provider]!,this.programs,e=>{
   if(gen!==this.generation||this.stopped)return;this.receiptAt=this.clock();this.stableSince??=this.clock();
   if(this.clock()-this.stableSince>=(this.options.stableMs??30000))this.attempts=0;
   this.metrics.increment("supervisor.notifications");this.observe(e);
  },{telemetry:this.metrics,scheduler:this.scheduler,deduplicate:false,maxReconnects:0,onReady:context=>{if(gen!==this.generation||this.stopped)return;this.acked=true;this.event("subscriptions-ready");try{this.options.onReady?.({...context,reconnected:this.connections>1});}catch{this.finish("terminal-observer-failure");}},onDisconnect:()=>fail(Error("WebSocket disconnected")),onError:error=>{
   if(gen!==this.generation)return;if(!error.message.includes("reconnect budget exhausted"))fail(error);
  }},factory);
  this.active.start();
  const watch=()=>{if(gen!==this.generation||this.stopped)return;
   const current=this.clock();if(!this.acked&&current-now>=(this.options.ackTimeoutMs??10000))return fail(Error("Subscription acknowledgement deadline exceeded"));
   if(this.acked&&current-(this.receiptAt??this.connectedAt??now)>(this.options.receiptStaleMs??30000))return fail(Error("Notification receipt stale; open socket is not healthy coverage"));
   this.watch=this.scheduler.schedule(watch,Math.min(1000,this.options.ackTimeoutMs??10000,this.options.receiptStaleMs??30000));};this.watch=this.scheduler.schedule(watch,Math.min(1000,this.options.ackTimeoutMs??10000));
 }
 snapshot(){const now=this.ended??this.clock(),end=now-this.began,intervals=[...this.intervals,...(this.intervalStart===undefined?[]:[{provider:this.provider,fromMs:this.intervalStart-this.began,toMs:end,subscribed:this.acked,lastReceiptMs:this.receiptAt===undefined?undefined:this.receiptAt-this.began}])];const connectedMs=intervals.reduce((n,x)=>n+Math.max(0,x.toMs-x.fromMs),0),fresh=this.acked&&this.receiptAt!==undefined&&now-this.receiptAt<=(this.options.receiptStaleMs??30000);
  return{state:this.terminal?"terminal":this.stopped?"stopped":this.paused?"paused":fresh?"receiving":this.acked?"subscribed":"connecting",liveReady:!this.stopped&&!this.paused&&fresh,provider:this.provider,providerHosts:this.urls.map(u=>new URL(u).host),elapsedMs:end,connectedMs,disconnectedMs:Math.max(0,end-connectedMs),connections:this.connections,incidents:this.incidents,attemptsThisIncident:this.attempts,cooldownsUntilMono:[...this.cooldowns],intervals,events:[...this.events],liveTrading:false};}
}
