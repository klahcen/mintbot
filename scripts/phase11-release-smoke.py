"""Separate bounded real supervisor: actual second-owner refusal and authenticated stop/drain."""
from pathlib import Path
import subprocess,json,os,time,secrets,datetime,argparse,re
parser=argparse.ArgumentParser();parser.add_argument('--output-root',default='docs/phase11');parser.add_argument('--image',default='mintbot:phase11-readonly');parser.add_argument('--history',default='docs/phase11/coverage-history.json,docs/phase11/phase11-coverage-history.json');parser.add_argument('--host-health');parser.add_argument('--probe-name',default='release-probe');parser.add_argument('--seconds',type=int,default=120);cfg=parser.parse_args()
root=Path.cwd();out=root/cfg.output_root;control=out/('release-control' if cfg.probe_name=='release-probe' else cfg.probe_name+'-control');assert re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',cfg.probe_name);control.mkdir();image=cfg.image;name='mintbot-'+out.name+'-'+cfg.probe_name;app=f'mintbot-{out.name}-stop-api-{os.getpid()}';token=secrets.token_hex(32)
history=[Path(p).resolve() for p in cfg.history.split(',')];historyArg=','.join('/app/history/input-'+str(i)+'.json' for i in range(len(history)))

def call(a,timeout=35,check=True):
 r=subprocess.run(a,capture_output=True,text=True,timeout=timeout)
 if check and r.returncode:raise RuntimeError(r.stderr)
 return r
args=['docker','run','-d','--init','--name',name,'--read-only','--network','host','--cap-drop','ALL','--security-opt','no-new-privileges','--mount',f'type=bind,source={out}/runtime,target=/app/data','--mount',f'type=bind,source={control},target=/app/control',*[item for i,p in enumerate(history) for item in ['--mount',f'type=bind,source={p},target=/app/history/input-{i}.json,readonly']],*(['--mount',f'type=bind,source={Path(cfg.host_health).resolve()},target=/app/host-health,readonly','-e','RESEARCH_REQUIRE_HOST_HEALTH=true','-e','RESEARCH_HOST_HEALTH_PATH=/app/host-health/evidence.json'] if cfg.host_health else []),'-e','MODE=paper','-e','RESEARCH_STOP_PATH=/app/control/global-stop.json','-e','RESEARCH_OWNER_PATH=/app/control/owner.lock',image,'node','dist/scripts/phase11-mainnet.js','--run','--seconds',str(cfg.seconds),'--history-evidence',historyArg,'--output','/app/data/'+cfg.probe_name]
cid=call(args).stdout.strip();(out/(cfg.probe_name+'-launch.json')).write_text(json.dumps({'args':args,'container':cid,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'Separate stop/owner validation, never added to primary duration or paper acceptance'},indent=2)+'\n')
try:
 for i in range(20):
  if (out/'runtime'/cfg.probe_name/'run-progress.json').exists():break
  time.sleep(1)
 else:raise RuntimeError('Operational probe did not produce progress')
 duplicate=call(['docker','exec',cid,'node','dist/scripts/phase11-mainnet.js','--run','--seconds','15','--history-evidence',historyArg,'--output','/app/data/'+cfg.probe_name+'-owner-rejected'],check=False)
 assert duplicate.returncode and 'EEXIST' in duplicate.stderr,duplicate.stderr
 appid=call(['docker','run','-d','--name',app,'--read-only','--network','none','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/app/data:rw,uid=1000,gid=1000,mode=0700','--mount',f'type=bind,source={control},target=/app/control','-e',f'API_TOKEN={token}','-e','HOST=127.0.0.1','-e','RESEARCH_STOP_PATH=/app/control/global-stop.json',image]).stdout.strip()
 probe="""for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:3001/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}const r=await fetch('http://127.0.0.1:3001/api/control',{method:'POST',headers:{authorization:'Bearer '+process.env.API_TOKEN,'content-type':'application/json'},body:JSON.stringify({action:'kill'})});console.log(JSON.stringify({http:r.status,result:await r.json()}));"""
 api=json.loads(call(['docker','exec',appid,'node','--input-type=module','-e',probe]).stdout);assert api['http']==200 and api['result']['researchStop']['status']=='requested'
 call(['docker','wait',cid],timeout=45)
 e=json.loads((out/'runtime'/cfg.probe_name/'evidence.json').read_text());inspect=json.loads(call(['docker','inspect',cid]).stdout)[0]
 assert inspect['State']['ExitCode']==0 and e['stopRequested'] and e['supervisor']['state']=='stopped' and e['ledger']['killed'] and not e['ledger']['running'] and not (control/'owner.lock').exists()
 assert len(e['coverageEpoch']['history'])==len(history) and not e['ledger']['trades']
 (out/('release-stop-owner-smoke.json' if cfg.probe_name=='release-probe' else cfg.probe_name+'-stop-owner-smoke.json')).write_text(json.dumps({'api':api,'secondOwnerExitCode':duplicate.returncode,'secondOwnerStderr':duplicate.stderr,'container':{'Image':inspect['Image'],'State':inspect['State']},'observedSeconds':e['supervisor']['elapsedMs']/1000,'clockDiscontinuityMs':e['supervisor']['clockDiscontinuityMs'],'stopRequested':e['stopRequested'],'ledgerKilled':e['ledger']['killed'],'ownerReleased':not (control/'owner.lock').exists(),'historicalEpochsRetained':len(e['coverageEpoch']['history']),'paperTrades':len(e['ledger']['trades']),'liveTrading':False,'scope':'Actual separate read-only supervisor, shared owner refusal, authenticated API stop intent, controller drain/ledger stop. This time is excluded from primary monitoring.'},indent=2)+'\n');print(json.dumps({'observedSeconds':e['supervisor']['elapsedMs']/1000,'secondOwnerRefused':True,'authenticatedStopDrained':True}))
finally:
 call(['docker','rm','-f',app],check=False)
 state=json.loads(call(['docker','inspect',cid]).stdout)[0]['State']
 if state['Running']:call(['docker','stop','-t','40',cid],timeout=45,check=False)
