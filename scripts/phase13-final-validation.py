"""Seal Phase 13 delivery only after primary evidence and reports exist. Never authorizes an epoch or trade."""
from pathlib import Path
import datetime
import difflib
import hashlib
import json
import re
import tarfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/phase13'


def read(name):
    return json.loads((OUT / name).read_text())


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2) + '\n')


def unchanged(manifest):
    changes = [p for p, h in manifest.items() if not (ROOT / p).is_file() or digest(ROOT / p) != h]
    assert not changes, changes
    return len(manifest)


prior_count = unchanged(read('prior-artifact-sha256.json'))
start = read('source-at-start-sha256.json')['files']
original_tests = unchanged({p: h for p, h in start.items() if p.startswith('tests/')})
critical = {p: h for p, h in start.items() if p.startswith('vendor/') or p in [
    'package-lock.json', 'src/market/deployment-pins.json', 'src/market/pump-layouts.json',
    'src/market/pumpswap-layouts.json', 'src/market/meteora-layouts.json', 'src/protocol-layouts.json']}
unchanged(critical)

e = read('runtime/mainnet-validated/evidence.json')
assert e.get('endedAt') and e['liveTrading'] is False
assert e['coverageEpoch']['researchPolicyReview'] != 'verified'
assert not e['ledger']['trades'], 'Trades under an unapproved epoch require investigation'
funnel = read('candidate-outcomes.json')
assert len(e['rows']) == funnel['selectedReceipts'] == sum(funnel['counts'].values())
assert funnel['paperEntries'] == funnel['paperExits'] == 0
for name in ['identity-probe-analysis.json', 'identity-mainnet-analysis.json']:
    analysis = read(name)
    assert not analysis['paperEntries'] and not analysis['paperExits']
assert read('identity-probe-analysis.json')['remotePayloadOriginDemonstrated']
assert read('provider-validation.json')['eligible'] is False
assert read('provider-history.json')['eligible'] is False
assert read('current-protocol-assessment.json')['newVariantsEnabled'] is False

for name, expected in [('builder-reference.json', 8), ('quote-reference.json', 16)]:
    rows = read(name)['rows']
    assert len(rows) == expected and all(r.get('equal') for r in rows), name

build = read('clean-delivery-validation/clean-build.json')
assert build['node'].startswith('v22.')
assert {r['check'] for r in build['checks']} == {'install', 'typecheck', 'build', 'audit', 'python-clock-tests'}
assert all(r['exitCode'] == 0 for r in build['checks'])
assert 'Ran 5 tests' in (OUT / 'clean-delivery-validation/python-tests.log').read_text()
log = (OUT / 'delivery-validation/after-tests.log').read_text()
match = re.search(r'# tests (\d+).*?# pass (\d+).*?# fail (\d+)', log, re.S)
assert match and int(match[1]) >= 323 and match[1] == match[2] and match[3] == '0'
assert json.loads((OUT / 'clean-delivery-validation/audit.log').read_text())['metadata']['vulnerabilities']['total'] == 0

coherence = {}
clean_root = Path(build['directory'])
for run in ['mainnet-validated', 'final-release-probe']:
    directory = OUT / 'runtime' / run
    manifest = json.loads((directory / 'runtime-manifest.json').read_text())['hashes']
    checks = {}
    for p, h in manifest.items():
        if not (p.startswith('dist/src/') or p in ['dist/scripts/phase9-mainnet.js', 'dist/scripts/phase11-mainnet.js']):
            continue
        checks[p] = {'loaded': h, 'copiedAtRunStart': digest(directory / 'source-at-start' / p),
                     'currentBuild': digest(ROOT / p), 'cleanNode22Build': digest(clean_root / p)}
    assert checks and all(len(set(row.values())) == 1 for row in checks.values()), run
    coherence[run] = checks
save('loaded-runtime-coherence.json', coherence)

ops = read('final-release-probe-stop-owner-smoke.json')
assert ops['secondOwnerExitCode'] != 0 and ops['ownerReleased'] and ops['ledgerKilled'] and ops['stopRequested']
assert not ops['paperTrades']
smoke = read('production-delivery-smoke.json')['checks']
assert smoke['unauthorized'] == smoke['researchUnauthorized'] == 401
assert smoke['authorized'] == smoke['dashboard'] == smoke['researchHttp'] == 200
assert smoke['liveModeRejected'] and smoke['researchLive'] is False

summary = read('validation-summary.json')
assert summary['tests']['total'] == int(match[1]) and summary['fullPhaseAcceptance'] is False
assert summary['paperEntries'] == summary['paperExits'] == 0
assert summary['notifications'] == e['notifications']
assert summary['monitoring']['elapsedMs'] == e['supervisor']['elapsedMs']

reports = ['phase13-engineering-report.md', 'zero-signature-root-cause.md',
           'stable-monitoring-validation.md', 'current-protocol-compatibility.md',
           'raydium-meteora-creation-validation.md', 'independent-provider-and-coverage.md',
           'end-to-end-paper-evidence.md', 'performance-and-security.md', 'phase-status.md',
           'remaining-funded-trading-blockers.md']
paths = [ROOT / 'docs' / name for name in reports] + [ROOT / 'README.md', OUT / 'README.md']
links = 0
planned = {OUT / name for name in ['delivery-source-sha256.json', 'delivery-artifact-sha256.json']}
for path in paths:
    assert path.is_file(), path
    for target in re.findall(r'\]\(([^)]+)\)', path.read_text()):
        if '://' in target or target.startswith('#'):
            continue
        links += 1
        destination = (path.parent / target.split('#')[0]).resolve()
        assert destination.exists() or destination in planned, (path, target)

summary['priorPhase11And12ArtifactFilesUnchanged'] = prior_count
summary['originalTestFilesUnchanged'] = original_tests
summary['reviewedCriticalFilesUnchanged'] = len(critical)
summary['compiledRuntimeAndCleanBuildModulesMatch'] = {run: len(rows) for run, rows in coherence.items()}
summary['reportLinksChecked'] = links
save('validation-summary.json', summary)

# A reviewable source diff is available even though this workspace has no .git directory.
source_paths = {p for root in ['src', 'scripts', 'tests', 'config', 'vendor', 'frontend/src']
                for p in (ROOT / root).rglob('*') if p.is_file() and '__pycache__' not in p.parts}
source_paths.update(paths)
source_paths.update(ROOT / name for name in ['package.json', 'package-lock.json', 'Dockerfile', 'tsconfig.json'])
diffs = []
with tarfile.open(OUT / 'source-at-start.tar.gz') as archive:
    archived = {member.name: archive.extractfile(member).read() for member in archive.getmembers() if member.isfile()}
for path in sorted(source_paths):
    name = str(path.relative_to(ROOT))
    if not name.endswith(('.ts', '.mjs', '.js', '.py', '.md', '.yaml', '.json')):
        continue
    try:
        before = archived.get(name, b'').decode().splitlines(keepends=True)
        after = path.read_text().splitlines(keepends=True)
    except UnicodeError:
        continue
    diffs.extend(difflib.unified_diff(before, after, fromfile='before/' + name, tofile='after/' + name))
(OUT / 'delivery-source.diff').write_text(''.join(diffs))
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
save('delivery-source-sha256.json', {'generatedAt': now, 'files': {
    str(path.relative_to(ROOT)): digest(path) for path in sorted(source_paths) if path.is_file()}})
active_logs = {'integrity-delivery.log', 'postrun-wrapper.log'}
save('delivery-artifact-sha256.json', {'generatedAt': now,
    'excludedActiveOutputLogs': sorted(active_logs), 'files': {
    str(path.relative_to(ROOT)): digest(path) for path in sorted(OUT.rglob('*'))
    if path.is_file() and path.name != 'delivery-artifact-sha256.json' and path.name not in active_logs}})
print(json.dumps({k: summary[k] for k in ['tests', 'notifications', 'paperEntries', 'paperExits',
      'priorPhase11And12ArtifactFilesUnchanged', 'compiledRuntimeAndCleanBuildModulesMatch', 'fullPhaseAcceptance']}))
