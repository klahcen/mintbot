import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type RequestListener } from 'node:http';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';
import { VerifiedReadRpc } from '../src/verified-rpc.js';
import { Telemetry } from '../src/telemetry.js';

async function serve(handler: RequestListener) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  return { endpoint: `http://127.0.0.1:${address.port}`,
    close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

test('Bounded verification retries HTTP 429 after Retry-After and retains finalized request parameters', async () => {
  const requests: any[] = [], times: number[] = [], metrics = new Telemetry();
  const server = await serve((request, response) => {
    let body = ''; request.on('data', chunk => { body += chunk; }); request.on('end', () => {
      requests.push(JSON.parse(body)); times.push(performance.now());
      if (requests.length === 1) { response.writeHead(429, { 'retry-after': '0.03' }); response.end(); }
      else { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: null })); }
    });
  });
  try {
    const reader = new VerifiedReadRpc(server.endpoint, { minimumIntervalMs: 10, deadlineMs: 2000, maximumAttempts: 2, capacity: 2, metrics });
    assert.equal(await reader.transaction('public-signature'), null);
    assert.equal(requests.length, 2); assert.deepEqual(requests[0], requests[1]);
    assert.equal(requests[0].params[1].commitment, 'finalized');
    assert.ok(times[1]! - times[0]! >= 25);
    assert.equal(metrics.report().counters['verification.http_429'], 1);
    assert.equal(metrics.report().counters['verification.bounded_retries'], 1);
  } finally { await server.close(); }
});

test('Retry-After beyond the evidence deadline fails without ignoring the provider cooldown', async () => {
  let requests = 0;
  const server = await serve((_request, response) => { requests++; response.writeHead(429, { 'retry-after': '30' }); response.end(); });
  try {
    const reader = new VerifiedReadRpc(server.endpoint, { minimumIntervalMs: 10, deadlineMs: 500, maximumAttempts: 2, capacity: 2 });
    await assert.rejects(reader.transaction('public-signature'), /HTTP 429/);
    await assert.rejects(reader.transaction('other-signature'), /deadline/);
    assert.equal(requests, 1);
  } finally { await server.close(); }
});

test('Verification queue capacity bounds in-flight work and refuses excess requests before provider work', async () => {
  let requests = 0, release: (() => void) | undefined;
  const server = await serve((_request, response) => {
    requests++; release = () => response.end(JSON.stringify({ jsonrpc: '2.0', id: 1, result: null }));
  });
  try {
    const reader = new VerifiedReadRpc(server.endpoint, { minimumIntervalMs: 500, deadlineMs: 1000, maximumAttempts: 1, capacity: 1 });
    const first = reader.transaction('first');
    await assert.rejects(reader.transaction('overflow'), /capacity/);
    while (!release) await new Promise(resolve => setTimeout(resolve, 5));
    release(); assert.equal(await first, null); assert.equal(requests, 1);
  } finally { await server.close(); }
});

test('Wrong response identity and RPC errors do not receive HTTP retry treatment or become verified results', async () => {
  let requests = 0;
  const server = await serve((_request, response) => {
    requests++; response.end(JSON.stringify(requests === 1
      ? { jsonrpc: '2.0', id: 99, result: null }
      : { jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'unavailable' } }));
  });
  try {
    const reader = new VerifiedReadRpc(server.endpoint, { minimumIntervalMs: 0, deadlineMs: 1000, maximumAttempts: 3, capacity: 2 });
    await assert.rejects(reader.transaction('first'), /invalid response identity/);
    await assert.rejects(reader.transaction('second'), /RPC error/);
    assert.equal(requests, 2);
  } finally { await server.close(); }
});
