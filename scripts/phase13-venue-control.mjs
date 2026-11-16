/** Separate bounded transport control; no research decisions, WAL ownership or paper ledger. */
import { writeFile } from 'node:fs/promises';
import { MonitorSupervisor } from '../src/research/monitor-supervisor.js';
import { VERIFIED_PROGRAMS } from '../src/chain.js';
import { transactionIdentityIssue } from '../src/research/wire-identity.js';
import WebSocket from 'ws';
const args = process.argv.slice(2);
if (!args.includes('--run')) throw Error('Explicit --run required');
const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'docs/phase13/venue-controls.json';
const results = await Promise.all(['wss://solana-rpc.publicnode.com', 'wss://api.mainnet-beta.solana.com'].map(async endpoint => {
  const row = { providerHost: new URL(endpoint).host, notifications: 0, invalidIdentities: {}, samples: [], wire: [], acks: [], errors: [] };
  let bytes = 0;
  const monitor = new MonitorSupervisor([endpoint], VERIFIED_PROGRAMS.filter(program => program.name === 'meteora-dlmm'), event => {
    row.notifications++;
    const issue = transactionIdentityIssue(event.signature);
    if (issue) row.invalidIdentities[issue] = (row.invalidIdentities[issue] ?? 0) + 1;
    if (row.samples.length < 5) row.samples.push({ ...event, wireIdentitySha256: event.wireIdentitySha256 });
  }, { maxDurationMs: 60000, maxConnections: 8, maxIncidents: 8, strictRpcNotifications: true,
    onIdentityTrace: trace => { const size = Buffer.byteLength(JSON.stringify(trace)); if (bytes + size <= 1024 * 1024) { row.wire.push(trace); bytes += size; } },
    onError: error => row.errors.push(error.message),
    socketFactory: url => {
      const socket = new WebSocket(url, { maxPayload: 262144, handshakeTimeout: 10000 });
      socket.on('message', raw => {
        try { const message = JSON.parse(raw.toString()); if (message.id !== undefined && row.acks.length < 16) row.acks.push(message); }
        catch { /* The supervisor's strict parser retains rejected-payload diagnostics. */ }
      });
      return socket;
    },
  });
  monitor.start();
  await new Promise(resolve => setTimeout(resolve, 60500));
  monitor.stop(); row.supervisor = monitor.snapshot(); return row;
}));
await writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), results,
  scope: 'Two distinct 60-second single-venue transport controls, not added to the primary window, not creation verification, not independent authenticated providers, no market decisions or fills.',
  paperEntries: 0, paperExits: 0, liveTrading: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(results.map(row => ({ provider: row.providerHost, notifications: row.notifications, acks: row.acks.length, errors: row.errors }))));
