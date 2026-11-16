"""Capture official revision identities and source/IDL bytes; never establishes binary equivalence."""
from pathlib import Path
import urllib.request,json,hashlib,datetime
out=Path('docs/phase11/official-schemas');out.mkdir()
repos=[('pump-fun/pump-public-docs',['idl/pump_amm.json','docs/PUMP_SWAP_README.md']),('raydium-io/raydium-cp-swap',['programs/cp-swap/src/states/pool.rs','programs/cp-swap/src/instructions/initialize.rs','programs/cp-swap/src/instructions/swap_base_input.rs']),('MeteoraAg/dlmm-sdk',['idls/dlmm.json'])]
def fetch(url,limit=4*1024*1024):
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mintbot-read-only-protocol-review'}),timeout=15) as r:
  b=r.read(limit+1)
  if len(b)>limit:raise ValueError('Official source byte bound')
  return b
rows=[]
for repo,paths in repos:
 try:commit=json.loads(fetch(f'https://api.github.com/repos/{repo}/commits?per_page=1'))[0]['sha']
 except Exception as e:rows.append({'repository':repo,'issue':str(e)});continue
 for path in paths:
  url=f'https://raw.githubusercontent.com/{repo}/{commit}/{path}';row={'repository':repo,'commit':commit,'path':path,'url':url}
  try:
   b=fetch(url);name=repo.replace('/','-')+'-'+path.replace('/','-');(out/name).write_bytes(b);row.update({'local':name,'sha256':hashlib.sha256(b).hexdigest(),'bytes':len(b)})
  except Exception as e:row['issue']=str(e)
  rows.append(row)
(out/'evidence.json').write_text(json.dumps({'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sources':rows,'sourceToBinaryEquivalence':'not established by source publication or revision identity','newVariantsEnabled':False},indent=2)+'\n');print(json.dumps(rows))
