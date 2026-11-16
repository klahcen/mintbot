"""Independent bounded host/container clock observer. Never reads or rewrites blockchain timestamps."""
import argparse,datetime,hashlib,json,os,shutil,subprocess,time
from pathlib import Path

def clocks():
 out={}
 for key,name in [('realtime','CLOCK_REALTIME'),('monotonic','CLOCK_MONOTONIC'),('boottime','CLOCK_BOOTTIME'),('raw','CLOCK_MONOTONIC_RAW')]:
  ident=getattr(time,name,None);out[key]=time.clock_gettime_ns(ident) if ident is not None else None
 return out

def classify(a,b,period_ms=1000,threshold_ms=1000):
 delta={k:(b[k]-a[k])/1e6 if a.get(k) is not None and b.get(k) is not None else None for k in ['realtime','monotonic','boottime','raw']}
 drift=lambda x,y:delta[x]-delta[y] if delta[x] is not None and delta[y] is not None else None
 wall_mono=drift('realtime','monotonic');boot_mono=drift('boottime','monotonic');wall_boot=drift('realtime','boottime');mono_raw=drift('monotonic','raw')
 issues=[]
 if any(v is not None and v<0 for v in delta.values()):issues.append('clock-regression')
 if wall_mono is not None and abs(wall_mono)>threshold_ms:issues.append('realtime-monotonic-discontinuity')
 if boot_mono is not None and abs(boot_mono)>threshold_ms:issues.append('boottime-monotonic-divergence; suspend/time-namespace evidence requires corroboration')
 if wall_boot is not None and abs(wall_boot)>threshold_ms:issues.append('realtime-boottime-offset-change; adjustment/VM behavior requires corroboration')
 if delta['monotonic'] is not None and delta['monotonic']>period_ms*3:issues.append('process-sampling-pause; scheduling/VM/host cause unknown')
 return {'deltaMs':delta,'realtimeMinusMonotonicMs':wall_mono,'boottimeMinusMonotonicMs':boot_mono,'realtimeMinusBoottimeMs':wall_boot,'monotonicMinusRawMs':mono_raw,'issues':issues}

def read_fact(path,limit=65536):
 try:
  with open(path) as f:return f.read(limit)
 except OSError as e:return {'unavailable':type(e).__name__}

def proc_sample():
 stat=read_fact('/proc/stat');cpu=stat.splitlines()[0] if isinstance(stat,str) else stat
 return {'processCpuNs':time.process_time_ns(),'schedstat':read_fact('/proc/self/schedstat'),'systemCpu':cpu,'loadavg':read_fact('/proc/loadavg'),'uptime':read_fact('/proc/uptime'),'cgroupCpu':read_fact('/sys/fs/cgroup/cpu.stat')}

def command(args):
 if not shutil.which(args[0]):return {'args':args,'unavailable':'command not installed'}
 try:
  r=subprocess.run(args,capture_output=True,text=True,timeout=5);return {'args':args,'exitCode':r.returncode,'stdout':r.stdout[:65536],'stderr':r.stderr[:4096]}
 except subprocess.TimeoutExpired:return {'args':args,'unavailable':'five-second command bound'}

def system_facts():
 return {'capturedClocks':clocks(),'pid':os.getpid(),'clockInfo':{n:vars(time.get_clock_info(n)) for n in ['time','monotonic','perf_counter']},'clocksource':read_fact('/sys/devices/system/clocksource/clocksource0/current_clocksource'),'availableClocksource':read_fact('/sys/devices/system/clocksource/clocksource0/available_clocksource'),'bootIdSha256':hashlib.sha256(str(read_fact('/proc/sys/kernel/random/boot_id')).encode()).hexdigest(),'timeNamespace':os.readlink('/proc/self/ns/time'),'powerSuspendStats':read_fact('/sys/power/suspend_stats'),'commands':[command(a) for a in [
 ['timedatectl','show','-p','NTPSynchronized','-p','NTP','-p','TimeUSec','-p','RTCTimeUSec'],['chronyc','tracking'],['adjtimex','--print'],['systemd-detect-virt'],
 ['journalctl','--no-pager','-n','150','-k','--since','2026-11-14 20:00:00 UTC','--grep','(?i)suspend|resume|timekeeping|clocksource|clock.*jump'],
 ['journalctl','--no-pager','-n','150','-u','systemd-timesyncd','-u','chronyd','-u','chrony','--since','2026-11-14 20:00:00 UTC']]]}

def container_sample(container):
 before=clocks();r=command(['docker','exec',container,'node','-e',"console.log(JSON.stringify({monotonicNs:process.hrtime.bigint().toString(),realtimeMs:Date.now(),timeNamespace:require('fs').readlinkSync('/proc/self/ns/time'),clocksource:require('fs').readFileSync('/sys/devices/system/clocksource/clocksource0/current_clocksource','utf8')}))"]);after=clocks()
 row={'before':before,'after':after,'command':r}
 if r.get('exitCode')==0:
  try:
   stamp=json.loads(r['stdout']);mono=int(stamp['monotonicNs']);real=stamp['realtimeMs']*1000000
   row.update({'container':stamp,'containerMonotonicWithinHostCallBounds':before['monotonic']<=mono<=after['monotonic'],'containerRealtimeWithinHostCallBoundsPlus1ms':before['realtime']-1000000<=real<=after['realtime']+1000000})
  except (ValueError,KeyError):row['parseIssue']='Container clock response invalid'
 return row

def run(args):
 if not 1<=args.seconds<=7200:raise ValueError('Clock experiment bound 1..7200')
 out=Path(args.output);out.mkdir(parents=True,exist_ok=False)
 def save(name,value):
  with (out/name).open('x') as f:f.write(json.dumps(value,indent=2)+'\n');f.flush();os.fsync(f.fileno())
 save('system-start.json',system_facts());began=clocks();previous=began;deadline=began['monotonic']+int(args.seconds*1e9);observations=[];container_rows=[];issues=[]
 with (out/'samples.jsonl').open('x') as f:
  while True:
   now=clocks();elapsed=(now['monotonic']-began['monotonic'])/1e9;row={'clocksNs':now,'elapsedMonotonicSeconds':elapsed,'process':proc_sample()}
   if observations:
    row['comparison']=classify(previous,now);issues+=row['comparison']['issues']
   if args.container and (not container_rows or elapsed>=len(container_rows)*10):container_rows.append(container_sample(args.container))
   f.write(json.dumps(row)+'\n');f.flush();os.fsync(f.fileno());observations.append(row);previous=now
   if issues or now['monotonic']>=deadline:break
   time.sleep(min(1,max(0,(deadline-time.monotonic_ns())/1e9)))
 end=clocks();stable=not issues and (previous['monotonic']-began['monotonic'])>=args.seconds*1e9
 save('system-end.json',system_facts());save('container-observations.json',container_rows)
 evidence={'startedClocksNs':began,'endedClocksNs':previous,'exportClocksNs':end,'requestedSeconds':args.seconds,'actualMonotonicSeconds':(previous['monotonic']-began['monotonic'])/1e9,'actualRealtimeSeconds':(previous['realtime']-began['realtime'])/1e9,'stableForRequestedInterval':stable,'issues':issues,'sampleCount':len(observations),'maxSampleMonotonicIntervalMs':max([r.get('comparison',{}).get('deltaMs',{}).get('monotonic',0) or 0 for r in observations]),'maxAbsRealtimeMonotonicStepMs':max([abs(r.get('comparison',{}).get('realtimeMinusMonotonicMs',0) or 0) for r in observations]),'containerSamples':len(container_rows),'containerBoundsPassed':bool(container_rows) and all(r.get('containerMonotonicWithinHostCallBounds') and r.get('containerRealtimeWithinHostCallBoundsPlus1ms') for r in container_rows),'scope':'Host/process clock measurements only, no chain timestamps or coverage authorization. CLOCK_BOOTTIME/RAW and journals constrain possible causes; unavailable facts and VM scheduling remain unknown. A bounded stable sample is not a future-host reliability guarantee.','liveTrading':False}
 save('evidence.json',evidence);print(json.dumps(evidence))
 return 0 if stable else 2

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--seconds',type=int,default=300);p.add_argument('--output',required=True);p.add_argument('--container');raise SystemExit(run(p.parse_args()))
