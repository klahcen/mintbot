"""Smoke current built artifacts in an isolated, read-only Node22 container. No app image rebuild or network egress."""
import subprocess,json,secrets,time,os,hashlib
from pathlib import Path
root=Path.cwd();name=f'mintbot-phase8-smoke-{os.getpid()}';token='phase8-smoke-'+secrets.token_hex(24)
def call(args,check=True):return subprocess.run(args,check=check,capture_output=True,text=True)
base=['docker','run','--name',name,'--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--user','1000:1000','--workdir','/app','--tmpfs','/app/data:rw,uid=1000,gid=1000,mode=0700','--tmpfs','/tmp:rw,mode=1777']
for source,target in [('dist','dist'),('node_modules','node_modules'),('config','config'),('frontend/dist','frontend/dist'),('package.json','package.json'),('docs/phase8/mainnet-release-check/research-status.json','research-status.json')]:base+=['--mount',f'type=bind,source={root/source},target=/app/{target},readonly']
base+=['-e',f'API_TOKEN={token}','-e','HOST=127.0.0.1','-e','PORT=3001','-e','RESEARCH_STATUS_PATH=/app/research-status.json']
image='node:22-bookworm-slim';result={'scope':'Current npm-built artifacts mounted read-only into existing Node22 image; no application image rebuilt, no external network, private tmpfs state. Not full Compose/production deployment.','image':image,'checks':{},'liveTrading':False}
try:
 cid=call(base[0:2]+['-d']+base[2:]+['-e','MODE=paper',image,'node','dist/src/server.js']).stdout.strip()
 probe="""const token=process.env.API_TOKEN;for(let i=0;i<50;i++){try{let h=await fetch('http://127.0.0.1:3001/health');if(h.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}const checks={};let r=await fetch('http://127.0.0.1:3001/health');checks.health=await r.json();r=await fetch('http://127.0.0.1:3001/api/state');checks.unauthorized=r.status;r=await fetch('http://127.0.0.1:3001/api/state',{headers:{authorization:'Bearer '+token}});checks.authorized=r.status;checks.state=await r.json();r=await fetch('http://127.0.0.1:3001/');checks.dashboard=r.status;r=await fetch('http://127.0.0.1:3001/api/research/status');checks.researchUnauthorized=r.status;r=await fetch('http://127.0.0.1:3001/api/research/status',{headers:{authorization:'Bearer '+token}});checks.researchHttp=r.status;checks.researchCache=r.headers.get('cache-control');const research=await r.json();checks.researchStatus=research.status;checks.researchLive=research.liveTrading;checks.researchRunStatus=research.evidence.runStatus;checks.researchIntents=research.evidence.intents.length;const fs=await import('node:fs/promises');checks.sqlAssets=await Promise.all(['intent-schema.sql','intent-migration-007.sql'].map(x=>fs.access('dist/src/simulation/'+x).then(()=>true)));console.log(JSON.stringify(checks));"""
 checks=json.loads(call(['docker','exec',cid,'node','--input-type=module','-e',probe]).stdout)
 assert checks['health']=={'ok':True,'mode':'paper'} and checks['unauthorized']==401 and checks['authorized']==200 and checks['dashboard']==200 and all(checks['sqlAssets']) and checks['researchUnauthorized']==401 and checks['researchHttp']==200 and checks['researchCache']=='no-store' and checks['researchLive']==False and checks['researchRunStatus']=='stopped',checks
 # Keep only control and status evidence, not the complete default state.
 result['checks']={k:v for k,v in checks.items() if k!='state'};result['containerIdentity']=json.loads(call(['docker','inspect',cid]).stdout)[0]['Image']
 result['serverLogs']=call(['docker','logs',cid]).stdout
finally:call(['docker','rm','-f',name],False)
try:
 blocked=call(base+['-e','MODE=live',image,'node','dist/src/server.js'],False)
 assert blocked.returncode!=0 and 'Live mode unavailable' in blocked.stderr
 result['checks']['liveModeRejected']=True;result['liveModeExitCode']=blocked.returncode
finally:call(['docker','rm','-f',name],False)
result['sourceBuildAssets']={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in Path('dist/src/simulation').glob('intent*.sql')}
Path('docs/phase8/container-smoke.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result['checks']))
