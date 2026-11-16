#!/usr/bin/env python3
"""Optional bounded read-only observation experiment. Never constructs or submits transactions."""
import argparse,asyncio,json,os,time,urllib.request,urllib.parse,resource,pathlib,subprocess
from collections import Counter
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--public',action='store_true');p.add_argument('--seconds',type=int,default=15);p.add_argument('--max-observations',type=int,default=500);p.add_argument('--output',default='docs/phase3/mainnet-readonly.json');a=p.parse_args()
if not a.run:p.error('Explicit --run is required for network access')
if not 5<=a.seconds<=300 or not 1<=a.max_observations<=10000:p.error('Use 5..300 seconds and 1..10000 observations')
rpc='https://api.mainnet-beta.solana.com' if a.public else os.environ.get('SOLANA_RPC_URL');ws='wss://api.mainnet-beta.solana.com' if a.public else os.environ.get('SOLANA_WS_URL')
if not rpc or not ws:p.error('Use --public or configure SOLANA_RPC_URL/SOLANA_WS_URL')
programs={'pump':'6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P','pumpswap':'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA','raydium-cpmm':'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C','meteora-dlmm':'LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo'}
metrics=Counter();spans={};observations=[];seen=set();head=None;slot_lags=[];capture_bytes=0;errors=[];capture_elapsed=0
def observe(k,v):spans.setdefault(k,[]).append(v)
def read(method,params):
 if method not in ['getSlot','getSignaturesForAddress','getTransaction']:raise ValueError('RPC method not permitted')
 start=time.monotonic()
 try:
  request=urllib.request.Request(rpc,json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode(),{'Content-Type':'application/json'})
  with urllib.request.urlopen(request,timeout=5) as response:
   raw=response.read(4*1024*1024+1)
   if len(raw)>4*1024*1024:raise ValueError('RPC response bound')
   result=json.loads(raw)
  if 'error' in result:raise ValueError('RPC response error')
  metrics['rpc_success']+=1;return result['result']
 except Exception as error:
  metrics['rpc_errors']+=1
  if getattr(error,'code',None)==429:metrics['provider_429']+=1
  errors.append({'method':method,'kind':type(error).__name__,'httpStatus':getattr(error,'code',None)})
  raise
 finally:observe('rpc_'+method+'_ms',(time.monotonic()-start)*1000)
async def run():
 global head,capture_bytes,capture_elapsed
 start=time.monotonic();deadline=start+a.seconds;reconnect_at=start+a.seconds/2;reconnected=False
 try:head=await asyncio.to_thread(read,'getSlot',[{'commitment':'confirmed'}])
 except Exception:pass
 try:
  from websockets.asyncio.client import connect
 except ImportError:
  try:from websockets import connect
  except ImportError:
   errors.append({'kind':'websockets dependency unavailable'});return
 outage_start=None
 while time.monotonic()<deadline and len(observations)<a.max_observations:
  try:
   async with connect(ws,open_timeout=5,close_timeout=1,max_size=262144,max_queue=16,ping_interval=5,ping_timeout=5) as socket:
    subscriptions={};pending={i+1:n for i,n in enumerate(programs)}
    for i,(name,address) in enumerate(programs.items()):await socket.send(json.dumps({'jsonrpc':'2.0','id':i+1,'method':'logsSubscribe','params':[{'mentions':[address]},{'commitment':'confirmed'}]}))
    while time.monotonic()<deadline and len(observations)<a.max_observations:
     if not reconnected and (time.monotonic()>=reconnect_at or len(observations)>=max(1,a.max_observations//2)):
      reconnected=True;outage_start=time.monotonic();metrics['controlled_reconnects']+=1;break
     try:raw=await asyncio.wait_for(socket.recv(),timeout=min(1,max(.01,deadline-time.monotonic())))
     except asyncio.TimeoutError:continue
     t=time.monotonic();message=json.loads(raw)
     if 'error' in message:metrics['subscription_errors']+=1;continue
     if 'id' in message:
      name=pending.get(message['id'])
      if name:subscriptions[message['result']]=name
      if len(subscriptions)==len(programs) and outage_start is not None:observe('reconnect_to_all_acks_ms',(time.monotonic()-outage_start)*1000);outage_start=None
      continue
     if message.get('method')!='logsNotification':continue
     value=message['params']['result'];name=subscriptions.get(message['params']['subscription'])
     if not name:metrics['unknown_subscription']+=1;continue
     event={'program':name,'signature':value['value']['signature'],'slot':value['context']['slot'],'logs':value['value']['logs'],'failed':value['value']['err'] is not None,'observedAt':time.time()*1000}
     metrics['observations']+=1;identity=(name,event['signature'])
     if identity in seen:metrics['duplicates']+=1;continue
     seen.add(identity);size=len(json.dumps(event).encode())
     if capture_bytes+size>16*1024*1024:metrics['capture_budget_refused']+=1;return
     capture_bytes+=size;observations.append(event)
     if head is not None:slot_lags.append(head-event['slot'])
     observe('local_receipt_handling_ms',(time.monotonic()-t)*1000)
  except Exception as e:
   errors.append({'kind':type(e).__name__,'stage':'websocket'});metrics['websocket_errors']+=1
   if metrics['websocket_errors']>=2:break
  if len(observations)>=a.max_observations:metrics['observation_limit_reached']+=1
 capture_elapsed=time.monotonic()-start
asyncio.run(run())
retrieval=[];transaction_mints=Counter()
retrieval_sample=observations[:5]
if not retrieval_sample:
 for name in programs:
  fixture=pathlib.Path("docs/phase3/fixtures/"+name+"-creation.json")
  if fixture.exists():retrieval_sample.append({"signature":json.loads(fixture.read_text())["provenance"]["signature"]})
for event in retrieval_sample:
 try:
  tx=read('getTransaction',[event['signature'],{'commitment':'finalized','encoding':'jsonParsed','maxSupportedTransactionVersion':1}]);
  if tx:
   for mint in set(b['mint'] for b in (tx.get('meta',{}).get('preTokenBalances',[])+tx.get('meta',{}).get('postTokenBalances',[]))):transaction_mints[mint]+=1
  retrieval.append({'signature':event['signature'],'available':tx is not None,'version':tx.get('version') if tx else None})
 except Exception:retrieval.append({'signature':event['signature'],'available':False,'rpcError':True})
recovery=[]
for program in programs:
 offered=[e for e in observations if e['program']==program]
 if not offered:continue
 lower=min(e['slot'] for e in offered);upper=max(e['slot'] for e in offered)
 try:
  rows=read('getSignaturesForAddress',[programs[program],{'limit':100,'commitment':'finalized'}]);within=[r for r in rows if lower<=r['slot']<=upper];known=sum((program,r['signature']) not in seen for r in within)
  recovery.append({'program':program,'window':[lower,upper],'signaturesScanned':len(rows),'sampledMissingReceipts':known,'coverage':'partial sample; no exhaustive recovery proof','pageCap':True})
 except Exception:recovery.append({'program':program,'coverage':'unavailable'})
def quantile(xs):
 s=sorted(xs)
 return {'count':len(s),'p50':s[int((len(s)-1)*.5)] if s else None,'p95':s[int((len(s)-1)*.95)] if s else None,'p99':s[int((len(s)-1)*.99)] if s else None,'max':s[-1] if s else None}
output=pathlib.Path(a.output);capture=output.with_suffix('.observations.json');capture.write_text(json.dumps(observations,indent=2)+'\n')
result={'generatedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'providerHost':urllib.parse.urlsplit(rpc).hostname,'requestedDurationSeconds':a.seconds,'observationLimit':a.max_observations,'captureElapsedSeconds':capture_elapsed,'observationsPerSecond':len(observations)/capture_elapsed if capture_elapsed else None,'status':'observed' if observations else 'unavailable','metrics':dict(metrics),'latencies':{k:quantile(v) for k,v in spans.items()},'sampledHeadSlot':head,'slotLagSigned':quantile(slot_lags),'slotLagMethod':'Single confirmed head snapshot before capture; negative lag means head sample is older than receipt, not negative network latency. No slot-to-ms conversion.','recovery':recovery,'retrieval':retrieval,'retrievedMintDistribution':dict(transaction_mints),'mintDistributionScope':'Token-balance mint fields from the bounded transaction retrieval sample; not all observations and not a launch assertion.','retrievalSampleSource':'observed receipts' if observations else 'previously recorded finalized fixtures (WebSocket unavailable)','captureBytes':capture_bytes,'pythonResourceUsage':{'userSeconds':resource.getrusage(resource.RUSAGE_SELF).ru_utime,'systemSeconds':resource.getrusage(resource.RUSAGE_SELF).ru_stime,'maxRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss},'errors':errors[:100],'scope':'Read-only getSlot/getSignaturesForAddress/getTransaction and logsSubscribe. Bounded 16-message WebSocket queue, 256KiB message, 16MiB capture, 5-second RPC/connection deadlines, two failed connection budget. Confirmed observations with finalized retrieval sample; observations are not claimed finalized. Controlled reconnect only if time/window permits before cap. Missing sampled history does not prove permanent loss. No on-chain event-to-receipt latency claim.'}
output.write_text(json.dumps(result,indent=2)+'\n')
subprocess.run(['node','--import','tsx','scripts/mainnet-decode.ts',str(capture),str(output.with_suffix('.decode.json'))],check=True,timeout=30)
print(json.dumps({'status':result['status'],'observations':len(observations),'errors':len(errors),'output':str(output)}))
