"""Offline retained-byte classification; no fork, token-risk or provider-cause guesses."""
from pathlib import Path
import json,collections,hashlib,argparse,re
parser=argparse.ArgumentParser();parser.add_argument('--run',default='docs/phase10/runtime/mainnet-validated');parser.add_argument('--reconciliation',default='docs/phase10/runtime-reconciliation.json');parser.add_argument('--output',default='docs/phase11/phase10-forensics.json');parser.add_argument('--allow-retained-subset',action='store_true');args=parser.parse_args()
out=Path('docs/phase11');run=Path(args.run)
e=json.loads((run/'evidence.json').read_text())
frames=[]
for line in (run/'ingestion.wal').read_text().splitlines():
 f=json.loads(line);record=f['record'];assert hashlib.sha256(json.dumps(record,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()==f['sha256'];frames.append(f)
q=json.loads(Path(args.reconciliation).read_text())['quarantined']
refusals=[]
for p in sorted(p for p in run.iterdir() if p.is_file() and (p.name.startswith('refusals') and p.name.endswith('.jsonl') or re.fullmatch(r'refusals\.jsonl\.archive-\d+',p.name))):
 for line in p.read_text().splitlines():
  r=json.loads(line);observed=r['event'];old=r.get('retainedObservation');differences=None
  if old:
   differences={'slotChanged':old['slot']!=observed['slot'],'failedChanged':old['failed']!=observed['failed'],'retainedLogLines':len(old['logs']),'observedLogLines':len(observed['logs']),'commonPrefixLines':next((i for i,(a,b) in enumerate(zip(old['logs'],observed['logs'])) if a!=b),min(len(old['logs']),len(observed['logs']))),'logsEqual':old['logs']==observed['logs']}
  refusals.append({'id':r['id'],'at':r['at'],'status':r['status'],'reason':r.get('reason'),'observedFingerprint':r.get('observedFingerprint'),'retainedFingerprint':r.get('retainedFingerprint'),'retainedPayloadAvailable':old is not None,'differences':differences,'originalEvent':observed,'retainedObservation':old})
incidents=[r for r in e['supervisor']['events'] if r['kind']=='incident'];backpressure=[r for r in e['supervisor']['events'] if r['kind']=='backpressure-pause']
result={'generatedFrom':str(run)+'; retained final evidence, no source payloads modified','walFrames':len(frames),'quarantineCount':len(q),'quarantineCauses':dict(collections.Counter(r['lastFailure']['message'] for r in q)),'quarantines':q,'refusalCount':len(refusals),'recordedRefusalReasons':dict(collections.Counter(r.get('reason') or r['status'] for r in refusals)),'knownDuplicatesSeparate':e['telemetry']['counters'].get('ingest.duplicates',0),'conflictsWithRetainedPayload':sum(r['retainedPayloadAvailable'] for r in refusals),'refusalRotation':e['refusalStorage'],'refusals':refusals,'transport':{'totalIncidents':e['supervisor']['incidents'],'transportFaultEvents':len(incidents),'backpressurePauses':len(backpressure),'faults':dict(collections.Counter(r.get('code') or r.get('reason','unknown') for r in incidents))},'historicalGap':e['journal']['gaps'],'liveTrading':False,'scope':'All available retained refusal records and checksummed WAL frames. A changed payload is not proof of a fork, malicious token or provider culpability. Original bytes remain immutable; this analysis neither retries nor deletes ownership.'}
if args.allow_retained_subset:
 assert len(refusals)<=e['refused']
 result.update({'reportedRefusalCount':e['refused'],'missingRefusalPayloads':e['refused']-len(refusals),'retainedSubsetOnly':len(refusals)!=e['refused'],'missingPayloadDisposition':'Unavailable predecessor or rotated payload remains unknown; no recovery/identity/authorization inferred.'})
else:assert len(refusals)==e['refused']
Path(args.output).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['walFrames','quarantineCount','quarantineCauses','refusalCount','recordedRefusalReasons','knownDuplicatesSeparate','conflictsWithRetainedPayload','transport']}))
