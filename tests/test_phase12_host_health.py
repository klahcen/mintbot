import unittest,importlib.util
from pathlib import Path
spec=importlib.util.spec_from_file_location('health',Path(__file__).resolve().parents[1]/'scripts/phase12-host-health.py');health=importlib.util.module_from_spec(spec);spec.loader.exec_module(health)
class ClockClassification(unittest.TestCase):
 def test_coherent_progress(self):
  a={k:0 for k in ['realtime','monotonic','boottime','raw']};b={k:1_000_000_000 for k in a};self.assertEqual(health.classify(a,b)['issues'],[])
 def test_realtime_step_not_claimed_as_suspend(self):
  a={k:0 for k in ['realtime','monotonic','boottime','raw']};b={**{k:1_000_000_000 for k in a},'realtime':101_000_000_000};r=health.classify(a,b);self.assertIn('realtime-monotonic-discontinuity',r['issues']);self.assertEqual(r['boottimeMinusMonotonicMs'],0)
 def test_boot_suspend_signal_retains_uncertain_cause(self):
  a={k:0 for k in ['realtime','monotonic','boottime','raw']};b={'realtime':101_000_000_000,'boottime':101_000_000_000,'monotonic':1_000_000_000,'raw':1_000_000_000};r=health.classify(a,b);self.assertEqual(r['realtimeMinusBoottimeMs'],0);self.assertTrue(any('requires corroboration' in s for s in r['issues']))
 def test_process_pause_without_clock_adjustment(self):
  a={k:0 for k in ['realtime','monotonic','boottime','raw']};b={k:5_000_000_000 for k in a};r=health.classify(a,b);self.assertEqual(r['realtimeMinusMonotonicMs'],0);self.assertTrue(any('process-sampling-pause' in s for s in r['issues']))
 def test_unavailable_boot_clock_is_not_invented(self):
  a={'realtime':0,'monotonic':0,'boottime':None,'raw':None};b={'realtime':1_000_000_000,'monotonic':1_000_000_000,'boottime':None,'raw':None};self.assertIsNone(health.classify(a,b)['boottimeMinusMonotonicMs'])
if __name__=='__main__':unittest.main()
