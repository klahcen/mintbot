import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import bs58 from "bs58";
import {
  decodeVerifiedTransaction,
  requiredLaunchAccounts,
  type ParsedChainTransaction,
  type AccountEvidence,
} from "../src/verified-decoders.js";
import { DecoderRegistry } from "../src/decoders.js";
for (const program of ["pump", "pumpswap", "raydium-cpmm", "meteora-dlmm"]) {
  const capture = JSON.parse(
      await readFile(`docs/phase3/fixtures/${program}-creation.json`, "utf8"),
    ),
    tx = capture.result as ParsedChainTransaction;
  const evidence = JSON.parse(
    await readFile(`docs/phase3/fixtures/${program}-accounts.json`, "utf8"),
  ) as AccountEvidence;
  test(`${program}: finalized public creation fixture validates instructions/events/accounts and stable discovery identity`, () => {
    assert.equal(capture.provenance.commitment, "finalized");
    assert.equal(capture.provenance.signature, tx.transaction.signatures[0]);
    const r = new DecoderRegistry().decodeTransaction(program, tx, evidence);
    assert.equal(r.length, 1);
    assert.equal(r[0]!.executionEligible, false);
    assert.ok(r[0]!.mints.length);
    assert.deepEqual(
      r,
      decodeVerifiedTransaction(
        program,
        structuredClone(tx),
        structuredClone(evidence),
      ),
    );
  });
  test(`${program}: failed, unsupported-version, corrupt account and malformed creation data fail closed`, () => {
    const failed = structuredClone(tx);
    failed.meta!.err = { InstructionError: [0, "InvalidAccountData"] };
    assert.throws(() => decodeVerifiedTransaction(program, failed, evidence));
    const unknown = structuredClone(tx);
    unknown.version = 9;
    assert.throws(
      () => decodeVerifiedTransaction(program, unknown, evidence),
      /version/,
    );
    const wrong = structuredClone(evidence);
    const address = requiredLaunchAccounts(program, tx)[0]!;
    wrong.accounts[address]!.owner = "11111111111111111111111111111111";
    assert.throws(
      () => decodeVerifiedTransaction(program, tx, wrong),
      /account evidence/,
    );
    const shortAccount = structuredClone(evidence);
    shortAccount.accounts[address]!.data = [
      Buffer.from([1, 2, 3]).toString("base64"),
      "base64",
    ];
    assert.throws(() => decodeVerifiedTransaction(program, tx, shortAccount));
    const behind = structuredClone(evidence);
    behind.contextSlot = tx.slot - 1;
    assert.throws(
      () => decodeVerifiedTransaction(program, tx, behind),
      /behind/,
    );
    const truncated = structuredClone(tx);
    const all = [
      ...truncated.transaction.message.instructions,
      ...(truncated.meta!.innerInstructions ?? []).flatMap(
        (g) => g.instructions,
      ),
    ];
    const originalKeys = requiredLaunchAccounts(program, tx);
    const ix = all.find(
      (i) =>
        i.accounts?.some((a) => originalKeys.includes(a)) &&
        i.data &&
        Buffer.from(bs58.decode(i.data)).length > 8,
    )!;
    const bytes = bs58.decode(ix.data!);
    ix.data = bs58.encode(bytes.subarray(0, 8));
    assert.throws(() =>
      decodeVerifiedTransaction(program, truncated, evidence),
    );
    const logs = structuredClone(tx);
    logs.meta!.logMessages = logs.meta!.logMessages!.slice(0, -1);
    assert.throws(
      () => decodeVerifiedTransaction(program, logs, evidence),
      /invocation|history/,
    );
  });
}
