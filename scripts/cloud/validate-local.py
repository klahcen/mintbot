#!/usr/bin/env python3
"""Disposable cloud integration. Never loads .env/private or retained DB test homes."""
import importlib.util, json, os, shutil, ssl, subprocess as sp, tempfile, time, uuid
from pathlib import Path
repo=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('cloud',repo/'scripts/cloud/manage.py');cloud=importlib.util.module_from_spec(spec);spec.loader.exec_module(cloud)
work=Path(tempfile.mkdtemp(prefix='mintbot-cloud-validation-'));os.chmod(work,0o700);os.umask(0o077)
cloud.ROOT=work
project='mintbot-cloud-test-'+uuid.uuid4().hex[:10]
checks={};result=repo/'docs/phase19/cloud-integration.json'
for name in ['compose.cloud.yaml','compose.cloud.tunnel.yaml']:shutil.copy2(repo/name,work/name)
(work/'db').mkdir();shutil.copy2(repo/'db/schema.sql',work/'db/schema.sql');(work/'deploy/cloud').mkdir(parents=True)
caddy=(repo/'deploy/cloud/Caddyfile').read_text().replace('request_body {','tls internal\n\trequest_body {');(work/'deploy/cloud/Caddyfile').write_text(caddy);shutil.copy2(repo/'deploy/cloud/20-runtime-role.sh',work/'deploy/cloud/20-runtime-role.sh')
(work/'private').mkdir(mode=0o700)
runtime={'API_TOKEN':os.urandom(32).hex(),'POSTGRES_PASSWORD':os.urandom(32).hex(),'SOLANA_RPC_URL':'https://one.invalid','SOLANA_WS_URL':'wss://one.invalid','SOLANA_SECONDARY_RPC_URL':'https://two.invalid','SOLANA_SECONDARY_WS_URL':'wss://two.invalid'}
(work/'private/cloud-runtime.json').write_text(json.dumps(runtime));(work/'private/postgres-password').write_text(os.urandom(32).hex());(work/'private/database-app-password').write_text(runtime['POSTGRES_PASSWORD']);(work/'private/research-clock').mkdir()
env=work/'cloud.env';env.write_text('MINTBOT_IMAGE=mintbot:phase19\nMINTBOT_DOMAIN=dashboard.test\nACME_EMAIL=test@example.com\nBACKUP_DIR='+str(work/'backups')+'\nBACKUP_CERT='+str(work/'recipient.pem')+'\n')
cfg=cloud.config(env)
override=work/'test.yaml';override.write_text('services:\n  caddy:\n    ports: !override ["127.0.0.1::8080", "127.0.0.1::8443"]\n')
dc=['docker','compose','--project-name',project,'--env-file',str(env),'-f',str(work/'compose.cloud.yaml'),'-f',str(override),'--profile','https']
run=cloud.run
try:
    cloud.validate(cfg);run(dc+['config','-q']);checks['composeSyntax']=True
    resolved=json.loads(run(dc+['--profile','research','config','--format','json'],output=True))
    assert all('ports' not in resolved['services'][s] for s in ['app','postgres','research'])
    assert runtime['API_TOKEN'] not in json.dumps(resolved) and runtime['POSTGRES_PASSWORD'] not in json.dumps(resolved)
    assert resolved['services']['research']['restart']=='no';checks['isolationSecretsAndRestartPolicy']=True
    # Initialize ONLY volumes in this random test project. No retained volume touched.
    for volume,uid in [('pg-data',70),('paper-state',1000),('research-state',1000),('research-control',1000),('caddy-data',1000),('caddy-config',1000)]:
        name=project+'_'+volume
        run(['docker','volume','create','--label','com.docker.compose.project='+project,'--label','com.docker.compose.volume='+volume,name])
        run(['docker','run','--rm','--network','none','--read-only','--user','0','-v',name+':/initialize','--entrypoint','sh','mintbot:phase19','-c',f'chown -R {uid}:{uid} /initialize && chmod 700 /initialize'])
    run(['docker','run','--rm','--network','none','--user','0','-v',str(work/'private')+':/initialize','--entrypoint','chown','postgres:17-alpine','70:70','/initialize/postgres-password','/initialize/database-app-password'])
    run(dc+['up','-d','--no-build','--wait','--wait-timeout','120','postgres','app','caddy'])
    rows=cloud.containers(dc);assert not any(r['Service']=='research' for r in rows);checks['researchStoppedByDefault']=True
    run(dc+['exec','-T','app','node','dist/scripts/cloud-health.js']);checks['authenticatedDatabaseReadiness']=True
    # No secrets in output: authorization is loaded only inside the test container.
    js="const f=require('fs');const c=JSON.parse(f.readFileSync('/run/secrets/runtime.json'));(async()=>{for(const p of ['/api/state','/api/ops/health']){if((await fetch('http://127.0.0.1:3001'+p)).status!==401)process.exit(2);}const r=await fetch('http://127.0.0.1:3001/api/state',{headers:{authorization:'Bearer '+c.API_TOKEN}});const s=await r.json();if(s.marketPaper.status!=='disabled')process.exit(3);const rejected=await fetch('http://127.0.0.1:3001/api/control',{method:'POST',headers:{authorization:'Bearer '+c.API_TOKEN,'content-type':'application/json'},body:JSON.stringify({action:c.API_TOKEN})});if(JSON.stringify(await rejected.json()).includes(c.API_TOKEN))process.exit(4);await fetch('http://127.0.0.1:3001/api/control',{method:'POST',headers:{authorization:'Bearer '+c.API_TOKEN,'content-type':'application/json'},body:JSON.stringify({action:'start'})});f.writeFileSync('/app/data/cloud-preserved','sentinel');})();"
    run(dc+['exec','-T','app','node','-e',js]);checks['authenticationAndPaperFence']=True
    log=run(dc+['logs','--no-color','app'],output=True).decode()
    assert all(v not in log for v in runtime.values());checks['requestErrorAndLogRedaction']=True
    run(dc+['exec','-T','app','node','-e',"const fs=require('fs'),{Pool}=require('pg');const c=JSON.parse(fs.readFileSync('/run/secrets/runtime.json'));const p=new Pool({connectionString:'postgres://mintbot:'+c.POSTGRES_PASSWORD+'@postgres:5432/mintbot'});(async()=>{try{await p.query('CREATE TABLE forbidden(id int)');process.exitCode=2;}catch(e){if(e.code!=='42501')process.exitCode=3;}finally{await p.end();}})();"]);checks['databaseRuntimeCannotCreateTables']=True
    run(dc+['exec','-T','postgres','psql','-U','mintbot_owner','-d','mintbot','-c',"INSERT INTO events(id,kind,payload) VALUES ('cloud-sentinel','test','{}');"])
    run(dc+['up','-d','--no-build','--force-recreate','--wait','postgres','app'])
    assert run(dc+['exec','-T','postgres','psql','-U','mintbot_owner','-d','mintbot','-Atc','SELECT count(*) FROM events'],output=True).strip()==b'1'
    run(dc+['exec','-T','app','test','-f','/app/data/cloud-preserved']);checks['databaseAndPaperVolumeRecreation']=True
    run(dc+['exec','-T','app','node','-e',"const f=require('fs');const c=JSON.parse(f.readFileSync('/run/secrets/runtime.json'));(async()=>{const r=await fetch('http://127.0.0.1:3001/api/state',{headers:{authorization:'Bearer '+c.API_TOKEN}});if((await r.json()).running!==false)process.exit(2);})();"]);checks['restartRequiresOperatorResume']=True
    run(['openssl','req','-x509','-newkey','rsa:3072','-nodes','-keyout',work/'identity.pem','-out',work/'recipient.pem','-days','30','-subj','/CN=Disposable backup validation'])
    cloud.backup(dc,cfg);archive=next(p for p in (work/'backups').iterdir() if p.is_dir())
    assert (archive/'database.cms').stat().st_mode&0o077==0
    cloud.restore_drill(archive,work/'identity.pem',cfg);checks['encryptedBackupAndIsolatedRestore']=True
    original=(archive/'database.cms').read_bytes();corrupt=bytearray(original);corrupt[-20]^=1;(archive/'database.cms').write_bytes(corrupt)
    try:cloud.restore_drill(archive,work/'identity.pem',cfg)
    except cloud.Failure:checks['corruptBackupRejected']=True
    else:raise AssertionError('Corrupt backup accepted')
    (archive/'database.cms').write_bytes(original)
    run(dc+['stop','postgres'])
    try:run(dc+['exec','-T','app','node','dist/scripts/cloud-health.js'])
    except cloud.Failure:checks['databaseFailureDetected']=True
    else:raise AssertionError('DB outage missed')
    run(dc+['up','-d','--wait','postgres'])
    for _ in range(45):
        try:run(dc+['exec','-T','app','node','dist/scripts/cloud-health.js']);break
        except cloud.Failure:time.sleep(1)
    else:raise AssertionError('App failed to recover database connectivity')
    checks['databaseRecovery']=True
    for _ in range(40):
        if next(r for r in cloud.containers(dc) if r['Service']=='app').get('Health')=='healthy':break
        time.sleep(1)
    else:raise AssertionError('Docker health did not recover')
    http=run(dc+['port','caddy','8080'],output=True).decode().strip().split(':')[-1]
    https=run(dc+['port','caddy','8443'],output=True).decode().strip().split(':')[-1]
    headers=run(['curl','-sS','--max-time','10','-D','-','-o','/dev/null','-H','Host: dashboard.test','http://127.0.0.1:'+http],output=True).decode()
    assert '308' in headers and 'Location: https://dashboard.test/' in headers;checks['httpRedirectToExternal443']=True
    caddyid=run(dc+['ps','-q','caddy'],output=True).decode().strip()
    run(['docker','cp',caddyid+':/data/caddy/pki/authorities/local/root.crt',work/'root.crt'])
    headers=run(['curl','--noproxy','*','-sS','--max-time','10','--cacert',work/'root.crt','--resolve','dashboard.test:'+https+':127.0.0.1','-D','-','-o','/dev/null','https://dashboard.test:'+https+'/api/state'],output=True).decode()
    assert '401' in headers and 'strict-transport-security:' in headers.lower();checks['localTrustedTLSAndProxyAuth']=True
    checks['monitorReturnsBlockedWarnings']=cloud.monitor(dc,cfg)==1
    # Emergency stop survives container recreation. Does not delete owner or epoch files.
    run(dc+['exec','-T','app','node','--input-type=module','-e',"import {requestResearchStop} from './dist/src/research/stop-control.js';await requestResearchStop('/app/research-control/global-stop.json','kill');"])
    run(dc+['up','-d','--no-build','--force-recreate','--wait','app'])
    run(dc+['exec','-T','app','test','-f','/app/research-control/global-stop.json']);checks['stickyStopPersists']=True
    checks['imageExcludesPrivateFiles']=True
    run(['docker','run','--rm','--network','none','--entrypoint','sh','mintbot:phase19','-c','test ! -e /app/.env && test ! -e /app/.env.save && test ! -e /app/private'])
except BaseException as error:
    checks['failure']=type(error).__name__+': '+str(error)
    try:checks['serviceFailureState']=[{k:r.get(k) for k in ['Service','State','Health','ExitCode']} for r in cloud.containers(dc)]
    except Exception:pass
    raise
finally:
    result.write_text(json.dumps({'scope':'disposable local containers; internal test CA; no public ACME or VPS deployment','project':project,'checks':checks},indent=2)+'\n')
    run(dc+['--profile','research','down','--volumes','--remove-orphans'])
    # UID70 secret can be removed by directory owner. No retained data involved.
    shutil.rmtree(work)
