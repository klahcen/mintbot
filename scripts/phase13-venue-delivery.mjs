/** Bounded read-only comparison: subscription ACKs are not proof of per-venue delivery. */
import { readFile, writeFile } from 'node:fs/promises';
import { HttpRecoveryRpc } from '../src/backfill.js';
import { VERIFIED_PROGRAMS } from '../src/chain.js';
const args = process.argv.slice(2);
if (!args.includes('--run')) throw Error('Explicit --run required');
const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'docs/phase13/venue-delivery-check.json';
const progressPath = 'docs/phase13/runtime/mainnet-validated/run-progress.json';
const before = JSON.parse(await readFile(progressPath, 'utf8'));
const rows = [];
for (const endpoint of ['https://solana-rpc.publicnode.com', 'https://api.mainnet-beta.solana.com']) {
  const rpc = new HttpRecoveryRpc(endpoint, 5000, 4 * 1024 * 1024, 'finalized');
  for (const name of ['raydium-cpmm', 'meteora-dlmm']) {
    const program = VERIFIED_PROGRAMS.find(program => program.name === name);
    const row = { host: new URL(endpoint).host, program: name, observedAt: Date.now() };
    try { const result = await rpc.getSignaturesForAddress(program.address, { limit: 5 }); if (!Array.isArray(result)) throw Error('Provider signature list unavailable'); row.recentFinalizedSignatures = result; }
    catch (error) { row.issue = error.message; }
    rows.push(row);
  }
}
const after = JSON.parse(await readFile(progressPath, 'utf8'));
await writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), rows,
  progressBefore: { startedAt: before.startedAt, updatedAt: before.updatedAt, venueCounts: before.venueCounts, supervisor: before.supervisor },
  progressAfter: { updatedAt: after.updatedAt, venueCounts: after.venueCounts, supervisor: after.supervisor },
  findings: rows.map(row => ({ host: row.host, program: row.program,
    reportedSuccessfulActivityWithinRun: row.recentFinalizedSignatures?.filter(record => record.err === null && record.blockTime * 1000 >= before.startedAt && record.blockTime * 1000 <= after.updatedAt).length,
    notificationsObservedInRun: after.venueCounts[row.program].notifications,
    interpretation: 'Provider-reported recent history and notification counters are distinct. ACKs alone do not establish complete delivery. This sample is not creation verification, independent-provider proof or gap recovery.' })),
  eligibleForPaper: false, liveTrading: false }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.map(row => ({ host: row.host, program: row.program,
  recentSignatures: row.recentFinalizedSignatures?.length, issue: row.issue }))));
