"""Verify final Phase14 claims and seal artifacts without approving any execution policy."""
from pathlib import Path
import base64, hashlib, json, re
root=Path(__file__).resolve().parents[1];out=root/'docs/phase14'
def read(path):return json.loads((root/path).read_text())
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
start=read('docs/phase14/source-at-start-sha256.json')
assert all(digest(root/p)==h for p,h in start.items() if p.startswith('tests/'))
for p in ['package-lock.json','src/market/deployment-pins.json','src/market/pump-layouts.json','src/market/pumpswap-layouts.json','src/market/meteora-layouts.json','src/protocol-layouts.json']:
 assert digest(root/p)==start[p]
prior=read('docs/phase13/delivery-artifact-sha256.json')['files']
assert all(digest(root/p)==h for p,h in prior.items())
validated=read('docs/phase14/validated-source-sha256.json')
assert all(digest(root/p)==h for p,h in validated.items())
clean=read('docs/phase14/clean-validation.json');assert clean['node'].startswith('v22.')
for name in ['install','typecheck-final','build-final','tests-retest','python-clock-tests','audit']:
 assert any(c['name']==name and c['exitCode']==0 for c in clean['checks']),name
log=(out/'clean-tests-retest.log').read_text();m=re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)',log,re.S)
assert m and m.groups()==('328','328','0')
assert 'Ran 5 tests' in (out/'clean-python-clock-tests.log').read_text()
assert json.loads((out/'clean-audit.log').read_text())['metadata']['vulnerabilities']['total']==0
smoke=read('docs/phase14/production-container-smoke.json')
assert smoke['checks']['liveModeRejected'] and smoke['checks']['researchUnauthorized']==401
assert smoke['checks']['authorized']==200 and smoke['liveTrading'] is False
control=read('docs/phase14/delivery-control.json');assert control['paperEntries']==control['paperExits']==0 and not control['liveTrading']
zeros=[]
for row in control['rows']:
 for trace in row['wire']:
  if trace['outcome']!='unverifiable-zero-signature':continue
  raw=base64.b64decode(trace['sanitizedBase64']);assert trace['byteExact'] and not trace['captureTruncated']
  assert hashlib.sha256(raw).hexdigest()==trace['originalSha256']
  assert json.loads(raw)['params']['result']['value']['signature']=='1'*64
  zeros.append(trace)
assert len(zeros)==5
assert {r['host']:r['normalizedNotifications'] for r in control['rows']}=={'solana-rpc.publicnode.com':0,'api.mainnet-beta.solana.com':27100}
perf=read('docs/phase14/matched-performance.json');assert len(perf['rows'])==12
assert all(r['completed']==r['offered'] and not r['duplicateLogicalProcessing'] for r in perf['rows'])
for path,n in [('builder-reference.json',8),('quote-reference.json',16)]:
 rows=read('docs/phase14/'+path)['rows'];assert len(rows)==n and all(r['equal'] for r in rows)
acceptance=read('docs/phase14/acceptance.json');assert len(acceptance['criteria'])==11
assert acceptance['providerAuthorization'] is acceptance['epochAuthorization'] is acceptance['liveTrading'] is False
required=['phase14-engineering-report','selective-websocket-delivery','provider-integrity-matrix','zero-signature-incident-analysis',
 'supported-market-validation','creation-detection-coverage','coverage-and-epoch-review','end-to-end-paper-results',
 'operational-monitoring-results','security-and-performance-validation','external-prerequisites','remaining-funded-trading-blockers']
assert all((root/'docs'/(p+'.md')).is_file() for p in required)
source={str(p.relative_to(root)):digest(p) for base in ['src','tests','scripts','config'] for p in (root/base).rglob('*') if p.is_file() and '__pycache__' not in str(p)}
(out/'final-source-sha256.json').write_text(json.dumps(source,indent=2)+'\n')
result={'typescriptTests':328,'pythonClockTests':5,'priorArtifactsUnchanged':len(prior),'byteExactNewZeroProofs':len(zeros),
 'matchedBenchmarkJobs':len(perf['rows']),'auditAdvisories':0,'providerAuthorization':False,'epochAuthorization':False,
 'paperEntries':0,'paperExits':0,'liveTrading':False,'overall':'PARTIAL / EXTERNALLY BLOCKED'}
(out/'validation-summary.json').write_text(json.dumps(result,indent=2)+'\n')
paths=[p for p in out.rglob('*') if p.is_file() and p.name not in ['final-artifact-sha256.json','final-validation.log']]
paths += [root/'docs'/(p+'.md') for p in required] + [root/'README.md',root/'docs/architecture.md',root/'docs/phase-status.md']
(out/'final-artifact-sha256.json').write_text(json.dumps({str(p.relative_to(root)):digest(p) for p in paths},indent=2)+'\n')
print(json.dumps(result))
