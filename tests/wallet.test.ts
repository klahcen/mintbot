import test from "node:test";
import assert from "node:assert/strict";
import { Keypair } from "@solana/web3.js";
import { encryptWallet, decryptWallet, authorized } from "../src/wallet.js";
test("AES GCM vault authenticates password, identity and ciphertext", async () => {
  const key = Keypair.generate();
  const vault = await encryptWallet(key, "correct horse battery staple");
  assert.equal(
    (
      await decryptWallet(vault, "correct horse battery staple")
    ).publicKey.toBase58(),
    key.publicKey.toBase58(),
  );
  await assert.rejects(decryptWallet(vault, "wrong passphrase"));
  await assert.rejects(
    decryptWallet(
      { ...vault, publicKey: Keypair.generate().publicKey.toBase58() },
      "correct horse battery staple",
    ),
  );
  assert.ok(
    !JSON.stringify(vault).includes(
      Buffer.from(key.secretKey).toString("base64"),
    ),
  );
});
test("API bearer auth rejects missing token and timing-safe mismatches", () => {
  assert.equal(authorized(undefined, ""), false);
  assert.equal(authorized("Bearer secret", "secret"), true);
  assert.equal(authorized("Bearer secretx", "secret"), false);
  assert.equal(authorized("Basic secret", "secret"), false);
});
