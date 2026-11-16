"""Final evidence and integrity accounting; phase acceptance never inferred from test success."""
from pathlib import Path
import json,hashlib,re,datetime
O=Path('docs/phase11');R=O/'runtime/mainnet-validated'
def read(name):return json.loads((O/name).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name,value):(O/name).write_text(json.dumps(value,indent=2)+'\n')
e=read('runtime/mainnet-validated/evidence.json');assert e.get('endedAt');s=e['supervisor'];j=e['journal'];status=read('report-status.json');assert status['finalEvidence']
prior=read('prior-artifact-sha256.json');priorChanges=[p for p,h in prior.items() if not Path(p).is_file() or sha(p)!=h]
start=read('source-at-start-sha256.json')['files'];tests={p:h for p,h in start.items() if p.startswith('tests/')};testChanges=[p for p,h in tests.items() if sha(p)!=h]
assert not priorChanges and not testChanges,(priorChanges,testChanges)
critical={p:h for p,h in start.items() if p.startswith('vendor/') or p in ['package-lock.json','src/market/deployment-pins.json','src/market/pump-layouts.json','src/market/pumpswap-layouts.json','src/market/meteora-layouts.json','src/protocol-layouts.json']}
assert all(sha(p)==h for p,h in critical.items()),'Reviewed pins/layouts/local bigint/dependency lock changed'
assert read('performance-node22.json')['comparisonKind'].startswith('A/A unchanged source control')
save('prior-evidence-integrity.json',{'priorArtifactFilesChecked':len(prior),'priorArtifactChanges':priorChanges,'originalTestFixtureFilesChecked':len(tests),'originalTestFixtureChanges':testChanges})
primaryManifest=read('runtime/mainnet-validated/runtime-manifest.json');primaryChecks={}
for p,h in primaryManifest['hashes'].items():
 if p.startswith('dist/src/') or p in ['dist/scripts/phase9-mainnet.js','dist/scripts/phase11-mainnet.js']:
  primaryChecks[p]={'atRun':h,'copiedAtStart':sha(R/'source-at-start'/p),'currentBuild':sha(p)}
assert all(v['atRun']==v['copiedAtStart'] for v in primaryChecks.values())
primaryChanges=[p for p,v in primaryChecks.items() if v['atRun']!=v['currentBuild']]
assert set(primaryChanges)=={'dist/src/market/paper.js','dist/src/simulation/paper-gate.js'},primaryChanges
save('primary-runtime-coherence.json',{'checks':primaryChecks,'laterCoreChanges':primaryChanges,'scope':'Primary clock-discontinuity run predates the final exit-fence propagation. Its actual snapshot remains unchanged. These two core changes are exercised separately in the release probe.'})
releaseRoot=O/'runtime/release-probe';manifest=read('runtime/release-probe/runtime-manifest.json');checks={}
for p,h in manifest['hashes'].items():
 if p.startswith('dist/src/') or p in ['dist/scripts/phase9-mainnet.js','dist/scripts/phase11-mainnet.js']:
  checks[p]={'atRun':h,'copiedAtStart':sha(releaseRoot/'source-at-start'/p),'currentBuild':sha(p)}
assert checks and all(len(set(v.values()))==1 for v in checks.values()),'Final release compiled core differs'
save('loaded-runtime-coherence.json',{'checks':checks,'actualFinalRuntime':'runtime/release-probe','primaryRunLaterChanges':primaryChanges,'scope':'All captured final compiled core assets/modules and research entrypoints equal the release probe snapshot and current local build. The primary longer run is the earlier version, not hot-reloaded. The final short probe validates ownership/stop, not fresh eligible entry/exit or the requested monitoring duration.'})
log=(O/'delivery-validation/after-tests.log').read_text();m=re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)',log,re.S);assert m and m[1]==m[2] and m[3]=='0'
outcomes=read('candidate-outcomes.json');assert outcomes['selectedReceipts']==len(e['rows'])==sum(outcomes['counts'].values())
wire=read('builder-reference.json');quote=read('quote-reference.json');assert all(r.get('equal') for r in wire['rows']) and all(r.get('equal') for r in quote['rows'])
assert len(wire['rows'])==8 and len(quote['rows'])==16
provider=read('provider-validation.json');assert not provider['eligible']
op=read('release-stop-owner-smoke.json');assert op['ledgerKilled'] and op['ownerReleased'] and op['historicalEpochsRetained']==2 and not op['paperTrades']
api=read('control-api-smoke.json');assert api['stickyAfterReset'] and api['doubleOwnerTopologyRejected']
audit=read('dependency-audit.json')['metadata']['vulnerabilities']
summary={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'engineeringDelivered':True,'endToEndCurrentPaperValidated':False,'fullPhaseAcceptance':False,'originalTestsRetained':299,'tests':{'total':int(m[1]),'passed':int(m[2]),'failed':int(m[3])},'originalTestFixtureFilesUnchanged':len(tests),'priorArtifactFilesUnchanged':len(prior),'compiledFinalReleaseAssetsAndEntrypointsMatching':len(checks),'primaryRunPredatesExitFencePropagation':primaryChanges,'advisories':audit,'monitoring':{k:s[k] for k in ['state','elapsedMs','wallElapsedMs','clockDiscontinuityMs','connectedMs','acknowledgedMs','disconnectedMs','connections','incidents']},'monotonic1800SecondTargetMet':status['durationTargetMet'],'continuousCoverage':False,'independentProviders':'unmet','independentlyReviewedEpochPolicy':'unmet','venueCounts':e['venueCounts'],'notifications':e['notifications'],'selectedCandidates':len(e['rows']),'verifiedCreations':sum(r.get('verifiedLaunches',0) for r in e['rows']),'candidateOutcomes':outcomes['counts'],'marketReasons':e['rejectionCounts'],'verificationReasons':e['verificationRejectionCounts'],'paperEntries':outcomes['paperEntries'],'paperExits':outcomes['paperExits'],'activePending':j['activePending'],'quarantined':j['quarantined'],'admissionRefusals':e['refused'],'refusalCounts':e['refusalCounts'],'historicalPhase10QuarantinesRetained':79,'historicalPhase10Gap':'unrecoverable','currentGapStatuses':{g['program']:g['status'] for g in j['gaps']},'writerFailure':j['writerFailure'],'pipelineFatal':e['pipeline']['fatal'],'termination':'terminal-clock-discontinuity; unobserved wall interval excluded','sdkWireVectorsEqual':8,'sdkQuoteVectorsEqual':16,'currentUnsignedSimulations':'PumpSwap buy and Raydium sell succeeded as separate diagnostic subjects; current buys/sells on other attempted routes failed construction/inventory/liquidity/budget checks. No fresh paper eligibility inferred.','operationalProbeSecondsExcluded':[read('operational-stop-owner-smoke.json')['observedSeconds'],op['observedSeconds']],'liveTrading':False,'signingBroadcastSpending':False}
save('validation-summary.json',summary)
reports=['phase11-engineering-report.md','current-pump-compatibility.md','market-venue-coverage.md','current-chain-paper-validation.md','coverage-and-quarantine-policy.md','provider-agreement-validation.md','performance-validation.md','operational-integration.md','security-and-release-blockers.md']
missing=[];links=0
for p in [Path('README.md'),Path('docs/phase-status.md'),O/'README.md']+[Path('docs')/name for name in reports]:
 for target in re.findall(r'\]\(([^)]+)\)',p.read_text()):
  if '://' in target or target.startswith('#'):continue
  links+=1
  if not (p.parent/target.split('#')[0]).exists():missing.append({'document':str(p),'target':target})
assert not missing,missing
save('report-link-validation.json',{'linksChecked':links,'missing':missing})
paths=set(start)
for root in ['src','scripts','tests','config','vendor','frontend/src']:
 paths.update(str(p) for p in Path(root).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
paths.update(str(p) for p in Path('.').glob('compose*.yaml'));paths.update(['README.md','docs/phase-status.md'])
save('delivery-source-sha256.json',{'generatedAt':summary['generatedAt'],'files':{p:sha(p) for p in sorted(paths) if Path(p).is_file()}})
save('delivery-artifact-sha256.json',{'generatedAt':summary['generatedAt'],'files':{str(p):sha(p) for p in sorted(O.rglob('*')) if p.is_file() and p.name!='delivery-artifact-sha256.json'}})
print(json.dumps({k:summary[k] for k in ['tests','notifications','selectedCandidates','candidateOutcomes','paperEntries','paperExits','monotonic1800SecondTargetMet','fullPhaseAcceptance']}))
