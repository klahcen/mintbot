#!/usr/bin/env python3
"""Configure existing Mintbot PAPER strategy through its authenticated local API.

Usage from your Mintbot project directory:
  python3 configure_mintbot_paper.py --check
  python3 configure_mintbot_paper.py --apply

Requires .env with API_TOKEN and a locally running Mintbot HTTP server.
Does not sign, broadcast, send funds, reset positions or invoke replay.
"""
import argparse
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

TARGET = {"tradeSol": 0.10, "takeProfitBps": 9000, "stopLossBps": 500, "maxPositions": 5}


def read_env(path):
    values = {}
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def request(base, token, method, path, payload=None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = Request(base + path, data=data, method=method,
                  headers={"Authorization": "Bearer " + token,
                           "Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=12) as r:
            return json.load(r)
    except HTTPError as exc:
        message = exc.read().decode(errors='replace')[:400]
        raise RuntimeError(f"{method} {path}: HTTP {exc.code}: {message}") from None
    except URLError as exc:
        raise RuntimeError(f"Cannot reach {base}: {exc.reason}") from None


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true', help='Read current strategy without modifying the app')
    mode.add_argument('--apply', action='store_true', help='Stop engine, update strategy, verify, and restore run state')
    ap.add_argument('--env-file', default='.env')
    args = ap.parse_args()
    env = read_env(args.env_file)
    token = env.get('API_TOKEN') or ''
    if not token:
        raise RuntimeError('API_TOKEN is empty in .env')
    if env.get('MODE', 'paper') != 'paper':
        raise RuntimeError('MODE must be paper; refusing to change any other mode')
    port = env.get('PORT', '3001')
    if not port.isdigit():
        raise RuntimeError('Invalid PORT')
    base = f'http://127.0.0.1:{port}'
    health = request(base, token, 'GET', '/health')
    if health.get('mode') != 'paper':
        raise RuntimeError('Backend has not confirmed paper mode')
    state = request(base, token, 'GET', '/api/state')
    strategies = state.get('strategies', [])
    if len(strategies) != 1 or not isinstance(strategies[0], dict):
        raise RuntimeError('Expected exactly one strategy; update this script for the current app contract')
    previous = strategies[0]
    modified = dict(previous, **TARGET)
    print('Current:', {k: previous.get(k) for k in TARGET})
    print('Target: ', TARGET)
    print('Existing other risk/finality/liquidity/slippage fields are preserved.')
    if args.check:
        print('CHECK ONLY: no changes made.')
        return
    was_running = bool(state.get('running'))
    if state.get('killed'):
        raise RuntimeError('App is killed; refusing to bypass or reset the emergency stop')
    stopped = False
    try:
        if was_running:
            request(base, token, 'POST', '/api/control', {'action': 'stop'})
            stopped = True
        request(base, token, 'POST', '/api/strategies', modified)
        reread = request(base, token, 'GET', '/api/state')
        updated = reread.get('strategies', [{}])[0]
        if any(updated.get(k) != v for k, v in TARGET.items()):
            raise RuntimeError('Strategy verification failed; review current state before proceeding')
        print('PASS: all 4 requested strategy fields verified on the server.')
    finally:
        if was_running and stopped:
            current = request(base, token, 'GET', '/api/state')
            if not current.get('killed') and not current.get('running'):
                request(base, token, 'POST', '/api/control', {'action': 'start'})
                print('Paper engine restarted to its previous running state.')
    print('No live trading, token transfer, replay, reset or position closure performed.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, FileNotFoundError, json.JSONDecodeError) as exc:
        raise SystemExit(f'ERROR: {exc}')
