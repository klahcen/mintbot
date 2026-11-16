#!/usr/bin/env python3
"""Fail-closed local host operations. No SSH, secret output, volume reset or research launch."""
import argparse, datetime as dt, fcntl, json, os, re, shutil, stat, subprocess as sp, sys, tempfile, time, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
class Failure(Exception): pass
def run(args, *, data=None, timeout=180, output=False):
    p=sp.run([str(x) for x in args],input=data,stdout=sp.PIPE,stderr=sp.PIPE,timeout=timeout)
    if p.returncode: raise Failure('Operation failed: '+str(args[0])+' (details withheld to protect credentials)')
    return p.stdout if output else None
def config(path):
    values={}
    for line in path.read_text().splitlines():
        if not line or line.startswith('#'):continue
        key,sep,value=line.partition('=')
        if not sep or not re.fullmatch(r'[A-Z_]+',key) or any(c in value for c in '\r\n\x00'):raise Failure('Invalid public configuration')
        if key not in {'MINTBOT_IMAGE','POSTGRES_IMAGE','CADDY_IMAGE','MINTBOT_DOMAIN','ACME_EMAIL','RESEARCH_RUN_NAME','RESEARCH_SECONDS','RESEARCH_VENUES','BACKUP_DIR','BACKUP_CERT','BACKUP_RETENTION_DAYS','BACKUP_MAX_AGE_HOURS','MIN_DISK_FREE_GB'}: raise Failure('Unexpected public configuration key')
        values[key]=value
    return values
def private(path):
    info=path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode&0o077:raise Failure('Private file must be regular, non-symlink and mode 0600: '+path.name)
def validate(cfg):
    directory=ROOT/'private'
    if directory.is_symlink() or directory.stat().st_mode&0o077:raise Failure('private/ must be mode 0700')
    p=directory/'cloud-runtime.json';private(p)
    r=json.loads(p.read_text());keys={'API_TOKEN','POSTGRES_PASSWORD','SOLANA_RPC_URL','SOLANA_WS_URL','SOLANA_SECONDARY_RPC_URL','SOLANA_SECONDARY_WS_URL'}
    if set(r)!=keys or any(not isinstance(v,str) for v in r.values()):raise Failure('Invalid runtime credential shape')
    if len(r['API_TOKEN'])<32 or 'REPLACE' in r['API_TOKEN'] or not re.fullmatch('[a-fA-F0-9]{32,}',r['POSTGRES_PASSWORD']):raise Failure('Invalid runtime credentials')
    from urllib.parse import urlsplit
    for k in keys-{'API_TOKEN','POSTGRES_PASSWORD'}:
        u=urlsplit(r[k]);scheme='wss' if 'WS_URL' in k else 'https'
        if u.scheme!=scheme or not u.hostname or u.username or u.password:raise Failure('Secure RPC endpoints required')
    password=directory/'database-app-password';private(password)
    admin=directory/'postgres-password';private(admin)
    if not re.fullmatch('[a-fA-F0-9]{32,}',admin.read_text().strip()) or admin.read_text().strip()==r['POSTGRES_PASSWORD']:raise Failure('Separate random database owner password required')
    if password.read_text().strip()!=r['POSTGRES_PASSWORD']:raise Failure('Database credential files disagree')
    if not cfg.get('MINTBOT_IMAGE') or cfg['MINTBOT_IMAGE'].endswith(':latest'):raise Failure('Explicit release image required')
    if not re.fullmatch('[a-zA-Z0-9_-]{1,80}',cfg.get('RESEARCH_RUN_NAME','run')):raise Failure('Invalid run name')
    print('Credential presence, transport and permissions validated; values withheld')
def prerequisite():
    osinfo=Path('/etc/os-release').read_text()
    if 'ID=ubuntu' not in osinfo or 'VERSION_ID="24.04"' not in osinfo:raise Failure('Ubuntu 24.04 required for this runbook')
    for cmd in ['docker','openssl','tar']: 
        if not shutil.which(cmd):raise Failure('Missing prerequisite: '+cmd)
    version=run(['docker','version','--format','{{.Server.Version}}'],output=True).decode().strip()
    compose=run(['docker','compose','version','--short'],output=True).decode().strip()
    if int(version.split('.')[0])<24 or tuple(map(int,compose.lstrip('v').split('.')[:2]))<(2,24):raise Failure('Docker >=24 and Compose >=2.24 required')
    print('Ubuntu, Docker daemon and Compose prerequisites passed')
def json_rows(data):
    text=data.decode().strip()
    if not text:return []
    try:value=json.loads(text)
    except ValueError:return [json.loads(line) for line in text.splitlines() if line.strip()]
    return value if isinstance(value,list) else [value]
def containers(dc):
    return json_rows(run(dc+['ps','--all','--format','json'],output=True))
def alerts(rows, health, free, cfg, backup_age):
    found=[]
    for name in ['app','postgres']:
        row=next((r for r in rows if r['Service']==name),{})
        if row.get('State')!='running' or row.get('Health')!='healthy':found.append(name+'_unhealthy')
    if not health.get('ok'):found.append('database_or_app_unavailable')
    if free<float(cfg.get('MIN_DISK_FREE_GB','5')):found.append('disk_low')
    if backup_age is None or backup_age>float(cfg.get('BACKUP_MAX_AGE_HOURS','26')):found.append('backup_missing_or_stale')
    if health.get('stopFence'):found.append('research_sticky_stop')
    research=health.get('research',{});e=research.get('evidence',{})
    row=next((r for r in rows if r['Service']=='research'),None)
    if (row and row.get('State')!='running' and e.get('runStatus') not in ('stopped','failed')) or (not row and e.get('runStatus')=='running'):found.append('research_unexpected_termination')
    if research.get('status')!='available':found.append('market_data_stale_or_unavailable')
    if e.get('runStatus')=='failed':found.append('research_failed')
    if e.get('wal',{}).get('status') not in ('healthy','verified'):found.append('research_wal_unverified')
    if any(p.get('status') not in ('healthy','verified') for p in e.get('providers',[])):found.append('provider_disagreement_or_failure')
    if not e.get('providers'):found.append('rpc_http_wss_not_observed')
    readiness=e.get('readiness',[])
    # A display row never grants authorization. Missing/blocked rows always alert.
    required={'Epoch research policy','Research coverage','Independent provider agreement'}
    if not required.issubset({r.get('name') for r in readiness}) or any(r.get('status') not in ('passed','verified','eligible') for r in readiness):found.append('coverage_or_execution_blocked')
    if row and row.get('State')=='running' and row.get('Health')!='healthy':found.append('research_delivery_fatal_quarantine_or_coverage')
    return sorted(set(found))
def rpc_alerts(report, now):
    if not report or now-report.get('observedAt',0)>1800:return ['rpc_http_wss_observation_stale']
    found=[]
    probe=report.get('probe',{})
    if probe.get('status')=='failed':return ['rpc_diagnostic_failed']
    for provider in probe.get('providers',[]):
        label=provider.get('id')
        if label not in ('primary','secondary'):continue
        if not provider.get('health',{}).get('ok'):found.append(label+'_http_failed')
        ws=provider.get('websocket',{})
        if ws.get('status') in ('failed','missing','unavailable'):found.append(label+'_wss_failed')
        for venue in ws.get('venues',[]):
            if not venue.get('ack') or not venue.get('validIdentities'):found.append(label+'_venue_delivery_unknown')
    if probe.get('consistency',{}).get('status')!='verified':found.append('provider_agreement_unverified')
    return sorted(set(found))
def monitor(dc,cfg):
    rows=containers(dc)
    try:health=json.loads(run(dc+['exec','-T','app','node','dist/scripts/cloud-health.js','--report'],output=True,timeout=12))
    except (Failure,sp.TimeoutExpired):health={}
    backup=Path(cfg.get('BACKUP_DIR','/var/backups/mintbot'))
    age=None
    if (backup/'last-success.json').exists():age=(time.time()-json.loads((backup/'last-success.json').read_text())['at'])/3600
    free=min(shutil.disk_usage(p).free/1024**3 for p in [ROOT,backup if backup.exists() else backup.parent,Path('/var/lib/docker')] if p.exists())
    found=alerts(rows,health,free,cfg,age)
    rpcpath=ROOT/'private/rpc-health.json'
    rpc=json.loads(rpcpath.read_text()) if rpcpath.exists() else {}
    found+=rpc_alerts(rpc,time.time())
    stats_rows=json_rows(run(dc+['stats','--no-stream','--format','json'],output=True))
    for row in stats_rows:
        try:
            if float(row.get('MemPerc','0%').rstrip('%'))>85:found.append('container_memory_high')
            if float(row.get('CPUPerc','0%').rstrip('%'))>140:found.append('container_cpu_high')
        except ValueError:found.append('resource_metrics_unavailable')
    if any(r['Service']=='caddy' and r.get('State')!='running' for r in rows):found.append('https_proxy_unavailable')
    if (backup/'last-failure.json').exists() and (not (backup/'last-success.json').exists() or (backup/'last-failure.json').stat().st_mtime>(backup/'last-success.json').stat().st_mtime):found.append('backup_failed')
    # docker stats contains resource numbers only; never inspect environment or logs.
    stats=stats_rows
    print(json.dumps({'at':int(time.time()),'fundedExecution':'disabled','alerts':found,'diskFreeGiB':round(free,2),'load':os.getloadavg(),'dockerStats':stats}))
    return 1 if found else 0

def encrypted_stream(args,destination,cert):
    with destination.open('xb') as out:
        producer=sp.Popen([str(x) for x in args],stdout=sp.PIPE,stderr=sp.DEVNULL)
        try:
            result=sp.run(['openssl','cms','-encrypt','-binary','-aes-256-gcm','-stream','-outform','DER',str(cert)],stdin=producer.stdout,stdout=out,stderr=sp.DEVNULL,timeout=600)
            producer.stdout.close()
            if producer.wait(timeout=30) or result.returncode:raise Failure('Encrypted backup stream failed')
        finally:
            if producer.poll() is None:producer.kill();producer.wait()
        out.flush();os.fsync(out.fileno())
def status(path,name):
    temp=path/(name+'.tmp');temp.write_text(json.dumps({'at':time.time()}));temp.replace(path/name)
def backup(dc,cfg):
    dest=Path(cfg.get('BACKUP_DIR','/var/backups/mintbot'));dest.mkdir(parents=True,mode=0o700,exist_ok=True)
    if dest.is_symlink() or dest.stat().st_mode&0o077:raise Failure('Backup directory requires mode 0700')
    retention=int(cfg.get('BACKUP_RETENTION_DAYS','14'))
    if retention<1:raise Failure('Retention must be >=1 day')
    cert=Path(cfg.get('BACKUP_CERT','/etc/mintbot/backup-recipient.pem'))
    run(['openssl','x509','-in',cert,'-checkend','86400','-noout'])
    if any(r['Service']=='research' and r.get('State')=='running' for r in containers(dc)):raise Failure('Stop bounded research explicitly before evidence backup')
    label=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:8]
    staging=dest/('.partial-'+label);staging.mkdir(mode=0o700)
    paused=False
    try:
        encrypted_stream(dc+['exec','-T','postgres','pg_dump','-U','mintbot_owner','-d','mintbot','-Fc'],staging/'database.cms',cert)
        app=run(dc+['ps','-q','app'],output=True).decode().strip()
        if not app:raise Failure('App must exist for file evidence snapshot')
        run(['docker','pause',app]);paused=True
        encrypted_stream(['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','1000:1000','--volumes-from',app+':ro','--entrypoint','tar',cfg['MINTBOT_IMAGE'],'-czf','-','-C','/app','data','research-data','research-control'],staging/'evidence.cms',cert)
        run(['docker','unpause',app]);paused=False
        (staging/'manifest.json').write_text(json.dumps({'schemaVersion':1,'at':time.time(),'image':cfg['MINTBOT_IMAGE'],'database':'pg_dump custom','evidence':'quiesced app, stopped research; includes WAL and stop/owner records','encryption':'CMS AES-256-GCM'}))
        staging.rename(dest/label);status(dest,'last-success.json')
        for p in dest.iterdir():
            if re.fullmatch(r'\d{8}T\d{6}Z-[a-f0-9]{8}',p.name) and p.is_dir() and not p.is_symlink() and time.time()-p.stat().st_mtime>retention*86400:shutil.rmtree(p)
        print('Encrypted database and separate evidence backups completed')
    except BaseException:
        status(dest,'last-failure.json');raise
    finally:
        if paused:run(['docker','unpause',app])
        if staging.exists():shutil.rmtree(staging)
def decrypt(archive,key,args):
    producer=sp.Popen(['openssl','cms','-decrypt','-binary','-inform','DER','-inkey',str(key),'-in',str(archive)],stdout=sp.PIPE,stderr=sp.DEVNULL)
    try:
        result=sp.run(args,stdin=producer.stdout,stdout=sp.PIPE,stderr=sp.PIPE,timeout=600);producer.stdout.close()
        if producer.wait(timeout=30) or result.returncode:raise Failure('Decryption or isolated restore verification failed')
        return result.stdout
    finally:
        if producer.poll() is None:producer.kill();producer.wait()
def restore_drill(directory,key,cfg):
    private(key)
    name='mintbot-cloud-drill-'+uuid.uuid4().hex
    try:
        run(['docker','run','-d','--name',name,'--network','none','--read-only','--user','postgres','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/var/lib/postgresql/data:rw,mode=0700,uid=70,gid=70','--tmpfs','/var/run/postgresql:rw,mode=0777','--tmpfs','/tmp','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_USER=mintbot_owner','-e','POSTGRES_DB=mintbot',cfg.get('POSTGRES_IMAGE','postgres:17-alpine')])
        for _ in range(40):
            try:run(['docker','exec',name,'pg_isready','-h','127.0.0.1','-U','mintbot_owner']);break
            except Failure:time.sleep(.5)
        else:raise Failure('Disposable restore database startup failed')
        decrypt(directory/'database.cms',key,['docker','exec','-i',name,'pg_restore','-U','mintbot_owner','-d','mintbot','--exit-on-error','--no-owner','--no-acl'])
        result=run(['docker','exec',name,'psql','-U','mintbot_owner','-d','mintbot','-Atc',"SELECT count(*) FROM events; SELECT count(*) FROM wallets; SELECT count(*) FROM orders; SELECT count(*) FROM positions;"],output=True)
        # Read-only tar validation; never extracts owner locks/WAL onto active volumes.
        decrypt(directory/'evidence.cms',key,['tar','-tzf','-'])
        print(json.dumps({'restore':'verified-isolated','coreTableCounts':[int(x) for x in result.splitlines()],'evidenceArchive':'readable','activeDatabaseTouched':False}))
    finally:run(['docker','rm','-f','-v',name])
def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser();parser.add_argument('--env-file',type=Path,default=ROOT/'cloud.env');parser.add_argument('--project',default='mintbot-cloud');parser.add_argument('--tunnel',action='store_true');parser.add_argument('--https',action='store_true')
    parser.add_argument('action',choices=['prerequisites','validate','install','start','health','monitor','backup','restore-drill','update','rollback','emergency-stop','rpc-check']);parser.add_argument('--archive',type=Path);parser.add_argument('--key',type=Path);args=parser.parse_args()
    if not re.fullmatch(r'mintbot-cloud(?:-[a-z0-9-]+)?',args.project):raise Failure('Cloud project name required')
    if args.action=='prerequisites':prerequisite();return 0
    cfg=config(args.env_file)
    dc=['docker','compose','--project-name',args.project,'--env-file',str(args.env_file),'-f',str(ROOT/'compose.cloud.yaml')]
    if args.tunnel and args.https:raise Failure('Select one access mode')
    if args.tunnel:dc+=['-f',str(ROOT/'compose.cloud.tunnel.yaml')]
    if args.https:dc+=['--profile','https']
    # Separate operation lock never touches research owner/fencing state.
    lockdir=ROOT/'private';lockdir.mkdir(mode=0o700,exist_ok=True)
    with (lockdir/'cloud-maintenance.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.action=='restore-drill':
            if not args.archive or not args.key:raise Failure('Provide --archive and --key')
            restore_drill(args.archive,args.key,cfg);return 0
        validate(cfg);run(dc+['config','-q'])
        if args.action=='rpc-check':
            # Finite, allowlisted reads only; never the research engine entrypoint.
            try:
                data=run(dc+['--profile','research','run','--rm','--no-deps','-T','--entrypoint','node','research','dist/scripts/cloud-runtime.js','diagnostic','--run'],output=True,timeout=60)
                probe=json.loads(data)
            except (Failure,ValueError,sp.TimeoutExpired):probe={'status':'failed'}
            temp=ROOT/'private/rpc-health.tmp'
            temp.write_text(json.dumps({'observedAt':time.time(),'probe':probe}));temp.replace(ROOT/'private/rpc-health.json')
            print('Bounded RPC availability observation retained privately; no coverage approval')
            return 1 if probe.get('status')=='failed' else 0
        if args.action=='validate':return 0
        if args.action=='install':
            prerequisite()
            # Named volumes copy image ownership on first use. Bind secret ownership is explicit.
            pg_uid=run(['docker','run','--rm','--network','none','--entrypoint','id',cfg.get('POSTGRES_IMAGE','postgres:17-alpine'),'-u','postgres'],output=True).decode().strip()
            if pg_uid!='70':raise Failure('Runbook currently requires Alpine postgres UID 70')
            if os.geteuid()!=0:raise Failure('Installation requires root to set bind-secret ownership')
            os.chown(ROOT/'private/cloud-runtime.json',1000,1000);os.chown(ROOT/'private/postgres-password',70,70);os.chown(ROOT/'private/database-app-password',70,70)
            clock=ROOT/'private/research-clock';clock.mkdir(mode=0o700,exist_ok=True);os.chown(clock,1000,1000)
            for volume,uid in [('pg-data',70),('paper-state',1000),('research-state',1000),('research-control',1000),('caddy-data',1000),('caddy-config',1000)]:
                name=args.project+'_'+volume
                exists=sp.run(['docker','volume','inspect',name],stdout=sp.DEVNULL,stderr=sp.DEVNULL).returncode==0
                if not exists:
                    run(['docker','volume','create','--label','com.docker.compose.project='+args.project,'--label','com.docker.compose.volume='+volume,name])
                    run(['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','DAC_OVERRIDE','--cap-add','FOWNER','--user','0','-v',name+':/initialize','--entrypoint','sh',cfg['MINTBOT_IMAGE'],'-c',f'chown -R {uid}:{uid} /initialize && chmod 700 /initialize'])
                run(['docker','run','--rm','--network','none','--read-only','--cap-drop','ALL','--user',f'{uid}:{uid}','-v',name+':/verify','--entrypoint','test',cfg['MINTBOT_IMAGE'],'-w','/verify'])
            print('Secret ownership installed; existing volumes and records preserved');return 0
        if args.action in ('start','update','rollback'):
            if args.tunnel and any(r['Service']=='caddy' and r.get('State')=='running' for r in containers(dc)):raise Failure('Stop the existing public proxy before selecting tunnel access')
            if not (args.tunnel or args.https):raise Failure('Select --https or --tunnel explicitly')
            if args.https and (not re.fullmatch(r'(?:[a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}',cfg.get('MINTBOT_DOMAIN','')) or not cfg.get('ACME_EMAIL')):raise Failure('Domain and ACME email required')
            if any(r['Service']=='research' and r.get('State')=='running' for r in containers(dc)):raise Failure('Explicitly stop research before maintenance')
            if args.action=='update':backup(dc,cfg)
            run(['docker','image','inspect',cfg['MINTBOT_IMAGE']])
            services=['postgres','app']+(['caddy'] if args.https else [])
            run(dc+['up','-d','--no-build','--wait','--wait-timeout','120']+services,timeout=180)
            print('Services healthy; research was not launched');return 0
        if args.action=='backup':
            try:backup(dc,cfg)
            except BaseException:
                dest=Path(cfg.get('BACKUP_DIR','/var/backups/mintbot'))
                if dest.is_dir() and not dest.is_symlink() and not dest.stat().st_mode&0o077:status(dest,'last-failure.json')
                raise
            return 0
        if args.action=='emergency-stop':
            run(dc+['exec','-T','app','node','--input-type=module','-e',"import {requestResearchStop} from './dist/src/research/stop-control.js';await requestResearchStop('/app/research-control/global-stop.json','kill');"])
            run(dc+['stop','research']);print('Sticky research stop written; confirm process termination and retained evidence');return 0
        if args.action=='health':
            run(dc+['exec','-T','app','node','dist/scripts/cloud-health.js']);print('Authenticated database-aware readiness passed');return 0
        return monitor(dc,cfg)
if __name__=='__main__':
    try:sys.exit(main())
    except (Failure,OSError,ValueError,KeyError,sp.SubprocessError):print('Cloud operation failed; configuration, prerequisites or service check failed (secret details withheld)',file=sys.stderr);sys.exit(1)
