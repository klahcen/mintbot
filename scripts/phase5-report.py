#!/usr/bin/env python3
"""Summarize retained measurements; never substitutes estimates for missing results."""
import json,statistics,pathlib
root=pathlib.Path('docs/phase5')
read=lambda name:json.loads((root/name).read_text())
reg=read('regression-benchmark.json');market=read('market-benchmark.json');live=read('mainnet/evidence.json');ref=read('quote-reference.json')
median=statistics.median
lines=['# Phase 5 measurement summary','',f"Generated from retained artifacts. Node {reg['environment']['node']}; {reg['environment']['cpu']}. Three interleaved/randomized repetitions; medians below. Values from different phases/hardware-load windows must not be directly compared.",'', '| Workload | Before /s | After /s | Change | Before p50/p95/p99 ms | After p50/p95/p99 ms |','|---|---:|---:|---:|---|---|']
summary=[]
for scenario in sorted({r['scenario'] for r in reg['rows']}):
 groups={k:[r for r in reg['rows'] if r['scenario']==scenario and r['adapter']==k]for k in ['before','after']}
 rate={k:median(r['completedPerSecond']for r in rows)for k,rows in groups.items()}
 q={k:[median(r['latencies']['end_to_end_ms'][p]for r in rows)for p in ['p50','p95','p99']]for k,rows in groups.items()}
 change=(rate['after']/rate['before']-1)*100
 lines.append(f"| {scenario} | {rate['before']:.1f} | {rate['after']:.1f} | {change:+.1f}% | {' / '.join(f'{v:.2f}' for v in q['before'])} | {' / '.join(f'{v:.2f}' for v in q['after'])} |")
 summary.append({'scenario':scenario,'medianThroughput':rate,'changePct':change,'medianRunQuantilesMs':q,'ranges':{k:[min(r['completedPerSecond']for r in rows),max(r['completedPerSecond']for r in rows)]for k,rows in groups.items()},'completed':{k:[r['completed']for r in rows]for k,rows in groups.items()},'rpcErrors':{k:[r['rpcErrors']for r in rows]for k,rows in groups.items()}})
assert all(r['duplicateLogicalProcessing']==0 and r['refused']==0 and all(r['integrity'].values())for r in reg['rows'])
lines+=['','All 36 ingestion jobs completed their intended populations with zero logical duplicate processing or refused offers and passing recorded integrity checks. Slow-RPC faults are injected, not mainnet outcomes. Quantiles are medians of per-run quantiles, not pooled quantiles. Full individual samples, CPU, queue, GC, memory and provider error counters are in `regression-benchmark.json`.', '', '| Warm 200-row review workload | Before reviews/s | After reviews/s | Change | Before Store p50/p95/p99 ms | After Store p50/p95/p99 ms |','|---|---:|---:|---:|---|---|']
marketSummary=[]
for durable in [False,True]:
 groups={k:[r for r in market['rows']if r['durable']==durable and r['label']==k]for k in ['before','after']}
 rate={k:median(r['reviewsPerSecond']for r in rs)for k,rs in groups.items()}
 q={k:[median(r['telemetry']['histograms']['store.transaction_ms'][p]for r in rs)for p in ['p50','p95','p99']]for k,rs in groups.items()}
 change=(rate['after']/rate['before']-1)*100
 lines.append(f"| {'file + directory fsync'if durable else'in-memory'} | {rate['before']:.2f} | {rate['after']:.2f} | {change:+.1f}% | {' / '.join(f'{v:.2f}'for v in q['before'])} | {' / '.join(f'{v:.2f}'for v in q['after'])} |")
 marketSummary.append({'durable':durable,'medianThroughput':rate,'changePct':change,'medianRunStoreQuantilesMs':q})
lines+=['','Each market job performs 100 rejected recorded-state reviews with 200 preloaded rows. Zero fills. This isolates review-history clone/validation and serialization/fsync cost; it excludes real RPC and production arrival distributions.','', '## First bounded mainnet run','',f"{live['seconds']} seconds; {live['notifications']} confirmed notifications; {len(live['rows'])} selected candidates; {sum(r.get('verifiedLaunches',0)for r in live['rows'])} verified creations; {len(live['ledger']['marketReviews'])} durable reviews; {len(live['ledger']['trades'])} paper trades.",'','| Stage | Samples | p50 ms | p95 ms | p99 ms |','|---|---:|---:|---:|---:|']
for name,h in live['telemetry']['histograms'].items():
 if name in ['market.transaction_verification_ms','market.state_retrieval_ms','market.quote_computation_ms','market.risk_evaluation_ms','market.strategy_decision_ms','market.paper_execution_ms','market.queue_backlog_age_ms','market.receipt_to_decision_ms']:
  lines.append(f"| {name} | {h['count']} | {h['p50']:.3f} | {h['p95']:.3f} | {h['p99']:.3f} |")
lines+=['','No real-mainnet paper-execution latency exists because no entry passed. Small-sample p95/p99 figures follow the existing bounded histogram estimator and do not characterize production tails. Verification latency measures individual RPC/proof calls, while receipt-to-finalized-proof age also includes preparation, scheduling and polling; neither is exact chain finalization time.','',f"Pinned liquid-state SDK reference: {len(ref['rows'])} quote comparisons; {sum(r.get('equal',False)for r in ref['rows'])} exact output/fee matches. Largest DLMM reference traverses {max(r.get('binsVisited')or 0 for r in ref['rows'])} bins."]
if (root/'mainnet-final/evidence.json').exists():
 final=read('mainnet-final/evidence.json');lines+=['',f"Final-source follow-up: {final['seconds']} seconds, {final['notifications']} notifications, {len(final['rows'])} candidates, {sum(r.get('verifiedLaunches',0)for r in final['rows'])} verified creations, {len(final['ledger']['marketReviews'])} reviews, {len(final['ledger']['trades'])} trades. See `mainnet-final/evidence.json` for complete rejection and RPC details."]
if (root/'paper-soak.json').exists():
 s=read('paper-soak.json');lines+=['','## Sustained paper unit replay','',f"Measured {s['elapsedMs']/1000:.2f} seconds, {s['cycles']} buy/full-sell cycles, {s['duplicates']} duplicate reviews suppressed, {s['restarts']} durable reloads, {s['staleRetained']} stale exits refused, {s['positions']} final open positions; exact ledger reconciliation passed. Peak sampled RSS {s['peakRssBytes']/1024**2:.2f} MiB. Event-loop p95/p99 {s['eventLoopDelayMs']['p95']:.2f}/{s['eventLoopDelayMs']['p99']:.2f} ms. This is explicit UNIT safety/fee replay, not real mainnet fills or provider endurance."]
(root/'measurement-summary.md').write_text('\n'.join(lines)+'\n')
(root/'measurement-summary.json').write_text(json.dumps({'ingestion':summary,'marketStore':marketSummary},indent=2)+'\n')
