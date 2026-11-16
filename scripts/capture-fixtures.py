#!/usr/bin/env python3
"""Re-fetch the four recorded public signatures and later finalized account evidence. No signing."""
import argparse,pathlib,json,urllib.request,urllib.parse,time,subprocess,os
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--output-dir',default='/tmp/mintbot-verified-captures');a=p.parse_args()
if not a.run:p.error('Explicit --run is required')
root=pathlib.Path(a.output_dir);root.mkdir(parents=True,exist_ok=True);endpoint=os.environ.get('SOLANA_RPC_URL','https://api.mainnet-beta.solana.com')
def rpc(method,params):
 if method not in ['getTransaction','getMultipleAccounts']:raise ValueError('Method not permitted')
 request=urllib.request.Request(endpoint,json.dumps({'jsonrpc':'2.0','id':1,'method':method,'params':params}).encode(),{'Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=5) as response:
  raw=response.read(4*1024*1024+1)
  if len(raw)>4*1024*1024:raise ValueError('Response byte bound')
  result=json.loads(raw)
 if 'error' in result:raise ValueError('Read-only RPC rejected request')
 return result
for program in ['pump','pumpswap','raydium-cpmm','meteora-dlmm']:
 previous=json.loads(pathlib.Path('docs/phase3/fixtures/'+program+'-creation.json').read_text());sig=previous['provenance']['signature'];tx=rpc('getTransaction',[sig,{'commitment':'finalized','encoding':'jsonParsed','maxSupportedTransactionVersion':1}])
 if tx['result'] is None:raise ValueError('Finalized transaction unavailable: '+program)
 tx['provenance']={'provider':urllib.parse.urlsplit(endpoint).hostname,'capturedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'commitment':'finalized','method':'getTransaction','encoding':'jsonParsed','maxSupportedTransactionVersion':1,'signature':sig,'program':program}
 target=root/(program+'-creation.json');target.write_text(json.dumps(tx,indent=2)+'\n');keys=json.loads(subprocess.check_output(['node','--import','tsx','scripts/fixture-accounts.ts',program,str(target)],timeout=30))
 if len(keys)>32:raise ValueError('Account request bound')
 values=rpc('getMultipleAccounts',[keys,{'commitment':'finalized','encoding':'base64'}])['result'];evidence={'contextSlot':values['context']['slot'],'commitment':'finalized','accounts':dict(zip(keys,values['value'])),'provenance':{'provider':urllib.parse.urlsplit(endpoint).hostname,'capturedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'method':'getMultipleAccounts','historicalAccountSnapshot':False}}
 (root/(program+'-accounts.json')).write_text(json.dumps(evidence,indent=2)+'\n');time.sleep(.5)
print('Captured four finalized transactions and later account evidence in '+str(root))
