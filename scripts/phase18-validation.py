"""Phase18 clean Node22 verification in an isolated install; legacy database summary writes are isolated from retained evidence."""
from pathlib import Path
import os, shutil, subprocess, tempfile, json, time, argparse
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output-root',required=True);parser.add_argument('--serial-tests',action='store_true',help='Use one test-file worker for short transport deadlines');options=parser.parse_args()
out=root/options.output_root;out.mkdir(parents=True,exist_ok=False)
if (out/'clean-validation.json').exists():raise SystemExit('Existing validation preserved; choose a new --output-root')
work=Path(tempfile.mkdtemp(prefix='mintbot-phase18-clean-'))
for name in ['src','scripts','tests','frontend','vendor','config']:
    shutil.copytree(root/name,work/name,ignore=shutil.ignore_patterns('node_modules','dist','__pycache__'))
for name in ['package.json','package-lock.json','tsconfig.json','compose.research.yaml','.dockerignore','.gitignore']:
    shutil.copy2(root/name,work/name)
# Only the two legacy summaries are writable copies; fixtures remain read-only inputs.
mutable = {'docs/phase7/persistent-database-validation.json', 'docs/phase8/database-validation.json'}
(work/'docs').mkdir()
for entry in (root/'docs').iterdir():
    target=work/'docs'/entry.name
    if entry.name not in ['phase7','phase8']:
        target.symlink_to(entry,target_is_directory=entry.is_dir())
    else:
        for directory, dirs, files in os.walk(entry):
            relative=Path(directory).relative_to(root)
            (work/relative).mkdir(parents=True,exist_ok=True)
            for name in files:
                source=Path(directory)/name; dest=work/relative/name
                if str(relative/name) in mutable: shutil.copy2(source,dest)
                else: dest.symlink_to(source)
env=dict(os.environ);env['PATH']='/home/lkazaz/.nvm/versions/node/v22.22.0/bin:'+env['PATH']
node=subprocess.check_output(['node','--version'],env=env,text=True).strip()
assert node.startswith('v22.'),node
# Existing DB tests derive retained-cluster defaults from os.homedir(). Override that
# API only in disposable test processes; never repurpose HOME or touch operator clusters.
isolated_home=work/'test-user';(isolated_home/'.local/state').mkdir(parents=True)
bootstrap=work/'test-home.cjs'
bootstrap.write_text("const os=require('node:os');os.homedir=()=>"+json.dumps(str(isolated_home))+";require('node:module').syncBuiltinESMExports();\n")
checks=[]
for name,args in [('install',['npm','ci']),('typecheck',['npm','run','typecheck']),('build',['npm','run','build']),('tests',['npm','test']),('python-clock-tests',['python3','-m','unittest','discover','-s','tests','-p','test_phase12_host_health.py']),('audit',['npm','audit','--json'])]:
    if name=='tests' and options.serial_tests:
        args=['node','--import','tsx','--test','--test-concurrency=1',*[str(p.relative_to(work)) for p in sorted((work/'tests').glob('*.test.ts'))]]
    start=time.monotonic()
    with (out/('clean-'+name+'.log')).open('w') as log:
        check_env=dict(env)
        if name=='tests': check_env['NODE_OPTIONS']='--require='+str(bootstrap)
        result=subprocess.run(args,cwd=work,env=check_env,stdout=log,stderr=subprocess.STDOUT)
    if name=='tests':
        for relative in sorted(mutable):
            dest=out/'database-evidence'/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(work/relative,dest)
    checks.append({'name':name,'args':args,'exitCode':result.returncode,'durationSeconds':time.monotonic()-start})
    (out/'clean-validation.json').write_text(json.dumps({'node':node,'directory':str(work),'testDatabaseIsolation':'disposable os.homedir override; HOME unchanged','isolatedTestHome':str(isolated_home),'checks':checks},indent=2)+'\n')
    print(name,result.returncode,flush=True)
