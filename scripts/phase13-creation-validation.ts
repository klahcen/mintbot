/** Actual retained finalized creations and bounded current rereads; never promotes history to a fresh entry. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { VerifiedReadRpc } from '../src/verified-rpc.js';
import { VERIFIED_INSTRUCTIONS, decodeVerifiedTransaction, type ParsedChainTransaction,
  type AccountEvidence } from '../src/verified-decoders.js';
import { Telemetry } from '../src/telemetry.js';

const args = process.argv.slice(2);
if (!args.includes('--run')) throw Error('Explicit --run required');
const option = (name: string, fallback: string) => args.includes(name) ? args[args.indexOf(name) + 1]! : fallback;
const output = option('--output', 'docs/phase13/creation-validation.json');
const endpoint = process.env.SOLANA_RPC_URL ?? 'https://solana-rpc.publicnode.com';
const metrics = new Telemetry(), captured: unknown[] = [], rows: any[] = [];
class Capture extends VerifiedReadRpc {
  override async transaction(signature: string): Promise<ParsedChainTransaction | null> {
    const result = await super.transaction(signature);
    captured.push({ method: 'getTransaction', signature, result }); return result;
  }
  override async accounts(keys: string[]): Promise<AccountEvidence> {
    const result = await super.accounts(keys);
    captured.push({ method: 'getMultipleAccounts', keys, result }); return result;
  }
}
const rpc = new Capture(endpoint, { minimumIntervalMs: 350, deadlineMs: 8000, maximumAttempts: 2, capacity: 4, metrics });
const rayPath = 'docs/phase12/raydium-current-creation-fixture.json';
const rayBytes = await readFile(rayPath), ray = JSON.parse(rayBytes.toString());
const dlmmPath = 'docs/phase3/fixtures/meteora-dlmm-creation.json';
const dlmmBytes = await readFile(dlmmPath), dlmm = JSON.parse(dlmmBytes.toString());
const subjects = [
  { venue: 'raydium-cpmm', path: rayPath, bytes: rayBytes,
    transaction: ray.capturedFinalizedTransactionsAndAccounts.find((r: any) => r.method === 'getTransaction').result,
    accounts: ray.capturedFinalizedTransactionsAndAccounts.find((r: any) => r.method === 'getMultipleAccounts').result },
  { venue: 'meteora-dlmm', path: dlmmPath, bytes: dlmmBytes, transaction: dlmm.result,
    accounts: JSON.parse(await readFile('docs/phase3/fixtures/meteora-dlmm-accounts.json', 'utf8')) },
];
for (const subject of subjects) {
  const tx: ParsedChainTransaction = subject.transaction;
  const row: any = { venue: subject.venue, source: subject.path,
    fixtureSha256: createHash('sha256').update(subject.bytes).digest('hex'),
    signature: tx.transaction.signatures[0], slot: tx.slot,
    originalFixtureVerification: decodeVerifiedTransaction(subject.venue, tx, subject.accounts),
    currentRead: null, freshnessOrigin: 'history', eligibleForPaper: false };
  try { row.currentRead = await rpc.verify(subject.venue, row.signature, row.slot); }
  catch (error) { row.currentReadIssue = (error as Error).message; }
  rows.push(row);
}
const official = JSON.parse(await readFile('docs/phase13/official/MeteoraAg-dlmm-sdk-idls-dlmm.json', 'utf8'));
const matrix = [
  ...['initialize', 'initialize_with_permission'].map(name => ({ venue: 'raydium-cpmm', name })),
  ...official.instructions.filter((i: any) => /^initialize_.*lb_pair2?$/.test(i.name))
    .map((i: any) => ({ venue: 'meteora-dlmm', name: i.name, discriminator: i.discriminator })),
].map((variant: any) => ({ ...variant,
  supportedStrictVerifier: VERIFIED_INSTRUCTIONS[variant.venue]?.includes(variant.name) ?? false,
  finalizedFixtureAvailable: rows.some(r => r.venue === variant.venue && r.originalFixtureVerification.some((v: any) => v.instruction === variant.name)),
  newVariantEnabled: false,
}));
await writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), provider: new URL(endpoint).host,
  rows, matrix, captured, telemetry: metrics.report(), newVariantsEnabled: false, eligibleForPaper: false,
  liveTrading: false, scope: 'Two genuine retained finalized fixtures, at most two HTTP attempts per scheduled current read. Earlier finalized transactions and current account rereads are not identical historical account-bank reconstruction. No API list, swap, liquidity adjustment or historical receipt becomes a fresh launch.' }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(rows.map(row => ({ venue: row.venue, fixtureCreations: row.originalFixtureVerification.length,
  currentCreations: row.currentRead?.length, issue: row.currentReadIssue }))));
