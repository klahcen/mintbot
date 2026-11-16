"""Summarize retained A/A and separately instrumented profiles without speedup attribution."""
import collections, glob, hashlib, json, pathlib, statistics
root=pathlib.Path('docs/phase8'); a=json.load(open(root/'performance-aa-final.json')); p=json.load(open(root/'performance-scheduling-final.json'))
summary={'kind':'A/A unchanged implementation, concurrent research load; no optimization claim','sourceHashesMatch':a['sourceSha256']['before']==a['sourceSha256']['after'],'scenarios':[],'scheduling':[],'cpuProfiles':[]}
for scenario in a['selectedScenarios']:
 rows=[r for r in a['rows'] if r['scenario']==scenario]; x={'scenario':scenario,'adapters':{}}
 for adapter in ['before','after']:
  rs=[r for r in rows if r['adapter']==adapter]; rates=[r['completedPerSecond'] for r in rs]
  x['adapters'][adapter]={'throughputMedian':statistics.median(rates),'throughputMin':min(rates),'throughputMax':max(rates),'offeredTotal':sum(r['offered'] for r in rs),'completedTotal':sum(r['completed'] for r in rs),'duplicatesTotal':sum(r['duplicateLogicalProcessing'] for r in rs),'refusedTotal':sum(r['refused'] for r in rs),'allIntegrityPass':all(all(r['integrity'].values())for r in rs)}
 x['observedDifferencePct']=(x['adapters']['after']['throughputMedian']/x['adapters']['before']['throughputMedian']-1)*100;summary['scenarios'].append(x)
for r in p['rows']:
 threads=r['threadScheduling']['threads'];main=next(t for t in threads if t['main']);others=[t for t in threads if not t['main']]
 summary['scheduling'].append({'scenario':r['scenario'],'adapter':r['adapter'],'elapsedMs':r['elapsedMs'],'mainRuntimeMs':main['runtimeMs'],'mainRunqueueWaitMs':main['runqueueWaitMs'],'otherThreadsRuntimeMs':sum(t['runtimeMs']for t in others),'otherThreadsRunqueueWaitMs':sum(t['runqueueWaitMs']for t in others),'sampleCount':r['threadScheduling']['sampleCount'],'gc':r['gc'],'json':r['jsonInstrumentation'],'eventLoopDelayMs':r['eventLoopDelayMs'],'processCpuMicroseconds':r['cpuMicroseconds'],'workerHistograms':{k:v for k,v in r['telemetry']['histograms'].items()if k.startswith('journal.worker') or k=='store.persistence_ms'}})
for filename in sorted(glob.glob(str(root/'cpu-profile-final/*.cpuprofile'))):
 profile=json.load(open(filename));nodes={n['id']:n for n in profile['nodes']};hits=collections.Counter()
 for i,node in enumerate(profile.get('samples',[])):
  frame=nodes[node]['callFrame'];hits[(frame['functionName'],frame['url'])]+=profile['timeDeltas'][i]
 summary['cpuProfiles'].append({'file':filename,'sha256':hashlib.sha256(pathlib.Path(filename).read_bytes()).hexdigest(),'sampleCount':len(profile.get('samples',[])),'observedSampleTimeMs':sum(profile.get('timeDeltas',[]))/1000,'topSelfSamples':[{'function':fn,'url':url,'sampleTimeMs':us/1000}for(fn,url),us in hits.most_common(25)],'allFsyncSelfSampleTimeMs':sum(us for(fn,url),us in hits.items()if fn=='fsync')/1000})
json.dump(summary,open(root/'performance-attribution-summary.json','w'),indent=2)
