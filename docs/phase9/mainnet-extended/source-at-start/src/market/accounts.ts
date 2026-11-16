import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  unpackMint,
  unpackAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getExtensionTypes,
  ExtensionType,
} from "@solana/spl-token";
import { BorshReader } from "../borsh-reader.js";
import type { MarketBatch, Signal } from "./types.js";
import { verified, failed } from "./types.js";
export const SOL = "So11111111111111111111111111111111111111112";
export const ZERO = PublicKey.default.toBase58();
export const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const FEES = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
export const CLOCK = "SysvarC1ock11111111111111111111111111111111";
export const pda = (program: string, ...seeds: (string | Buffer)[]) =>
  PublicKey.findProgramAddressSync(
    seeds.map((s) => (typeof s === "string" ? Buffer.from(s) : s)),
    new PublicKey(program),
  )[0].toBase58();
export function account(batch: MarketBatch, address: string, owner?: string) {
  const a = batch.accounts[address];
  if (
    !a ||
    a.executable ||
    (owner && a.owner !== owner) ||
    !Array.isArray(a.data) ||
    a.data[1] !== "base64" ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(a.data[0])
  )
    throw Error("Missing or invalid market account");
  const data = Buffer.from(a.data[0], "base64");
  if (data.length > 262144) throw Error("Account byte bound");
  return {
    owner: new PublicKey(a.owner),
    data,
    executable: false,
    lamports: 0,
    rentEpoch: 0,
  };
}
export function struct(
  batch: MarketBatch,
  address: string,
  owner: string,
  schema: any,
  name: string,
  padTo?: number,
) {
  let data = account(batch, address, owner).data;
  const discriminator = schema.accounts.find(
    (a: any) => a.name === name,
  )?.discriminator;
  if (!discriminator || !data.subarray(0, 8).equals(Buffer.from(discriminator)))
    throw Error("Unsupported account discriminator");
  if (padTo !== undefined && data.length < padTo)
    data = Buffer.concat([data, Buffer.alloc(padTo - data.length)]);
  const reader = new BorshReader(data.subarray(8), schema.types);
  const v = reader.read({ defined: { name } });
  reader.finish(true);
  return v;
}
export function mint(batch: MarketBatch, address: string) {
  const info = account(batch, address);
  if (
    !info.owner.equals(TOKEN_PROGRAM_ID) &&
    !info.owner.equals(TOKEN_2022_PROGRAM_ID)
  )
    throw Error("Unsupported mint owner");
  const m = unpackMint(new PublicKey(address), info, info.owner);
  if (
    !m.isInitialized ||
    m.decimals > 18 ||
    (m.supply <= 0n && address !== SOL)
  )
    throw Error("Invalid mint supply or decimals");
  const extensions = getExtensionTypes(m.tlvData);
  const allowed = [ExtensionType.MetadataPointer, ExtensionType.TokenMetadata];
  const restricted = extensions.some((t) => !allowed.includes(t));
  const signals: Record<string, Signal> = {
    mintAuthority: m.mintAuthority
      ? failed("Mint authority remains enabled")
      : verified(false, "Mint authority disabled", batch.contextSlot),
    freezeAuthority: m.freezeAuthority
      ? failed("Freeze authority remains enabled")
      : verified(false, "Freeze authority disabled", batch.contextSlot),
    transferRestrictions: restricted
      ? failed("Unsupported or transfer-affecting Token-2022 extension")
      : verified(
          false,
          "Legacy token or metadata-only Token-2022 extension set",
          batch.contextSlot,
        ),
    extensions: verified(
      extensions.map((t) => ExtensionType[t] ?? String(t)),
      "Exact mint TLV extension identifiers",
      batch.contextSlot,
    ),
  };
  return { ...m, program: info.owner.toBase58(), signals };
}
export function vault(
  batch: MarketBatch,
  address: string,
  mintAddress: string,
  authority: string,
  program: string,
) {
  const a = unpackAccount(
    new PublicKey(address),
    account(batch, address, program),
    new PublicKey(program),
  );
  if (
    a.mint.toBase58() !== mintAddress ||
    a.owner.toBase58() !== authority ||
    !a.isInitialized ||
    a.isFrozen ||
    a.delegate ||
    a.closeAuthority ||
    getExtensionTypes(a.tlvData).some((t) => t !== ExtensionType.ImmutableOwner)
  )
    throw Error("Invalid, restricted or delegated vault");
  return a.amount;
}
export function provenance(batch: MarketBatch) {
  return Object.entries(batch.accounts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([address, a]) => ({
      address,
      owner: a?.owner ?? "",
      sha256: createHash("sha256")
        .update(a ? `${a.owner}:${a.data[0]}` : "missing")
        .digest("hex"),
    }));
}
export function validateBatch(
  batch: MarketBatch,
  provider: string,
  minimumSlot: number,
) {
  if (
    batch.provider !== provider ||
    batch.commitment !== "finalized" ||
    !Number.isSafeInteger(batch.contextSlot) ||
    batch.contextSlot < minimumSlot ||
    !Number.isFinite(batch.retrievedMono) ||
    !Number.isFinite(batch.retrievedAt)
  )
    throw Error("Inconsistent provider evidence or reorganized observation");
}
/** Complete balance reconciliation catches missing/new positive-balance accounts between enumeration and this bank. */
export function concentration(
  batch: MarketBatch,
  addresses: string[],
  mintAddress: string,
  program: string,
  supply: bigint,
  custody: string[],
): Signal {
  if (!addresses.length || addresses.length > 20)
    return failed("Complete holder enumeration unavailable");
  let total = 0n,
    circulating = 0n;
  const owners = new Map<string, bigint>();
  for (const address of new Set(addresses)) {
    const a = unpackAccount(
      new PublicKey(address),
      account(batch, address, program),
      new PublicKey(program),
    );
    if (a.mint.toBase58() !== mintAddress)
      throw Error("Inconsistent holder mint");
    total += a.amount;
    if (custody.includes(address)) continue;
    circulating += a.amount;
    const owner = a.owner.toBase58();
    owners.set(owner, (owners.get(owner) ?? 0n) + a.amount);
  }
  if (total !== supply || circulating <= 0n)
    return failed(
      "Holder balances do not reconcile to mint supply or no circulating supply",
    );
  const top = [...owners.values()].reduce((a, b) => (a > b ? a : b), 0n);
  return verified(
    {
      topOwnerBps: Number((top * 10000n + circulating - 1n) / circulating),
      circulatingAtoms: circulating.toString(),
      accounts: addresses.length,
      ownerCount: owners.size,
    },
    "Complete token-account balance reconciliation; protocol custody excluded. Common beneficial control across owner keys remains unknown.",
    batch.contextSlot,
  );
}
