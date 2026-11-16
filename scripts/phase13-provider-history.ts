/** Public diagnostics only: matching transactions do not establish authenticated independent operators or equal account banks. */
import { readFile, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { VerifiedReadRpc } from '../src/verified-rpc.js';
import { boundedProviderRead } from '../src/research/providers.js';
const args = process.argv.slice(2);
if (!args.includes('--run')) throw Error('Explicit --run required');
const output = args.includes('--output') ? args[args.indexOf('--output') + 1]! : 'docs/phase13/provider-history.json';
const fixture = JSON.parse(await readFile('docs/phase12/raydium-current-creation-fixture.json', 'utf8'));
const signature: string = fixture.originalObservation.signature;
const expectedSlot: number = fixture.originalObservation.slot;
const pool: string = fixture.postrunVerifiedLaunch.address;
const providers = [{ id: 'solana-public', endpoint: 'https://api.mainnet-beta.solana.com' },
  { id: 'publicnode', endpoint: 'https://solana-rpc.publicnode.com' }];
const observations: any[] = [];
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
for (const provider of providers) {
  const row: any = { provider: provider.id, host: new URL(provider.endpoint).host, authenticated: false, operatorIndependence: 'unknown' };
  try { row.genesis = await boundedProviderRead(provider, 'getGenesisHash', []); }
  catch (error) { row.genesisIssue = (error as Error).message; }
  try {
    row.transaction = await new VerifiedReadRpc(provider.endpoint).transaction(signature);
    row.requestedSignature = signature;
    row.transactionIdentityMatches = row.transaction?.slot === expectedSlot && row.transaction?.transaction?.signatures?.[0] === signature;
    if (row.transaction) row.transactionDigest = digest(row.transaction.transaction);
  } catch (error) { row.transactionIssue = (error as Error).message; }
  try {
    row.accounts = await boundedProviderRead(provider, 'getMultipleAccounts', [[pool], { commitment: 'finalized', encoding: 'base64' }]);
    row.accountsDigest = digest(row.accounts.value);
  } catch (error) { row.accountIssue = (error as Error).message; }
  observations.push(row);
}
const txAvailable = observations.every(row => row.transactionIdentityMatches === true);
const transactionConflict = txAvailable && new Set(observations.map(row => row.transactionDigest)).size !== 1;
const banksAvailable = observations.every(row => Number.isSafeInteger(row.accounts?.context?.slot));
const sameBank = banksAvailable && new Set(observations.map(row => row.accounts.context.slot)).size === 1;
const accountConflict = sameBank && new Set(observations.map(row => row.accountsDigest)).size !== 1;
const value = { generatedAt: new Date().toISOString(), signature, expectedSlot, pool, observations,
  finalizedTransactionPayloadAgreement: txAvailable ? transactionConflict ? 'conflict' : 'matching-selected-transaction-payload' : 'unknown',
  sameAccountBank: sameBank, accountStateAgreement: sameBank ? accountConflict ? 'conflict' : 'matching-at-reported-equal-bank' : 'unknown',
  independentlyOperatedAuthenticatedProviders: false, eligible: false, paperAuthorized: false,
  conflicts: transactionConflict || accountConflict ? [{ signature, pool, transactionConflict, accountConflict, disposition: 'Retain immutable evidence; manual review required. No automatic provider/epoch authorization.' }] : [],
  liveTrading: false, scope: 'At most three public read-only calls per endpoint. Complete captured transactions are retained; transaction digest compares signed message and signatures, not every metadata field. Equal reported context slots are a conditional observation, not operator authentication or a universal identical-bank RPC guarantee. Missing data and different-bank evidence remain unknown.' };
const file = await open(output, 'wx', 0o600);
try { await file.writeFile(JSON.stringify(value, null, 2) + '\n'); await file.sync(); } finally { await file.close(); }
const directory = await open(dirname(output), 'r'); try { await directory.sync(); } finally { await directory.close(); }
console.log(JSON.stringify({ transactionAgreement: value.finalizedTransactionPayloadAgreement, sameBank, conflicts: value.conflicts.length, eligible: false }));
