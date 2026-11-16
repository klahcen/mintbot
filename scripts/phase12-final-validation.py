"""Validate retained evidence and delivered Phase 12 reports; never grants trading permission."""
from pathlib import Path
import datetime
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/phase12'


def read(name):
    return json.loads((OUT / name).read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')


def verify_manifest(manifest):
    changed = [p for p, h in manifest.items()
               if not (ROOT / p).is_file() or digest(ROOT / p) != h]
    assert not changed, f'Immutable artifact changed: {changed}'
    return len(manifest)


prior_count = verify_manifest(read('prior-artifact-sha256.json'))
retained_count = verify_manifest(read('completion-validation/retained-phase12-sha256.json'))
start = read('source-at-start-sha256.json')['files']
test_count = verify_manifest({p: h for p, h in start.items() if p.startswith('tests/')})
verify_manifest({p: h for p, h in start.items()
                 if p.startswith('vendor/') or p in ['package-lock.json',
                    'src/market/deployment-pins.json', 'src/market/pump-layouts.json',
                    'src/market/pumpswap-layouts.json', 'src/market/meteora-layouts.json',
                    'src/protocol-layouts.json']})

coherence = {}
for run in ['mainnet', 'final-mainnet', 'final-release-probe']:
    directory = OUT / 'runtime' / run
    manifest = json.loads((directory / 'runtime-manifest.json').read_text())['hashes']
    rows = {}
    for p, h in manifest.items():
        if not (p.startswith('dist/src/') or p in [
                'dist/scripts/phase9-mainnet.js', 'dist/scripts/phase11-mainnet.js']):
            continue
        captured = digest(directory / 'source-at-start' / p)
        assert captured == h, f'{run} captured module differs: {p}'
        rows[p] = {'atRun': h, 'currentBuild': digest(ROOT / p)}
    assert rows, f'No runtime core captured: {run}'
    changes = [p for p, v in rows.items() if v['atRun'] != v['currentBuild']]
    if run == 'mainnet':
        assert set(changes) == {'dist/src/ingestion.js', 'dist/src/research/candidates.js',
                                'dist/src/research/coverage.js', 'dist/scripts/phase9-mainnet.js'}
    else:
        assert not changes, f'Delivered core differs from final container: {changes}'
    coherence[run] = {'modulesChecked': len(rows), 'laterCoreChanges': changes, 'checks': rows}
save('loaded-runtime-coherence.json', coherence)

log = (OUT / 'completion-validation/tests.log').read_text()
match = re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)', log, re.S)
assert match and int(match[1]) >= 312 and match[1] == match[2] and match[3] == '0'
build = read('completion-validation/clean-build.json')
assert build['node'].startswith('v22.')
assert {r['check'] for r in build['checks']} == {
    'install', 'typecheck', 'build', 'audit', 'python-clock-tests'}
assert all(r['exitCode'] == 0 for r in build['checks'])
clean_root = Path(build['directory'])
clean_checks = {
    p: {'delivered': row['currentBuild'], 'cleanBuild': digest(clean_root / p)}
    for p, row in coherence['final-mainnet']['checks'].items()
}
assert all(row['delivered'] == row['cleanBuild'] for row in clean_checks.values())
save('clean-runtime-coherence.json', clean_checks)
audit = json.loads((OUT / 'completion-validation/audit.log').read_text())
assert audit['metadata']['vulnerabilities']['total'] == 0
python_log = (OUT / 'completion-validation/python-tests.log').read_text()
assert 'Ran 5 tests' in python_log and 'OK' in python_log

for name in ['builder-reference.json', 'quote-reference.json']:
    rows = read(name)['rows']
    assert rows and all(r.get('equal') is True for r in rows), name
provider = read('provider-validation.json')
policy = read('current-window-policy-proposal.json')
assert provider['eligible'] is False and policy['independentlyApproved'] is False
assert policy['paperAuthorized'] is False and policy['fundedAuthorized'] is False
assert read('pumpswap-contract-review.json')['variantEnabled'] is False
assert read('global-layout-review.json')['tailNameEstablished'] is False
smoke = read('final-release-probe-stop-owner-smoke.json')
assert smoke['ledgerKilled'] and smoke['ownerReleased'] and smoke['stopRequested']
assert smoke['secondOwnerExitCode'] != 0 and smoke['paperTrades'] == 0
assert len(read('host-health-cli-guards.json')['rows']) == 4

runs = {}
for name, outcomes in [('mainnet', 'candidate-outcomes.json'),
                       ('final-mainnet', 'final-candidate-outcomes.json')]:
    evidence = read(f'runtime/{name}/evidence.json')
    funnel = read(outcomes)
    assert funnel['selectedReceipts'] == len(evidence['rows']) == sum(funnel['counts'].values())
    assert funnel['paperEntries'] == funnel['paperExits'] == 0
    assert evidence['pipeline']['fatal'] is None and evidence['journal']['writerFailure'] is None
    runs[name] = {
        'notifications': evidence['notifications'],
        'selectedCandidates': len(evidence['rows']),
        'verifiedCreationsDuringRun': sum(r.get('verifiedLaunches', 0) for r in evidence['rows']),
        'supervisor': evidence['supervisor'],
        'funnel': funnel['counts'],
        'gaps': evidence['journal']['gaps'],
        'refusals': evidence['refusalCounts'],
        'paperEntries': 0, 'paperExits': 0,
    }

reports = ['phase12-engineering-report.md', 'host-clock-reliability.md',
           'current-pump-financial-contract.md', 'pumpswap-variant-validation.md',
           'raydium-meteora-creation-coverage.md', 'provider-and-gap-validation.md',
           'current-chain-paper-execution.md', 'operational-ownership-validation.md',
           'performance-and-security.md', 'architecture.md', 'phase-status.md',
           'remaining-funded-trading-blockers.md']
paths = [ROOT / 'docs' / name for name in reports] + [ROOT / 'README.md', OUT / 'README.md']
missing = []
links = 0
planned_outputs = {OUT / name for name in [
    'validation-summary.json', 'delivery-source-sha256.json', 'delivery-artifact-sha256.json']}
for path in paths:
    assert path.is_file(), path
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
        if '://' in target or target.startswith('#'):
            continue
        links += 1
        destination = (path.parent / target.split('#')[0]).resolve()
        if not destination.exists() and destination not in planned_outputs:
            missing.append({'document': str(path.relative_to(ROOT)), 'target': target})
assert not missing, missing

summary = {
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'fullPhaseAcceptance': False, 'endToEndCurrentPaperValidated': False,
    'tests': {'total': int(match[1]), 'passed': int(match[2]), 'failed': int(match[3]),
              'originalPhase11TestsRetained': 307, 'pythonClockTestsPassed': 5},
    'priorArtifactFilesUnchanged': prior_count,
    'retainedPhase12FilesUnchanged': retained_count,
    'originalTestFilesUnchanged': test_count,
    'cleanBuild': build, 'audit': audit['metadata']['vulnerabilities'],
    'cleanBuildCompiledCoreMatchesDelivered': len(clean_checks),
    'stableHostExperimentSeconds': read('clock-stability/evidence.json')['actualMonotonicSeconds'],
    'completionClockExperiment': read('clock-completion/evidence.json'),
    'monitoringRunsNeverCombined': runs,
    'extended1800SecondAcceptance': False,
    'currentPumpApproved': False, 'observedPumpSwapVariantApproved': False,
    'raydiumCreationFinalizedAfterRun': True, 'meteoraCreationAcceptance': False,
    'independentAuthenticatedProviders': 'unavailable', 'independentEpochApproval': False,
    'paperEntries': 0, 'paperExits': 0,
    'signingBroadcastSpending': False, 'liveTrading': False,
    'reportLinksChecked': links,
}
save('validation-summary.json', summary)
source_paths = {p for root in ['src', 'scripts', 'tests', 'config', 'vendor', 'frontend/src']
                for p in (ROOT / root).rglob('*')
                if p.is_file() and '__pycache__' not in p.parts}
source_paths.update(paths)
source_paths.update(ROOT / name for name in ['package.json', 'package-lock.json',
                    'tsconfig.json', 'Dockerfile', 'frontend/package.json'])
source_paths.update(ROOT.glob('compose*.yaml'))
save('delivery-source-sha256.json', {
    'generatedAt': summary['generatedAt'],
    'files': {str(p.relative_to(ROOT)): digest(p)
              for p in sorted(source_paths) if p.is_file()},
})
save('delivery-artifact-sha256.json', {
    'generatedAt': summary['generatedAt'],
    'files': {str(p.relative_to(ROOT)): digest(p)
              for p in sorted(OUT.rglob('*'))
              if p.is_file() and p.name != 'delivery-artifact-sha256.json'},
})
print(json.dumps({k: summary[k] for k in ['tests', 'priorArtifactFilesUnchanged',
      'stableHostExperimentSeconds', 'paperEntries', 'paperExits', 'fullPhaseAcceptance']}))
