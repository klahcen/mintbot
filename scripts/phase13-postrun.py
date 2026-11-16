"""Derive reviewable reports only from the finished primary Phase 13 window."""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import os
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--run', action='store_true')
args = parser.parse_args()
if not args.run:
    raise SystemExit('Explicit --run required for final evidence derivation')
out = Path('docs/phase13')
run = out / 'runtime/mainnet-validated'
deadline = time.monotonic() + 2200
while not (run / 'evidence.json').exists() or not (out / 'mainnet-validated-stable-monitor-exit.json').exists():
    if time.monotonic() > deadline:
        raise SystemExit('Final primary evidence unavailable; no report acceptance inferred')
    time.sleep(2)
env = dict(os.environ)
env['PATH'] = '/home/lkazaz/.nvm/versions/node/v22.22.0/bin:' + env['PATH']
jobs = [
    ('reconciliation', ['node', '--import', 'tsx', 'scripts/phase10-reconciliation.ts',
        '--wal', str(run / 'ingestion.wal'), '--evidence', str(run / 'evidence.json'),
        '--source-manifest', str(run / 'runtime-manifest.json'), '--output', str(out / 'runtime-reconciliation.json')]),
    ('forensics', ['python3', 'scripts/phase11-prior-forensics.py', '--run', str(run),
        '--reconciliation', str(out / 'runtime-reconciliation.json'), '--allow-retained-subset',
        '--output', str(out / 'run-forensics.json')]),
    ('outcomes', ['node', 'scripts/phase11-candidate-outcomes.mjs', '--root', str(out),
        '--run-name', 'mainnet-validated', '--reconciliation', 'runtime-reconciliation.json']),
    ('identity-analysis', ['python3', 'scripts/phase13-identity-report.py', '--run-directory', str(run),
        '--output', str(out / 'identity-mainnet-analysis.json')]),
    ('postrun-creations', ['node', '--import', 'tsx', 'scripts/phase12-postrun-verification.ts', '--run',
        '--evidence', str(run / 'evidence.json'), '--output', str(out / 'postrun-creation-verification.json')]),
]
commands = []
for name, command in jobs:
    with (out / (name + '.log')).open('x') as stream:
        result = subprocess.run(command, env=env, stdout=stream, stderr=subprocess.STDOUT)
    commands.append({'name': name, 'args': command, 'exitCode': result.returncode})
    if result.returncode:
        (out / 'postrun-command-failure.json').write_text(json.dumps(commands, indent=2) + '\n')
        raise SystemExit(result.returncode)

e = json.loads((run / 'evidence.json').read_text())
postrun = json.loads((out / 'postrun-creation-verification.json').read_text())
reconciliation = json.loads((out / 'runtime-reconciliation.json').read_text())
for row in postrun['rows']:
    verified = [launch for attempt in row['attempts'] for launch in (attempt.get('verified') or [])]
    if not verified: continue
    event = row['original']
    selected = next(item for item in e['rows'] if item['event']['program'] == event['program'] and item['event']['signature'] == event['signature'])
    quarantine = next((item for item in reconciliation['quarantined'] if item['observation']['program'] == event['program'] and item['observation']['signature'] == event['signature']), None)
    target = out / (event['program'].split('-')[0]+'-current-creation-fixture.json')
    with target.open('x') as stream:
        stream.write(json.dumps({'sourceEvidenceSha256': hashlib.sha256((run/'evidence.json').read_bytes()).hexdigest(), 'originalObservation': event,
            'wireIdentitySha256': selected.get('wireIdentitySha256'), 'originalQuarantine': quarantine, 'postrunVerifiedLaunches': verified,
            'capturedFinalizedTransactionsAndAccounts': postrun['captured'], 'eligibleForPaper': False,
            'scope': 'Actual selected live receipt, late finalized proof retained for independent review. Original WAL quarantine remains unchanged; no fresh receipt, retry authorization or entry is inferred.'}, indent=2)+'\n')
source = run / 'evidence.json'
with (out / 'coverage-history.json').open('x') as stream:
    stream.write(json.dumps({'endedAt': e['endedAt'], 'journal': e['journal'],
        'sourceArtifact': {'path': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                           'bytes': source.stat().st_size},
        'scope': 'One completed Phase13 primary window, unresolved evidence retained; epoch approval remains unmet.'}, indent=2) + '\n')
diagnostics = {}
for name in ['current-buy-simulations.json', 'current-sell-simulations.json']:
    value = json.loads((out / name).read_text())
    diagnostics[name] = {'telemetry': value.get('telemetry'), 'elapsedMs': value.get('elapsedMs'),
                         'memoryBefore': value.get('memoryBefore'), 'memoryAfter': value.get('memoryAfter'),
                         'eventLoopDelayMs': value.get('eventLoopDelayMs')}
with (out / 'performance-summary.json').open('x') as stream:
    stream.write(json.dumps({'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'comparisonKind': 'Descriptive metric populations only; no matched performance improvement claim',
        'primaryTelemetry': e['telemetry'], 'primaryResources': e['resources'],
        'finalSample': e['samples'][-1] if e['samples'] else None,
        'identityAudit': e['identityAudit'], 'diagnosticPopulationsSeparate': diagnostics,
        'scope': 'WAL fsync/group sizes, decision queues, backpressure and CPU/memory describe the actual primary run. Simulation diagnostics are separate public-inventory subjects. No eligible-event latency population is invented.'}, indent=2) + '\n')
with (out / 'postrun-commands.json').open('x') as stream:
    stream.write(json.dumps(commands, indent=2) + '\n')

for name, command in [('report', ['python3', 'scripts/phase13-report.py']),
                       ('integrity', ['python3', 'scripts/phase13-final-validation.py'])]:
    # The output logs exist before artifact sealing, but the final integrity log is excluded from its own digest.
    with (out / (name + '-delivery.log')).open('x') as stream:
        result = subprocess.run(command, env=env, stdout=stream, stderr=subprocess.STDOUT)
    if result.returncode:
        raise SystemExit(result.returncode)
print('Finished primary evidence derivation; inspect validation-summary.json for unmet acceptance gates.')
