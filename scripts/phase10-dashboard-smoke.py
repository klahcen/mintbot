"""Verify the existing authenticated dashboard API reads actual sidecar snapshots across atomic renames."""
from pathlib import Path
import subprocess, secrets, json, os, argparse, re
parser=argparse.ArgumentParser();parser.add_argument('--image',default='mintbot:phase10-readonly');parser.add_argument('--run-name',default='mainnet-validated');args=parser.parse_args()
assert re.fullmatch(r'[A-Za-z0-9_-]+',args.run_name)
root=Path.cwd();source=root/'docs/phase10/runtime';assert (source/args.run_name/'research-status.json').is_file()
name=f'mintbot-phase10-dashboard-{os.getpid()}';token=secrets.token_hex(32)
def call(argv,check=True):return subprocess.run(argv,check=check,capture_output=True,text=True,timeout=30)
try:
 cid=call(['docker','run','-d','--name',name,'--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/app/data:rw,uid=1000,gid=1000,mode=0700','--mount',f'type=bind,source={source},target=/app/research-data,readonly','-e',f'API_TOKEN={token}','-e','MODE=paper','-e','HOST=127.0.0.1','-e','PORT=3001','-e',f'RESEARCH_STATUS_PATH=/app/research-data/{args.run_name}/research-status.json',args.image]).stdout.strip()
 probe="""for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3001/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}const base='http://127.0.0.1:3001',headers={authorization:'Bearer '+process.env.API_TOKEN};const unauth=await fetch(base+'/api/research/status');let r=await fetch(base+'/api/research/status',{headers});const cache=r.headers.get('cache-control'),before=await r.json();await new Promise(r=>setTimeout(r,6500));r=await fetch(base+'/api/research/status',{headers});const after=await r.json();const dashboard=await fetch(base+'/');console.log(JSON.stringify({unauthorized:unauth.status,authorized:r.status,cache,dashboard:dashboard.status,beforeAt:before.evidence?.generatedAt,afterAt:after.evidence?.generatedAt,runStatus:after.evidence?.runStatus,notifications:after.evidence?.notifications,liveTrading:after.liveTrading,readiness:after.evidence?.readiness,status:after.status}));"""
 result=json.loads(call(['docker','exec',cid,'node','--input-type=module','-e',probe]).stdout)
 assert result['unauthorized']==401 and result['authorized']==200 and result['dashboard']==200
 assert result['cache']=='no-store' and result['liveTrading']==False and result['runStatus']=='running'
 assert result['afterAt']>result['beforeAt'],result
 result.update({'image':args.image,'sourceRun':args.run_name,'scope':'Actual existing authenticated API and dashboard read a directory-mounted live research sidecar snapshot through atomic renames. No public ports, no external container network, no new monitor started by server. Independent agreement and coverage readiness remain separate.','liveTrading':False})
 (root/'docs/phase10/dashboard-sidecar-smoke.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['unauthorized','authorized','dashboard','beforeAt','afterAt','runStatus','notifications','liveTrading']}))
finally:call(['docker','rm','-f',name],False)
