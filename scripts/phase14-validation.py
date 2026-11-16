"""Clean Node22 verification in an isolated install; retained evidence is read through a docs symlink."""
from pathlib import Path
import os, shutil, subprocess, tempfile, json, time, argparse
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output-root',default='docs/phase14');args=parser.parse_args()
out=root/args.output_root;out.mkdir(parents=True,exist_ok=True)
if (out/'clean-validation.json').exists():raise SystemExit('Existing validation preserved; choose a new --output-root')
work=Path(tempfile.mkdtemp(prefix='mintbot-phase14-clean-'))
for name in ['src','scripts','tests','frontend','vendor','config']:
    shutil.copytree(root/name,work/name,ignore=shutil.ignore_patterns('node_modules','dist','__pycache__'))
for name in ['package.json','package-lock.json','tsconfig.json']:
    shutil.copy2(root/name,work/name)
(work/'docs').symlink_to(root/'docs',target_is_directory=True)
env=dict(os.environ);env['PATH']='/home/lkazaz/.nvm/versions/node/v22.22.0/bin:'+env['PATH']
node=subprocess.check_output(['node','--version'],env=env,text=True).strip()
assert node.startswith('v22.'),node
checks=[]
for name,args in [('install',['npm','ci']),('typecheck',['npm','run','typecheck']),('build',['npm','run','build']),('tests',['npm','test']),('python-clock-tests',['python3','-m','unittest','discover','-s','tests','-p','test_phase12_host_health.py']),('audit',['npm','audit','--json'])]:
    start=time.monotonic()
    with (out/('clean-'+name+'.log')).open('w') as log:
        result=subprocess.run(args,cwd=work,env=env,stdout=log,stderr=subprocess.STDOUT)
    checks.append({'name':name,'args':args,'exitCode':result.returncode,'durationSeconds':time.monotonic()-start})
    (out/'clean-validation.json').write_text(json.dumps({'node':node,'directory':str(work),'checks':checks},indent=2)+'\n')
    print(name,result.returncode,flush=True)
