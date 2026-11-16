import test from "node:test";
import assert from "node:assert/strict";
import {
  Keypair,
  SystemProgram,
  Transaction,
  type Connection,
} from "@solana/web3.js";
import { RpcExecutor, type ExecutionRecord } from "../src/execution.js";
const key = Keypair.generate();
function tx() {
  const t = new Transaction({
    feePayer: key.publicKey,
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
  }).add(
    SystemProgram.transfer({
      fromPubkey: key.publicKey,
      toPubkey: key.publicKey,
      lamports: 1,
    }),
  );
  t.sign(key);
  return t;
}
function setup(overrides: Record<string, unknown> = {}) {
  let sends = 0;
  const records = new Map<string, ExecutionRecord>();
  const connection = {
    simulateTransaction: async () => ({ value: { err: null } }),
    sendRawTransaction: async () => {
      sends++;
      return "signature";
    },
    getSignatureStatuses: async () => ({
      value: [{ err: null, confirmationStatus: "confirmed" }],
    }),
    getBlockHeight: async () => 10,
    ...overrides,
  } as unknown as Connection;
  return {
    executor: new RpcExecutor(connection, {
      get: async (id) => records.get(id),
      save: async (r) => {
        records.set(r.id, structuredClone(r));
      },
    }),
    records,
    sends: () => sends,
  };
}
test("submission success requires chain confirmation and duplicate IDs submit once", async () => {
  const { executor, sends } = setup();
  const transaction = tx();
  const r = await Promise.all([
    executor.execute("id", transaction, 20),
    executor.execute("id", transaction, 20),
  ]);
  assert.equal(r[0].status, "confirmed");
  assert.equal(sends(), 1);
  await executor.execute("id", transaction, 20);
  assert.equal(sends(), 1);
});
test("RPC disconnect after submission remains unresolved and never re-signs", async () => {
  const { executor } = setup({
    sendRawTransaction: async () => {
      throw Error("network");
    },
  });
  assert.equal(
    (await executor.execute("unknown", tx(), 20)).status,
    "unresolved",
  );
});
test("simulation rejection prevents send", async () => {
  const { executor, sends } = setup({
    simulateTransaction: async () => ({
      value: { err: { InstructionError: [0, "fail"] } },
    }),
  });
  assert.equal((await executor.execute("bad", tx(), 20)).status, "failed");
  assert.equal(sends(), 0);
});
test("expired blockhash without historical signature stays explicitly unobserved", async () => {
  const { executor } = setup({
    getSignatureStatuses: async () => ({ value: [null] }),
    getBlockHeight: async () => 30,
  });
  assert.equal(
    (await executor.execute("expired", tx(), 20)).status,
    "expired-unobserved",
  );
});
test("confirmed instruction failure is failed despite accepted submission", async () => {
  const { executor } = setup({
    getSignatureStatuses: async () => ({
      value: [
        {
          err: { InstructionError: [0, "fail"] },
          confirmationStatus: "confirmed",
        },
      ],
    }),
  });
  assert.equal((await executor.execute("failed", tx(), 20)).status, "failed");
});
