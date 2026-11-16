"""Offline Phase15 gate/source audit. No RPC requests, secret values, approvals or ledger writes.
Use a new output directory for each run; existing evidence is never overwritten.
"""
from pathlib import Path
import argparse, datetime, hashlib, json, os, re
ROOT = Path(__file__).resolve().parents[1]
p = argparse.ArgumentParser()
p.add_argument('--output', required=True)
a = p.parse_args()
out = ROOT / a.output
out.mkdir(parents=True, exist_ok=False)
def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
def emit(name, value):
    with (out / name).open('x') as f:
        json.dump(value, f, indent=2); f.write('\n')
keys = ['SOLANA_RPC_URL', 'SOLANA_SECONDARY_RPC_URL', 'SOLANA_WS_URL',
        'SOLANA_SECONDARY_WS_URL', 'RESEARCH_PROVIDERS_PATH']
dot = {}
for name in ['.env', '.env.local']:
    path = ROOT / name
    if path.is_file():
        names = set(re.findall(r'^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=', path.read_text(), re.M))
        dot[name] = {k: k in names for k in keys}
emit('configuration-presence.json', {
    'checkedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'environmentPresence': {k: bool(os.environ.get(k)) for k in keys},
    'dotEnvKeyPresence': dot,
    'scope': 'Presence only; never establishes authentication, capacity, attribution or approval.',
    'authorizationGranted': False})
prior = json.loads((ROOT/'docs/phase15/source-at-start-sha256.json').read_text())
protected = [k for k in prior if k.startswith('tests/') or k.endswith('layouts.json') or k in
             ['package-lock.json', 'src/market/deployment-pins.json']]
changed = [k for k in protected if not (ROOT/k).is_file() or digest(ROOT/k) != prior[k]]
versions = json.loads((ROOT/'docs/phase14/version-diagnostics.json').read_text())
assert len(versions['rows']) == 2
for row in versions['rows']:
    assert row['request']['params'][1]['maxSupportedTransactionVersion'] == 0
    assert row['response']['error']['code'] == -32015
lock = json.loads((ROOT/'package-lock.json').read_text())
reader_limits = {name: [int(v) for v in re.findall(r'maxSupportedTransactionVersion:\s*(\d+)', (ROOT/name).read_text())]
                 for name in ['src/chain.ts', 'src/verified-rpc.ts', 'src/backfill.ts']}
runtime_changes = [name for name, h in prior.items() if name.startswith('src/') and digest(ROOT/name) != h]
emit('offline-audit.json', {
    'readerLimitsFromSource': reader_limits, 'runtimeSourceChanges': runtime_changes,
    'protectedFilesChecked': len(protected), 'changedProtectedFiles': changed,
    'recordedVersionFailures': len(versions['rows']),
    'recordedVersionEvidenceSha256': digest(ROOT/'docs/phase14/version-diagnostics.json'),
    'lockedWeb3Version': lock['packages']['node_modules/@solana/web3.js']['version'],
    'sdkInspectorMaximumVersion': 0,
    'nativeParsedReaderMaximumVersion': 1,
    'historicalParsedCreationVersions': ['legacy', 0, 1],
    'fullApplicationV1Proof': False,
    'sdkSupportDoesNotEstablishApplicationSupport': True,
    'freshV1FixturesValidated': 0, 'paperEntries': 0, 'paperExits': 0,
    'providerAuthorization': False, 'epochAuthorization': False, 'liveTrading': False})
if changed:
    raise SystemExit('Protected source changed; inspect offline-audit.json')
