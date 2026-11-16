"""Verify retained public wire bytes and link them to research admission, without touching WALs."""
from pathlib import Path
import argparse
import base64
import collections
import datetime
import hashlib
import json

parser = argparse.ArgumentParser()
parser.add_argument('--run-directory', required=True)
parser.add_argument('--output', required=True)
args = parser.parse_args()
run = Path(args.run_directory)
evidence = json.loads((run / 'evidence.json').read_text())
paths = sorted(run.glob('wire-identity.jsonl*'))
paths = [p for p in paths if p.name == 'wire-identity.jsonl' or '.archive-' in p.name]
assert sum(p.stat().st_size for p in paths) <= 50 * 1024 * 1024
records = [json.loads(line) for path in paths for line in path.read_text().splitlines() if line]
wire = [r for r in records if r['stage'] == 'wire-to-observation']
admissions = [r for r in records if r['stage'] == 'stable-identity-and-wal-admission']
proofs = []
unlinked = []
for record in wire:
    if not record.get('byteExact'):
        continue
    raw = base64.b64decode(record['sanitizedBase64'], validate=True)
    assert len(raw) == record['originalBytes']
    assert hashlib.sha256(raw).hexdigest() == record['originalSha256']
    message = json.loads(raw)
    signature = message.get('params', {}).get('result', {}).get('value', {}).get('signature')
    if signature != '1' * 64:
        continue
    assert record['extractedSignature'] == record['observationSignature'] == signature
    linked = [r for r in admissions if r['wireIdentitySha256'] == record['originalSha256']
              and r['signature'] == signature and r['program'] == record['program']
              and r['slot'] == record['slot']]
    if not linked:
        unlinked.append({'wireSha256': record['originalSha256'], 'program': record['program'],
                         'slot': record['slot'], 'status': 'WAL admission link unavailable; excluded from joined proof'})
        continue
    assert all(r['result']['reason'] == 'unverifiable-zero-signature'
               and r['result']['status'] == 'unrecoverable' and r['durable'] for r in linked)
    proofs.append({
        'providerHost': record['providerHost'], 'connection': record['connection'],
        'slot': record['slot'], 'program': record['program'],
        'wireSha256': record['originalSha256'], 'wireBytes': len(raw),
        'incomingSignature': signature, 'normalizedSignature': record['observationSignature'],
        'admission': linked,
    })
result = {
    'generatedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'runDirectory': str(run), 'sourceManifest': str(run / 'runtime-manifest.json'),
    'recordCounts': dict(collections.Counter(r['stage'] for r in records)),
    'wireOutcomeCounts': dict(collections.Counter(r['outcome'] for r in wire)),
    'byteExactZeroProofs': proofs,
    'byteExactZeroSamplesWithoutAdmissionLink': unlinked,
    'remotePayloadOriginDemonstrated': bool(proofs),
    'remoteServerInternalReason': 'unknown; incoming envelopes do not identify the remote emission mechanism',
    'applicationFallbackResponsibleForCapturedCases': False if proofs else None,
    'captureLimits': evidence['identityAudit'],
    'notifications': evidence['notifications'], 'refusals': evidence['refusalCounts'],
    'paperEntries': sum(t['side'] == 'buy' for t in evidence['ledger']['trades']),
    'paperExits': sum(t['side'] == 'sell' for t in evidence['ledger']['trades']),
    'artifacts': {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
    'scope': 'Proves the supplied sampled bytes at the local WebSocket receive boundary, not an upstream chain transaction, provider culpability, or the historical cause of unavailable Phase12 envelopes. No signature is substituted. Non-exact/redacted/truncated captures are excluded from byte-exact proof.',
    'liveTrading': False,
}
with Path(args.output).open('x') as output:
    output.write(json.dumps(result, indent=2) + '\n')
print(json.dumps({'byteExactZeroProofs': len(proofs), 'notifications': result['notifications'],
                  'remotePayloadOriginDemonstrated': bool(proofs)}))
