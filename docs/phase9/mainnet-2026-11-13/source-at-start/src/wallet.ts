import { telemetry, type Telemetry } from "./telemetry.js";
import {
  scrypt as derive,
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import {
  Keypair,
  Transaction,
  type Connection,
  type TransactionInstruction,
  ComputeBudgetProgram,
} from "@solana/web3.js";
const scrypt = promisify(derive);
export interface EncryptedWallet {
  version: 1;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
  publicKey: string;
}
export async function encryptWallet(
  keypair: Keypair,
  password: string,
): Promise<EncryptedWallet> {
  if (password.length < 16)
    throw Error("Passphrase must contain at least 16 characters");
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const key = (await scrypt(password, salt, 32)) as Buffer;
  try {
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([
      cipher.update(keypair.secretKey),
      cipher.final(),
    ]);
    return {
      version: 1,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: encrypted.toString("base64"),
      publicKey: keypair.publicKey.toBase58(),
    };
  } finally {
    key.fill(0);
  }
}
export async function decryptWallet(
  vault: EncryptedWallet,
  password: string,
): Promise<Keypair> {
  if (vault.version !== 1) throw Error("Unknown vault version");
  const key = (await scrypt(
    password,
    Buffer.from(vault.salt, "base64"),
    32,
  )) as Buffer;
  let clear: Buffer | undefined;
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(vault.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(vault.tag, "base64"));
    clear = Buffer.concat([
      decipher.update(Buffer.from(vault.ciphertext, "base64")),
      decipher.final(),
    ]);
    const wallet = Keypair.fromSecretKey(Uint8Array.from(clear));
    if (wallet.publicKey.toBase58() !== vault.publicKey)
      throw Error("Wallet identity mismatch");
    return wallet;
  } finally {
    key.fill(0);
    clear?.fill(0);
  }
}
export function authorized(header: string | undefined, token: string) {
  if (!token || !header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7)),
    expected = Buffer.from(token);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
// Library-only construction primitive. No HTTP endpoint invokes this or loads keys.
// Caller must independently validate swap accounts, mint, minimum output and total spend.
export async function buildTransaction(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  computeUnits: number,
  microLamports: number,
  metrics: Telemetry = telemetry,
) {
  if (
    !Number.isInteger(computeUnits) ||
    computeUnits <= 0 ||
    computeUnits > 1400000 ||
    !Number.isSafeInteger(microLamports) ||
    microLamports < 0
  )
    throw Error("Invalid compute budget");
  const begin = metrics.now();
  const block = await metrics.rpc("getLatestBlockhash", () =>
    connection.getLatestBlockhash("confirmed"),
  );
  const blockhashMs = metrics.now() - begin;
  const constructionBegin = metrics.now();
  const tx = new Transaction({ feePayer: payer.publicKey, ...block }).add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
    ...instructions,
  );
  const constructionMs = metrics.now() - constructionBegin;
  const signingBegin = metrics.now();
  tx.sign(payer);
  const signingMs = metrics.now() - signingBegin;
  metrics.observe("wallet.blockhash_ms", blockhashMs);
  metrics.observe("wallet.construction_ms", constructionMs);
  metrics.observe("wallet.signing_ms", signingMs);
  return { tx, block, timings: { blockhashMs, constructionMs, signingMs } };
}
