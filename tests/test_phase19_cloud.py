import importlib.util, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('cloud',Path(__file__).resolve().parents[1]/'scripts/cloud/manage.py')
cloud=importlib.util.module_from_spec(spec);spec.loader.exec_module(cloud)
class MonitoringTests(unittest.TestCase):
    def test_stopped_default_never_grants_coverage(self):
        rows=[{'Service':s,'State':'running','Health':'healthy'} for s in ['app','postgres']]
        alerts=cloud.alerts(rows,{'ok':True},10,{},0)
        self.assertIn('coverage_or_execution_blocked',alerts)
        self.assertIn('rpc_http_wss_not_observed',alerts)
        self.assertNotIn('app_unhealthy',alerts)
    def test_partial_verified_rows_cannot_replace_coverage_approval(self):
        health={'ok':True,'research':{'status':'available','evidence':{'readiness':[{'name':'Research coverage','status':'verified'}]}}}
        self.assertIn('coverage_or_execution_blocked',cloud.alerts([],health,10,{},0))
    def test_failure_signals(self):
        rows=[{'Service':'research','State':'exited'}]
        alerts=cloud.alerts(rows,{'stopFence':True},1,{},None)
        for value in ['app_unhealthy','postgres_unhealthy','database_or_app_unavailable','disk_low','backup_missing_or_stale','research_sticky_stop','research_unexpected_termination']:
            self.assertIn(value,alerts)
    def test_quarantine_stale_and_disagreement(self):
        alerts=cloud.alerts([{'Service':'research','State':'running','Health':'unhealthy'}],{'ok':True,'research':{'status':'stale','evidence':{'runStatus':'failed','wal':{'status':'quarantined'},'providers':[{'status':'failed'}]}}},10,{},0)
        for value in ['provider_disagreement_or_failure','research_failed','research_wal_unverified','market_data_stale_or_unavailable','research_delivery_fatal_quarantine_or_coverage']:
            self.assertIn(value,alerts)
if __name__=='__main__':unittest.main()

class JsonFormats(unittest.TestCase):
    def test_compose_json_formats(self):
        self.assertEqual(cloud.json_rows(b'{"Service":"app"}\n{"Service":"postgres"}\n'),[{'Service':'app'},{'Service':'postgres'}])
        self.assertEqual(cloud.json_rows(b'[{"Service":"app"}]'),[{'Service':'app'}])
        self.assertEqual(cloud.json_rows(b''),[])
    def test_rpc_observation_cannot_authorize(self):
        self.assertIn('rpc_http_wss_observation_stale',cloud.rpc_alerts({},2000))
        report={'observedAt':2000,'probe':{'providers':[{'id':'primary','health':{'ok':False},'websocket':{'status':'failed','venues':[{'ack':False}]}}]}}
        found=cloud.rpc_alerts(report,2010)
        for value in ['primary_http_failed','primary_wss_failed','primary_venue_delivery_unknown','provider_agreement_unverified']:self.assertIn(value,found)
