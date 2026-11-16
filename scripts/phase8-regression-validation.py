"""Run unchanged original tests while preserving prior-phase evidence their legacy helpers refresh."""
from pathlib import Path
import hashlib,json,subprocess
root=Path.cwd();out=root/'docs/phase8'
preserved={p:p.read_bytes() for d in ['docs/phase6','docs/phase7'] for p in Path(d).rglob('*') if p.is_file()}
changes=[]
try:
 with (out/'after-tests.log').open('w') as log:
  result=subprocess.run(['npm','test'],stdout=log,stderr=subprocess.STDOUT)
finally:
 for p,data in preserved.items():
  if not p.exists() or p.read_bytes()!=data:
   if p.exists():
    destination=out/'prior-helper-rerun'/p;destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(p.read_bytes());changes.append({'path':str(p),'phase8Rerun':str(destination.relative_to(root))})
   p.write_bytes(data)
 (out/'prior-evidence-preservation.json').write_text(json.dumps({'restoredPreviousEvidence':changes,'preservedOriginalFiles':len(preserved),'scope':'Unmodified old tests refresh a Phase7 diagnostic JSON. Rerun evidence retained under Phase8 and original bytes restored.'},indent=2)+'\n')
raise SystemExit(result.returncode)
