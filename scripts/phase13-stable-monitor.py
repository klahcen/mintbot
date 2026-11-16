"""Hold a temporary host sleep inhibitor across one bounded research container and clock observer."""
from pathlib import Path
import argparse
import datetime
import json
import subprocess
import time

parser = argparse.ArgumentParser()
parser.add_argument('--run', action='store_true')
parser.add_argument('--inside-inhibitor', action='store_true', help=argparse.SUPPRESS)
parser.add_argument('--run-name',default='mainnet')
parser.add_argument('--launch-record',default='runtime-launch.json')
args = parser.parse_args()
if not args.run:
    raise SystemExit('Explicit --run required; no signing or submission exists')
out = Path('docs/phase13').resolve()
if not args.inside_inhibitor:
    command = ['systemd-inhibit', '--what=sleep:idle', '--who=Mintbot',
               '--why=Authorized Phase13 bounded read-only monitoring', '--mode=block',
               'python3', str(Path(__file__).resolve()), '--run', '--inside-inhibitor','--run-name',args.run_name,'--launch-record',args.launch_record]
    with (out / (args.run_name+'-stable-monitor-command.json')).open('x') as stream:
        stream.write(json.dumps({'args': command, 'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}, indent=2) + '\n')
    raise SystemExit(subprocess.call(command))

certificate = out / 'timing/preflight-1800/evidence.json'
deadline = time.monotonic() + 2000
while not certificate.exists():
    if time.monotonic() >= deadline:
        raise SystemExit('Completed same-budget preflight unavailable; monitoring not started')
    time.sleep(1)
preflight = json.loads(certificate.read_text())
assert preflight['stableForRequestedInterval'] and preflight['containerBoundsPassed']
assert preflight['actualMonotonicSeconds'] >= 1800
assert json.loads((out / 'timing/preflight-300-validated/evidence.json').read_text())['stableForRequestedInterval']
assert not (out / args.launch_record).exists(), 'Existing run evidence preserved'
history = ','.join(['docs/phase11/coverage-history.json', 'docs/phase11/phase11-coverage-history.json',
                    'docs/phase12/coverage-history.json', 'docs/phase12/final-coverage-history.json',
                    'docs/phase13/identity-probe-coverage-history.json'])
command = ['python3', 'scripts/phase12-launch-monitor.py', '--seconds', '1800',
           '--clock-directory', str(certificate.parent), '--output-root', str(out),
           '--image', 'mintbot:phase13-readonly', '--run-name', args.run_name,
           '--container-name', 'mintbot-phase13-'+args.run_name, '--launch-record', args.launch_record,
           '--history', history, '--identity-diagnostics', '--bounded-verification', '--wait']
with (out / (args.run_name+'-launcher.log')).open('x') as launch_log:
    process = subprocess.Popen(command, stdout=launch_log, stderr=subprocess.STDOUT)
    try:
        launch_deadline = time.monotonic() + 90
        while not (out / args.launch_record).exists():
            if process.poll() is not None or time.monotonic() > launch_deadline:
                raise RuntimeError('Container launch failed; inspect immutable launcher log')
            time.sleep(0.2)
        # This persistent container remains available after the finite research process exits.
        clock_command = ['python3', 'scripts/phase12-host-health.py', '--seconds', '1800',
                         '--container', 'mintbot-phase12-clock', '--output', str(out / ('timing/during-'+args.run_name))]
        with (out / ('timing/during-'+args.run_name+'-command.json')).open('x') as stream:
            stream.write(json.dumps({'args': clock_command}, indent=2) + '\n')
        with (out / ('timing/during-'+args.run_name+'.log')).open('x') as clock_log:
            observer = subprocess.Popen(clock_command, stdout=clock_log, stderr=subprocess.STDOUT)
            code = process.wait(timeout=2000)
            if code != 0 and observer.poll() is None: observer.terminate()
            clock_code = observer.wait(timeout=90)
        inspected = json.loads(subprocess.check_output(['docker', 'inspect', 'mintbot-phase13-'+args.run_name]))[0]
        with (out / (args.run_name+'-runtime-container-inspect.json')).open('x') as stream:
            stream.write(json.dumps({k: inspected[k] for k in ['Id', 'Image', 'State']}, indent=2) + '\n')
        with (out / (args.run_name+'-runtime-container.log')).open('x') as stream:
            subprocess.run(['docker', 'logs', 'mintbot-phase13-'+args.run_name], stdout=stream, stderr=subprocess.STDOUT)
        with (out / (args.run_name+'-stable-monitor-exit.json')).open('x') as stream:
            stream.write(json.dumps({'launcherExitCode': code, 'clockExitCode': clock_code,
                'finishedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                'scope': 'One finite primary supervisor. Preflights and control probes are never concatenated. Duration alone does not grant continuous coverage or trade eligibility.'}, indent=2) + '\n')
        raise SystemExit(0 if code == clock_code == 0 else 2)
    finally:
        if process.poll() is None:
            # Never leave the paper owner running after its timing/inhibition wrapper fails.
            subprocess.run(['docker', 'stop', '--time', '45', 'mintbot-phase13-'+args.run_name], capture_output=True)
            process.wait(timeout=60)
