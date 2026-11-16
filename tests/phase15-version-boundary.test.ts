import test from 'node:test';
import assert from 'node:assert/strict';
import type { Connection } from '@solana/web3.js';
import { inspectTransaction } from '../src/chain.js';
import { requiredLaunchAccounts, type ParsedChainTransaction } from '../src/verified-decoders.js';

// The inspector must not retry an unsupported format by silently raising its limit.
test('SDK inspector preserves unsupported-version refusal without version escalation or retries', async () => {
  const requests: unknown[] = [];
  const failure = Object.assign(new Error('Transaction version (1) is not supported'), { code: -32015 });
  const connection = {
    async getParsedTransaction(signature: string, options: unknown) {
      requests.push({ signature, options }); throw failure;
    },
  } as Pick<Connection, 'getParsedTransaction'>;
  await assert.rejects(inspectTransaction(connection, 'recorded-subject'), error => error === failure);
  assert.deepEqual(requests, [{ signature: 'recorded-subject', options: {
    commitment: 'finalized', maxSupportedTransactionVersion: 0,
  } }]);
});

test('Existing read-only creation decoder rejects unknown formats before consuming instruction/account data', () => {
  for (const version of [2, 127]) {
    assert.throws(() => requiredLaunchAccounts('pump', { version } as ParsedChainTransaction), /Unsupported transaction version/);
  }
});
