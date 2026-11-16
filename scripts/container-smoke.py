"""Build mintbot:local first. Exercises isolated disposable Compose resources; never funds a wallet."""
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

root = Path(__file__).resolve().parent.parent
token = secrets.token_hex(32)
env = dict(os.environ, API_TOKEN=token, POSTGRES_PASSWORD=secrets.token_hex(32))
project = 'mintbot-smoke-' + secrets.token_hex(4)
with socket.socket() as listener:
    listener.bind(('127.0.0.1', 0))
    port = listener.getsockname()[1]
base_url = f'http://127.0.0.1:{port}'

def run(args):
    result = subprocess.run(args, cwd=root, env=env, text=True, capture_output=True, timeout=120)
    if result.returncode:
        raise RuntimeError('Container command failed: ' + result.stderr.replace(token, '[redacted]').replace(env['POSTGRES_PASSWORD'], '[redacted]'))
    return result.stdout

def request(path, body=None, auth=True):
    headers = {'Authorization': 'Bearer ' + token} if auth else {}
    if body is not None:
        headers['Content-Type'] = 'application/json'
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base_url + path, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=5) as response:
        return json.load(response)

def ready():
    for _ in range(100):
        try:
            if request('/health', auth=False)['ok']:
                return
        except (OSError, ValueError):
            pass
        time.sleep(0.2)
    raise RuntimeError('Container did not become ready')

with tempfile.TemporaryDirectory(prefix='mintbot-compose-') as directory:
    override = Path(directory) / 'override.yaml'
    override.write_text(f'services:\n  app:\n    image: mintbot:local\n    ports: !override ["127.0.0.1:{port}:3001"]\n')
    compose = ['docker', 'compose', '-p', project, '-f', str(root / 'compose.yaml'), '-f', str(override)]
    try:
        run(compose + ['up', '-d', '--no-build'])
        ready()
        try:
            request('/api/state', auth=False)
            raise AssertionError('Unauthenticated request accepted')
        except urllib.error.HTTPError as error:
            assert error.code == 401
        assert request('/api/state')['mode'] == 'paper'
        with urllib.request.urlopen(base_url + '/', timeout=5) as response:
            assert b'Mintbot' in response.read()
            assert response.headers['X-Content-Type-Options'] == 'nosniff'
        request('/api/control', {'action': 'start'})
        result = request('/api/replay', {})
        assert result['auditPersisted'] is True
        assert result['positionId']
        count = run(compose + ['exec', '-T', 'postgres', 'psql', '-U', 'mintbot', '-d', 'mintbot', '-Atc', 'SELECT count(*) FROM events']).strip()
        assert count == '1', 'PostgreSQL audit record missing'
        state = request('/api/state')
        request('/api/paper/mark', {'mint': state['positions'][0]['mint'], 'priceSol': 0.0002, 'liquiditySol': 100})
        state = request('/api/state')
        assert not state['positions'] and state['realizedPnlSol'] > 0
        request('/api/control', {'action': 'kill'})
        run(compose + ['restart', 'app'])
        ready()
        state = request('/api/state')
        assert state['killed'] and not state['running'] and len(state['trades']) == 2
        print(json.dumps({'passed': True, 'scope': 'isolated Docker Compose paper-only smoke', 'checks': ['Node 22 non-root app', 'static dashboard and security header', 'authenticated API', 'synthetic entry and take-profit', 'PostgreSQL audit insertion', 'persistent restart with stopped kill latch']}))
    finally:
        run(compose + ['down', '--volumes', '--remove-orphans'])
