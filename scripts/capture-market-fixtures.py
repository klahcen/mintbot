#!/usr/bin/env python3
"""Capture a single-bank finalized read-only account snapshot. Never signs or sends transactions."""
import argparse,pathlib,json,urllib.request,urllib.parse,time,subprocess,os
p=argparse.ArgumentParser();p.add_argument('--run',action='store_true');p.add_argument('--venue',choices=['pump','pumpswap','raydium-cpmm','meteora-dlmm'],default='pump');a=p.parse_args()
if not a.run:p.error('Explicit --run required')
endpoint=os.environ.get('SOLANA_RPC_URL','https://api.mainnet-beta.solana.com')
keys=json.loads(subprocess.check_output(['node','--import','tsx','scripts/market-fixture-keys.ts',a.venue],timeout=30))
request=urllib.request.Request(endpoint,json.dumps({'jsonrpc':'2.0','id':1,'method':'getMultipleAccounts','params':[keys,{'commitment':'finalized','encoding':'base64'}]}).encode(),{'Content-Type':'application/json'})
with urllib.request.urlopen(request,timeout=15) as response:
 raw=response.read(4*1024*1024+1)
 if len(raw)>4*1024*1024:raise ValueError('Response bound')
 result=json.loads(raw)
if 'error' in result:raise ValueError('Read-only RPC rejected request')
r=result['result'];snapshot={'contextSlot':r['context']['slot'],'commitment':'finalized','accounts':dict(zip(keys,r['value'])),'provenance':{'provider':urllib.parse.urlsplit(endpoint).hostname,'capturedAt':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'method':'getMultipleAccounts','historicalAccountSnapshot':False,'scope':'Later account evidence; not launch-time reconstruction'}}
pathlib.Path('docs/phase4/fixtures/'+a.venue+'-market.json').write_text(json.dumps(snapshot,indent=2)+'\n')
print('Captured',len(keys),'accounts at slot',r['context']['slot'])
