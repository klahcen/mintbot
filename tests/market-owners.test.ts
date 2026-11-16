import test from "node:test";
import assert from "node:assert/strict";
import { PublicKey } from "@solana/web3.js";
import { AccountLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { concentration } from "../src/market/accounts.js";
import type { MarketBatch } from "../src/market/types.js";
const key = (n: number) => new PublicKey(Buffer.alloc(32, n));
function batch(owners: number[], amounts: bigint[]) {
  const mint = key(99),
    addresses = owners.map((_, i) => key(i + 1).toBase58());
  const b: MarketBatch = {
    contextSlot: 1,
    commitment: "finalized",
    provider: "unit-only",
    retrievedAt: Date.now(),
    retrievedMono: 0,
    accounts: {},
  };
  for (let i = 0; i < owners.length; i++) {
    const data = Buffer.alloc(165);
    AccountLayout.encode(
      {
        mint,
        owner: key(owners[i]),
        amount: amounts[i],
        delegateOption: 0,
        delegate: PublicKey.default,
        state: 1,
        isNativeOption: 0,
        isNative: 0n,
        delegatedAmount: 0n,
        closeAuthorityOption: 0,
        closeAuthority: PublicKey.default,
      },
      data,
    );
    b.accounts[addresses[i]] = {
      owner: TOKEN_PROGRAM_ID.toBase58(),
      data: [data.toString("base64"), "base64"],
      executable: false,
    };
  }
  return { b, addresses, mint: mint.toBase58() };
}
test("Complete token-owner evidence aggregates split accounts and excludes verified protocol custody", () => {
  const x = batch([10, 11, 11, 12], [700n, 50n, 50n, 200n]);
  const r = concentration(
    x.b,
    x.addresses,
    x.mint,
    TOKEN_PROGRAM_ID.toBase58(),
    1000n,
    [x.addresses[0]],
  );
  assert.equal(r.status, "verified");
  assert.equal((r.value as any).topOwnerBps, 6667);
  assert.equal((r.value as any).ownerCount, 2);
});
test("Incomplete holder scans cannot pass the mint-supply reconciliation check", () => {
  const x = batch([10, 11], [700n, 100n]);
  const r = concentration(
    x.b,
    x.addresses,
    x.mint,
    TOKEN_PROGRAM_ID.toBase58(),
    1000n,
    [x.addresses[0]],
  );
  assert.equal(r.status, "failed");
});
test("Wrong-mint holder accounts fail closed", () => {
  const x = batch([10], [1000n]);
  assert.throws(
    () =>
      concentration(
        x.b,
        x.addresses,
        key(100).toBase58(),
        TOKEN_PROGRAM_ID.toBase58(),
        1000n,
        [],
      ),
    /mint/,
  );
});
