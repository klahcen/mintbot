"""Finalize reproducible local integrity checks only after the bounded observer exits."""
from pathlib import Path
from hashlib import sha256
from datetime import datetime, timezone
import json, re

OUT=Path('docs/phase10')
def read(name): return json.loads((OUT/name).read_text())
def digest(path): return sha256(Path(path).read_bytes()).hexdigest()
def save(name,value): (OUT/name).write_text(json.dumps(value,indent=2)+'\n')
e=read('runtime/mainnet-validated/evidence.json')
assert e.get('endedAt'), 'Final evidence required'
s=e['supervisor'];j=e['journal']; ledger=e['ledger']
original=read('starting-source-sha256.json')['files']
prior=read('phase9-artifact-sha256.json')
prior_changes=[p for p,h in prior.items() if not Path(p).exists() or digest(p)!=h]
original_tests={p:h for p,h in original.items() if p.startswith('tests/')}
test_changes=[p for p,h in original_tests.items() if not Path(p).exists() or digest(p)!=h]
assert not prior_changes and not test_changes, (prior_changes,test_changes)
save('prior-evidence-integrity.json',{'phase9ArtifactsChecked':len(prior),'phase9Mismatches':prior_changes,'originalTestFixtureFilesChecked':len(original_tests),'originalTestFixtureChanges':test_changes})
manifest=read('runtime/mainnet-validated/runtime-manifest.json')
checks={}
for path,expected in manifest['hashes'].items():
    if path.startswith('dist/src/') or path in ['dist/scripts/phase9-mainnet.js','dist/scripts/phase10-mainnet.js']:
        checks[path]={'loaded':expected,'currentLocalBuild':digest(path),'equal':expected==digest(path)}
assert checks and all(v['equal'] for v in checks.values()), 'Loaded business code differs from delivery'
save('loaded-runtime-coherence.json',{'checks':checks,'scope':'Every captured compiled src asset/module and both research entrypoints match the current local compiled build. This covers executed core code; the snapshot also includes unimported modules. Later offline diagnostic scripts are outside this import graph.'})
testlog=(OUT/'complete-validation/after-tests.log').read_text()
m=re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)',testlog,re.S)
assert m and m[1]==m[2] and m[3]=='0', 'Full test evidence required'
counts=read('candidate-outcomes.json')
assert counts['selectedReceipts']==len(e['rows'])==sum(counts['counts'].values())
audit=read('final-validation/dependency-audit.json')['metadata']['vulnerabilities']
status=read('report-status.json');assert status['finalEvidence']
summary={
 'generatedAt':datetime.now(timezone.utc).isoformat(),'engineeringDelivered':True,'fullPhaseAcceptance':False,
 'tests':{'total':int(m[1]),'passed':int(m[2]),'failed':int(m[3]),'originalTestsRetained':288,'originalFilesUnchanged':len(original_tests)},
 'priorPhase9ArtifactsUnchanged':len(prior),'compiledCoreAssetsAndEntrypointsMatching':len(checks),'dependencyVulnerabilities':audit,
 'releaseEvidence':{'typecheck':'support-final-typecheck.log','build':'support-final-build.log','cleanNode22TwoStageBuild':'validation/docker-build-clean-node22.log','productionSmoke':'release-validation/production-container-smoke.json','liveSidecarApiSmoke':'dashboard-sidecar-smoke.json','postgresFaultTests':'complete-validation/after-tests.log','sdkWireVectors':'builder-reference.json','sdkQuoteVectors':'quote-reference.json'},
 'monitoring':{k:s[k] for k in ['elapsedMs','wallElapsedMs','clockDiscontinuityMs','connectedMs','acknowledgedMs','disconnectedMs','connections','incidents','state']},
 'monotonicTargetMet':status['monotonicTargetMet'],'continuousProviderCoverage':status['continuousProviderCoverage'],'providerIndependence':'unmet',
 'notifications':e['notifications'],'selectedReceipts':len(e['rows']),'verifiedCreations':sum(r.get('verifiedLaunches',0) for r in e['rows']),
 'paperReviews':len(ledger['marketReviews']),'paperEntries':counts['paperEntries'],'paperExits':counts['paperExits'],'candidateOutcomes':counts['counts'],
 'quarantined':j['quarantined'],'activePending':j['activePending'],'writerFailure':j['writerFailure'],'pipelineFailure':e['pipeline']['fatal'],
 'pumpCompatibility':'blocked: unreviewed deployment 469055660 and 1096-byte Global; reviewed pin unchanged',
 'performance':'Historical 13.4% attribution unresolved; current Node20 median -15.5%, disk-backed Node22 -4.9%; RAM-backed controls excluded from persistent-storage claims',
 'liveTrading':False,'signingBroadcastAndSpending':False}
save('validation-summary.json',summary)
reports=['phase10-engineering-report.md','pump-deployment-compatibility.md','protocol-variant-coverage.md','websocket-supervisor-validation.md','gap-and-quarantine-reconciliation.md','independent-provider-validation.md','end-to-end-paper-results.md','long-duration-monitoring.md','performance-root-cause.md','security-validation.md','remaining-funded-trading-blockers.md']
missing=[];checked=0
for file in [Path('README.md'),Path('docs/phase-status.md'),OUT/'README.md']+[Path('docs')/p for p in reports]:
    for target in re.findall(r'\]\(([^)]+)\)',file.read_text()):
        if '://' in target or target.startswith('#'): continue
        checked+=1
        if not (file.parent/target.split('#')[0]).exists(): missing.append({'document':str(file),'target':target})
assert not missing, missing
save('report-link-validation.json',{'linksChecked':checked,'missing':missing})
source_paths=set(original)
for root in ['src','scripts','tests','vendor','frontend/src']:
    source_paths.update(str(p) for p in Path(root).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
source_paths.update(str(p) for p in Path('.').glob('compose*.yaml'))
source_paths.update(['README.md','docs/phase-status.md','docs/architecture.md'])
save('delivery-source-sha256.json',{'generatedAt':summary['generatedAt'],'files':{p:digest(p) for p in sorted(source_paths) if Path(p).is_file()}})
# Artifact manifest deliberately excludes itself; stopped WAL and final evidence included.
artifacts={str(p):digest(p) for p in sorted(OUT.rglob('*')) if p.is_file() and p.name!='delivery-artifact-sha256.json'}
save('delivery-artifact-sha256.json',{'generatedAt':summary['generatedAt'],'files':artifacts})
print(json.dumps({k:summary[k] for k in ['tests','notifications','verifiedCreations','paperEntries','paperExits','monotonicTargetMet','continuousProviderCoverage','fullPhaseAcceptance']}))
