"""Bounded immutable official documentation/IDL capture; no deployed-behavior approval."""
from pathlib import Path
import urllib.request,json,hashlib,datetime,argparse
parser=argparse.ArgumentParser();parser.add_argument('--output',default='docs/phase12/official');cfg=parser.parse_args()
out=Path(cfg.output);out.mkdir()
def fetch(url,limit=4*1024*1024):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mintbot-read-only-protocol-review'}),timeout=15) as r:
  data=r.read(limit+1)
  if len(data)>limit:raise ValueError('Source byte bound')
  return data
repos=[('pump-fun/pump-public-docs',['docs/NEGATIVE_VIRTUAL_QUOTE_RESERVES.md','docs/VIRTUAL_QUOTE_RESERVES_FEE_ADJUSTMENT.md','docs/PUMP_SWAP_README.md','docs/PUMP_PROGRAM_README.md','docs/instructions/CREATE_WITH_PUMP_COIN_QUOTE.md','idl/pump.json','idl/pump_amm.json','idl/pump.ts']),('MeteoraAg/dlmm-sdk',['idls/dlmm.json']),('raydium-io/raydium-cp-swap',['programs/cp-swap/src/instructions/initialize.rs','programs/cp-swap/src/instructions/initialize_with_permission.rs','programs/cp-swap/src/states/pool.rs'])]
rows=[]
for repo,paths in repos:
 try:commit=json.loads(fetch(f'https://api.github.com/repos/{repo}/commits?per_page=1'))[0]['sha']
 except Exception as e:rows.append({'repository':repo,'issue':str(e)});continue
 for path in paths:
  row={'repository':repo,'commit':commit,'path':path,'url':f'https://raw.githubusercontent.com/{repo}/{commit}/{path}'}
  try:
   b=fetch(row['url']);name=repo.replace('/','-')+'-'+path.replace('/','-');(out/name).write_bytes(b);row.update({'local':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
  except Exception as e:row['issue']=str(e)
  rows.append(row)
(out/'evidence.json').write_text(json.dumps({'capturedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rows':rows,'newVariantAuthorized':False,'scope':'Official published contracts are evidence; publication/revision identity alone is not reproducible source-to-deployed-binary correspondence.'},indent=2)+'\n');print(json.dumps(rows))
