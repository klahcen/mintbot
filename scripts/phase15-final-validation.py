"""Verify Phase15 local results and seal evidence; never grants external authorization.
Historical summary loss is an explicit FAIL, not silently excluded from preservation.
"""
from pathlib import Path
import hashlib, json, re
root=Path(__file__).resolve().parents[1];out=root/'docs/phase15'
def read(p): return json.loads((root/p).read_text())
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
start=read('docs/phase15/source-at-start-sha256.json')
protected=[p for p in start if p.startswith('tests/') or p.endswith('layouts.json') or p in ['package-lock.json','src/market/deployment-pins.json']]
assert all(digest(root/p)==start[p] for p in protected)
assert all(digest(root/p)==h for p,h in start.items() if p.startswith('src/'))
clean=read('docs/phase15/isolated-final/clean-validation.json')
assert clean['node'].startswith('v22.')
assert {c['name'] for c in clean['checks'] if c['exitCode']==0}=={'install','typecheck','build','tests','python-clock-tests','audit'}
log=(out/'isolated-final/clean-tests.log').read_text()
m=re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)',log,re.S)
assert m and int(m[1])>=330 and m[1]==m[2] and m[3]=='0'
assert 'Ran 5 tests' in (out/'isolated-final/clean-python-clock-tests.log').read_text()
assert json.loads((out/'isolated-final/clean-audit.log').read_text())['metadata']['vulnerabilities']['total']==0
smoke=read('docs/phase15/production-container-smoke-delivery.json')
assert smoke['checks']['liveModeRejected'] and smoke['checks']['authorized']==200 and smoke['checks']['researchUnauthorized']==401 and smoke['liveTrading'] is False
prior=read('docs/phase15/prior-artifact-sha256.json')
intentional={'README.md','docs/phase-status.md','docs/remaining-funded-trading-blockers.md'}
for p in intentional: assert digest(out/'prior-root-docs'/p)==prior[p]
changed=[p for p,h in prior.items() if digest(root/p)!=h and p not in intentional]
expected={'docs/phase7/persistent-database-validation.json','docs/phase8/database-validation.json'}
assert set(changed)==expected, changed
preservation={'status':'FAIL','priorArtifactsChecked':len(prior),'intentionalCurrentDocumentUpdates':sorted(intentional),
 'changedHistoricalSummaryFiles':[{ 'path':p,'originalSha256':prior[p],'currentSha256':digest(root/p),'originalBytesRecovered':False} for p in sorted(changed)],
 'allOtherPriorArtifactsUnchanged':True,
 'cause':'Legacy clean validator symlinked docs; original PostgreSQL tests overwrote two mutable root summaries before isolated wrapper was added. No matching original-byte backup was found. Hashes are preserved; no reconstruction is claimed.'}
(out/'preservation-check.json').write_text(json.dumps(preservation,indent=2)+'\n')
required=['phase15-engineering-report','external-gate-assessment','versioned-transaction-validation','per-venue-delivery-validation','independent-provider-consistency','reviewed-coverage-epoch','supported-market-paper-lifecycle','monitoring-and-performance','remaining-funded-trading-blockers']
assert all((root/'docs'/(p+'.md')).is_file() for p in required)
assert (out/'security-validation.md').is_file()
# Verify measured runtime/test sources still match the isolated final installation.
measured=Path(clean['directory'])
for base in ['src','tests']:
 for p in (root/base).rglob('*'):
  if p.is_file(): assert digest(p)==digest(measured/p.relative_to(root)),str(p)
source={str(p.relative_to(root)):digest(p) for base in ['src','tests','scripts','config'] for p in (root/base).rglob('*') if p.is_file() and '__pycache__' not in str(p)}
(out/'final-source-sha256.json').write_text(json.dumps(source,indent=2)+'\n')
result={'overall':'PARTIAL / EXTERNALLY BLOCKED; acceptance unmet','typescriptTests':int(m[1]),'originalTypeScriptTestsPreserved':True,'pythonClockTests':5,'auditAdvisories':0,'containerSmoke':'PASS','sourceIntegrity':'PASS','historicalPreservation':'FAIL','historicalSummariesChanged':sorted(changed),'otherPriorArtifactsUnchanged':len(prior)-len(intentional)-len(changed),'providerAuthorization':False,'epochAuthorization':False,'researchProbe300Seconds':'NOT RUN: Gate 0','researchRun1800Seconds':'NOT RUN: Gate 0','paperEntries':0,'paperExits':0,'liveTrading':False}
(out/'validation-summary.json').write_text(json.dumps(result,indent=2)+'\n')
acceptance={'gates':[{'gate':i,'status':'PARTIAL' if i in [1,7] else 'EXTERNALLY BLOCKED'} for i in range(8)],'historicalPreservation':'FAIL','fundedAndSelfApprovalBoundaries':'PASS','decisivePaperLifecycleAcceptance':'UNMET','phaseComplete':False,'firstBlockingDependency':'Operator-provided authenticated RPC pair with independently reviewed operating attribution','paperEntries':0,'paperExits':0}
(out/'acceptance.json').write_text(json.dumps(acceptance,indent=2)+'\n')
paths=[p for p in out.rglob('*') if p.is_file() and '__pycache__' not in str(p) and p.name not in ['final-artifact-sha256.json','final-validation.log']]
paths += [root/'docs'/(p+'.md') for p in required]+[root/p for p in sorted(intentional)]
(out/'final-artifact-sha256.json').write_text(json.dumps({str(p.relative_to(root)):digest(p) for p in paths},indent=2)+'\n')
print(json.dumps(result))
