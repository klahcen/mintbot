"""Actual production-image authenticated stop intent and topology guards, isolated from live observer."""
from pathlib import Path
import subprocess,secrets,tempfile,json,os,shutil
root=Path.cwd();out=root/'docs/phase11';control=Path(tempfile.mkdtemp(prefix='mintbot-phase11-control-smoke-'));token=secrets.token_hex(32);name=f'mintbot-phase11-control-{os.getpid()}';image='mintbot:phase11-readonly'
def call(a,check=True):return subprocess.run(a,check=check,capture_output=True,text=True,timeout=30)
base=['docker','run','--name',name,'--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/app/data:rw,uid=1000,gid=1000,mode=0700','--mount',f'type=bind,source={control},target=/app/control','-e',f'API_TOKEN={token}','-e','HOST=127.0.0.1','-e','MODE=paper','-e','RESEARCH_STOP_PATH=/app/control/global-stop.json']
try:
 cid=call(base[:2]+['-d']+base[2:]+[image]).stdout.strip()
 probe="""for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3001/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}const fs=await import('node:fs'),url='http://127.0.0.1:3001/api/control',body=JSON.stringify({action:'kill'});let r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body});const unauthorized=r.status,absentBeforeAuth=!fs.existsSync(process.env.RESEARCH_STOP_PATH);r=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.API_TOKEN},body});const authorized=r.status,result=await r.json(),before=fs.readFileSync(process.env.RESEARCH_STOP_PATH,'utf8');const reset=await fetch(url,{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+process.env.API_TOKEN},body:JSON.stringify({action:'reset'})});console.log(JSON.stringify({unauthorized,absentBeforeAuth,authorized,result,stop:JSON.parse(before),reset:reset.status,stickyAfterReset:before===fs.readFileSync(process.env.RESEARCH_STOP_PATH,'utf8')}));"""
 result=json.loads(call(['docker','exec',cid,'node','--input-type=module','-e',probe]).stdout)
 assert result['unauthorized']==401 and result['absentBeforeAuth'] and result['authorized']==200 and result['result']['researchStop']['status']=='requested' and result['stop']['action']=='kill' and result['stickyAfterReset']
finally:call(['docker','rm','-f',name],False)
try:
 r=call(base+['-e','REAL_MARKET_PAPER=true',image],False);assert r.returncode!=0 and 'requires legacy monitor and server market decisions disabled' in r.stderr
 result['doubleOwnerTopologyRejected']=True
finally:call(['docker','rm','-f',name],False);shutil.rmtree(control)
result.update({'image':image,'liveTrading':False,'scope':'Isolated network-disabled application. No stop intent was sent to the measured live observer. API acknowledgement is durable requested, not sidecar completion.'});(out/'control-api-smoke.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['unauthorized','authorized','stickyAfterReset','doubleOwnerTopologyRejected']}))
