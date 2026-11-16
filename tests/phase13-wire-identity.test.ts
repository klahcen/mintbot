import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import bs58 from 'bs58';
import { SolanaMonitor, VERIFIED_PROGRAMS, type ProgramObservation } from '../src/chain.js';
import { EventJournal, eventIdentity } from '../src/event-journal.js';
import { AsyncEventJournal } from '../src/async-journal.js';
import { EventIngestion } from '../src/ingestion.js';
import { researchIdentityIssue } from '../src/research/candidates.js';
import { hasDuplicateJsonKeys, transactionIdentityIssue, wireIdentityTrace,
  type WireIdentityTrace } from '../src/research/wire-identity.js';

const signature = bs58.encode(Buffer.alloc(64, 7));
class Socket extends EventEmitter {
  sent: string[] = [];
  send(data: string) { this.sent.push(data); }
  close() { this.emit('close'); }
}
function harness() {
  const socket = new Socket(), events: ProgramObservation[] = [], traces: WireIdentityTrace[] = [], errors: string[] = [];
  const monitor = new SolanaMonitor('wss://example.test/private?api_key=never-log', VERIFIED_PROGRAMS.slice(0, 2),
    event => events.push(event), { strictRpcNotifications: true, deduplicate: false,
      onIdentityTrace: record => traces.push(record), onError: error => errors.push(error.message) }, () => socket);
  monitor.start(); socket.emit('open');
  socket.emit('message', JSON.stringify({ jsonrpc: '2.0', id: 1, result: 10 }));
  socket.emit('message', JSON.stringify({ jsonrpc: '2.0', id: 2, result: 11 }));
  const envelope = (sig: unknown = signature, sub = 10, slot = 100) => JSON.stringify({ jsonrpc: '2.0',
    method: 'logsNotification', params: { subscription: sub,
      result: { context: { slot }, value: { signature: sig, err: null, logs: [] } } } });
  return { socket, monitor, events, traces, errors, envelope };
}

test('Raw zero signature is copied exactly through normalization, linked to a durable refusal, and never becomes a WAL owner', async () => {
  const h = harness(), directory = await mkdtemp(join(tmpdir(), 'mintbot-phase13-wire-'));
  let journal: AsyncEventJournal | undefined;
  try {
    const raw = Buffer.from(h.envelope('1'.repeat(64)));
    h.socket.emit('message', raw);
    assert.equal(h.events.length, 1);
    const event = h.events[0]!, trace = h.traces[0]!;
    assert.equal(trace.providerHost, 'example.test');
    assert.equal(trace.byteExact, true);
    assert.deepEqual(Buffer.from(trace.sanitizedBase64, 'base64'), raw);
    assert.equal(trace.originalSha256, createHash('sha256').update(raw).digest('hex'));
    assert.equal(trace.extractedSignature, event.signature);
    assert.equal(event.wireIdentitySha256, trace.originalSha256);
    assert.equal(Object.keys(event).includes('wireIdentitySha256'), false);
    assert.equal(h.monitor.latestSlot, 0);
    journal = await AsyncEventJournal.open({ path: join(directory, 'identity.wal') });
    const pipeline = new EventIngestion({ journal, observationIssue: researchIdentityIssue });
    const result = await pipeline.acceptDurable(event);
    assert.equal(result.reason, 'unverifiable-zero-signature');
    assert.equal(journal.status().unacknowledged, 0);
    assert.equal(journal.anchors.size, 0);
    await pipeline.close();
    journal = await AsyncEventJournal.open({ path: join(directory, 'identity.wal') });
    assert.equal(journal.pending.size + journal.completed.size + journal.anchors.size, 0);
    assert.equal(journal.gaps.get('pump')?.reason, 'unverifiable-zero-signature');
  } finally { h.monitor.stop(); await journal?.shutdown(); await rm(directory, { recursive: true, force: true }); }
});

test('Missing, malformed, unsupported-version and ambiguous duplicate-key envelopes are diagnosed without a fallback observation', () => {
  const h = harness();
  try {
    const source = h.envelope();
    for (const raw of [source.replace(`"signature":"${signature}",`, ''),
      h.envelope(null), source.replace('"2.0"', '"1.0"'),
      source.replace('"signature":', '"signature":"other","signature":'),
      source.replace('"signature":', '"signat\\u0075re":"other","signature":'),
      '{', 'null', '[]', '{"jsonrpc":"2.0","method":"logsNotification","params":{"subscription":10}}'])
      h.socket.emit('message', raw);
    assert.equal(h.events.length, 0);
    assert.equal(h.errors.length, 9);
    assert.equal(h.traces.length, 9);
    assert.ok(h.traces.every(trace => trace.outcome === 'message-rejected'));
  } finally { h.monitor.stop(); }
});

test('Duplicate-key scanner ignores quoted log text and detects escaped names at any nested object', () => {
  for (const raw of ['{"x":{"a":1,"a":2}}', '{"a":1,"\\u0061":2}', '{"a":[],"a":[]}'])
    assert.equal(hasDuplicateJsonKeys(raw), true);
  for (const value of [{ a: '"a":1,"a":2', b: [{ a: 1 }, { a: 2 }] }, { a: [null, true, 4e5] }])
    assert.equal(hasDuplicateJsonKeys(JSON.stringify(value)), false);
});

test('Canonical 64-byte identities stay program-scoped, exact duplicates deduplicate and conflicting payloads refuse', async () => {
  const h = harness(), journal = new EventJournal(), pipeline = new EventIngestion({ journal, observationIssue: researchIdentityIssue });
  try {
    h.socket.emit('message', h.envelope(signature, 10));
    h.socket.emit('message', h.envelope(signature, 11));
    h.socket.emit('message', h.envelope(signature, 999));
    assert.equal(h.events.length, 2);
    assert.notEqual(eventIdentity(h.events[0]!), eventIdentity(h.events[1]!));
    assert.equal(h.traces.at(-1)?.outcome, 'unbound-subscription');
    for (const event of h.events) assert.equal(pipeline.accept(event).status, 'accepted');
    await pipeline.drain();
    assert.equal(pipeline.accept(h.events[0]!).status, 'duplicate');
    assert.equal(pipeline.accept({ ...h.events[0]!, logs: ['changed'] }).reason, 'fork-or-provider-conflict');
    assert.equal(journal.completed.size, 2);
  } finally { h.monitor.stop(); await pipeline.close(); }
});

test('Research admission rejects non-base58 and wrong-width identities, preserving generic journal fixture compatibility', async () => {
  assert.equal(transactionIdentityIssue(signature), undefined);
  for (const value of [undefined, '', 'unit-fixture', '0'.repeat(88), bs58.encode(Buffer.alloc(63, 1)), bs58.encode(Buffer.alloc(65, 1))])
    assert.equal(transactionIdentityIssue(value), 'invalid-transaction-signature');
  const event = { program: 'pump', signature: 'unit-fixture', slot: 100, logs: [], failed: false, observedAt: 1 };
  const generic = new EventJournal(); assert.equal(generic.offer(event).status, 'accepted'); generic.close();
  const journal = new EventJournal(), pipeline = new EventIngestion({ journal, observationIssue: researchIdentityIssue });
  try {
    assert.equal(pipeline.accept(event).reason, 'invalid-transaction-signature');
    assert.equal(journal.anchors.size + journal.completed.size + journal.pending.size, 0);
    assert.equal(journal.gaps.get('pump')?.reason, 'invalid-transaction-signature');
  } finally { await pipeline.close(); }
});

test('Wire capture redacts endpoint credentials, including escaped keys, and bounds retained bytes explicitly', () => {
  const fields = { at: 1, receivedMonoMs: 2, connection: 3, sequence: 4, providerHost: 'example.test', outcome: 'test' };
  const raw = Buffer.from('{"api_\\u006bey":"SECRET","error":"https:\\/\\/example.test/path?key=SECRET"}');
  const trace = wireIdentityTrace(raw, fields), sanitized = Buffer.from(trace.sanitizedBase64, 'base64').toString();
  assert.equal(sanitized.includes('SECRET'), false); assert.equal(trace.byteExact, false);
  const bounded = wireIdentityTrace(Buffer.from('x'.repeat(200000)), fields);
  assert.equal(bounded.sanitizedBytes, 128 * 1024); assert.equal(bounded.captureTruncated, true);
  assert.equal(bounded.byteExact, false);
});

test('Creation hints retain wire provenance between regular samples without becoming finalized creation proof', () => {
  const h = harness();
  try {
    for (let n = 0; n < 20; n++) h.socket.emit('message', h.envelope(signature, 10, 100 + n));
    const message = JSON.parse(h.envelope(signature, 10, 200));
    message.params.result.value.logs = ['Program log: Instruction: CreateV2'];
    h.socket.emit('message', JSON.stringify(message));
    const trace = h.traces.at(-1)!;
    assert.equal(trace.slot, 200);
    assert.equal(trace.outcome, 'normalized-observation');
    assert.equal(h.events.at(-1)!.wireIdentitySha256, trace.originalSha256);
    assert.equal(Object.keys(h.events.at(-1)!).includes('executionEligible'), false);
  } finally { h.monitor.stop(); }
});
