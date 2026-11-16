"""Clean Node22 verification in an isolated install; legacy database summary writes are isolated from retained evidence."""
from pathlib import Path
import os, shutil, subprocess, tempfile, json, time, argparse
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output-root',required=True);args=parser.parse_args()
out=root/args.output_root;out.mkdir(parents=True,exist_ok=False)
if (out/'clean-validation.json').exists():raise SystemExit('Existing validation preserved; choose a new --output-root')
work=Path(tempfile.mkdtemp(prefix='mintbot-phase15-clean-'))
for name in ['src','scripts','tests','frontend','vendor','config']:
    shutil.copytree(root/name,work/name,ignore=shutil.ignore_patterns('node_modules','dist','__pycache__'))
for name in ['package.json','package-lock.json','tsconfig.json']:
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
checks=[]
for name,args in [('install',['npm','ci']),('typecheck',['npm','run','typecheck']),('build',['npm','run','build']),('tests',['npm','test']),('python-clock-tests',['python3','-m','unittest','discover','-s','tests','-p','test_phase12_host_health.py']),('audit',['npm','audit','--json'])]:
    start=time.monotonic()
    with (out/('clean-'+name+'.log')).open('w') as log:
        result=subprocess.run(args,cwd=work,env=env,stdout=log,stderr=subprocess.STDOUT)
    if name=='tests':
        for relative in sorted(mutable):
            dest=out/'database-evidence'/relative;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(work/relative,dest)
    checks.append({'name':name,'args':args,'exitCode':result.returncode,'durationSeconds':time.monotonic()-start})
    (out/'clean-validation.json').write_text(json.dumps({'node':node,'directory':str(work),'checks':checks},indent=2)+'\n')
    print(name,result.returncode,flush=True)
