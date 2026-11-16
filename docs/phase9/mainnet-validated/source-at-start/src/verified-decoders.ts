import type { EventFreshness } from "./freshness.js";
import { PublicKey } from "@solana/web3.js";
import { createHash } from "node:crypto";
import bs58 from "bs58";
import layouts from "./protocol-layouts.json" with { type: "json" };
import { VERIFIED_PROGRAMS } from "./chain.js";
import { BorshReader } from "./borsh-reader.js";
export interface ParsedChainTransaction {
  slot: number;
  version: number | "legacy";
  blockTime?: number | null;
  meta: {
    err: unknown;
    logMessages: string[] | null;
    innerInstructions?:
      | { index: number; instructions: ChainInstruction[] }[]
      | null;
  } | null;
  transaction: {
    signatures: string[];
    message: {
      accountKeys: { pubkey: string; signer: boolean; writable: boolean }[];
      instructions: ChainInstruction[];
    };
  };
}
export interface ChainInstruction {
  programId: string;
  accounts?: string[];
  data?: string;
  stackHeight?: number | null;
}
export interface AccountEvidence {
  contextSlot: number;
  commitment: "finalized";
  accounts: Record<
    string,
    {
      owner: string;
      data: [string, "base64"];
      executable: boolean;
      lamports?: number;
    } | null
  >;
}
export interface VerifiedLaunch {
  verifiedAt?: number;
  blockTimeMs?: number;
  /** Non-enumerable, process-local receipt timestamp; omitted from persisted evidence. */
  receiptMonoMs?: number;
  sourceProvider?: string;
  creationCommitment?: "finalized";
  id: string;
  program: string;
  signature: string;
  slot: number;
  kind: "launch" | "pool";
  address: string;
  mints: string[];
  creator: string | null;
  chainTimestamp: string | null;
  instruction: string;
  layoutRevision: string;
  accountContextSlot: number;
  executionEligible: false;
  freshness?: EventFreshness;
}
const schemas = layouts as Record<string, any>;
export const VERIFIED_INSTRUCTIONS: Record<string, string[]> = {
  pump: ["create_v2"],
  pumpswap: ["create_pool"],
  "raydium-cpmm": ["initialize"],
  "meteora-dlmm": ["initialize_lb_pair"],
};
export const PROTOCOL_REVISIONS: Record<string, string> = {
  pump: "639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22",
  pumpswap: "639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22",
  "raydium-cpmm": "3d69122790e97cd6aff24e8ba95940793773f58c",
  "meteora-dlmm": "af36dd53ab180783ccecda306926189a4700953c",
};
const discriminator = (namespace: string, name: string) =>
  createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8);
const key = (v: string | Uint8Array) => new PublicKey(v);
const pda = (program: string, seeds: Buffer[]) =>
  PublicKey.findProgramAddressSync(seeds, key(program))[0].toBase58();
const EVENT_CPI = Buffer.from("e445a52e51cb9a1d", "hex");
interface Creation {
  ix: ChainInstruction;
  name: string;
  accounts: Record<string, string>;
  args: Record<string, any>;
  events: Buffer[];
  ordinal: number;
}
const rayNames = [
  "creator",
  "amm_config",
  "authority",
  "pool_state",
  "token_0_mint",
  "token_1_mint",
  "lp_mint",
  "creator_token_0",
  "creator_token_1",
  "creator_lp_token",
  "token_0_vault",
  "token_1_vault",
  "create_pool_fee",
  "observation_state",
  "token_program",
  "token_0_program",
  "token_1_program",
  "associated_token_program",
  "system_program",
  "rent",
];
function definitions(program: string) {
  if (program === "raydium-cpmm")
    return [
      {
        name: "initialize",
        discriminator: [...discriminator("global", "initialize")],
        accounts: rayNames.map((name) => ({ name })),
        args: [
          { name: "init_amount_0", type: "u64" },
          { name: "init_amount_1", type: "u64" },
          { name: "open_time", type: "u64" },
        ],
      },
    ];
  return (schemas[program]?.instructions ?? []).filter((i: any) =>
    VERIFIED_INSTRUCTIONS[program]?.includes(i.name),
  );
}
/** Complete invocation stack plus per-program instruction order; failed nested invocations cannot contribute events. */
function creations(program: string, tx: ParsedChainTransaction): Creation[] {
  const address = VERIFIED_PROGRAMS.find((p) => p.name === program)?.address;
  if (!address) throw Error("Unknown program");
  if (tx.version !== 0 && tx.version !== 1 && tx.version !== "legacy")
    throw Error("Unsupported transaction version");
  if (!tx.meta || tx.meta.err !== null)
    throw Error("Failed or unavailable transaction");
  if (
    !Number.isSafeInteger(tx.slot) ||
    tx.slot < 0 ||
    !tx.transaction.signatures[0]
  )
    throw Error("Invalid transaction identity");
  const logs = tx.meta.logMessages;
  if (
    !logs ||
    logs.length > 4096 ||
    Buffer.byteLength(JSON.stringify(logs)) > 262144
  )
    throw Error("Missing or oversized transaction logs");
  const instructions: ChainInstruction[] = [];
  if (
    tx.transaction.message.instructions.length > 256 ||
    tx.transaction.message.accountKeys.length > 256
  )
    throw Error("Transaction bound");
  tx.transaction.message.instructions.forEach((ix, i) => {
    instructions.push(ix);
    for (const inner of tx.meta!.innerInstructions?.find((g) => g.index === i)
      ?.instructions ?? [])
      instructions.push(inner);
  });
  if (instructions.length > 2048) throw Error("Instruction bound");
  const own = instructions.filter((i) => i.programId === address);
  let next = 0;
  const result: Creation[] = [];
  const stack: {
    program: string;
    start: number;
    creation?: Creation;
    events: Buffer[];
  }[] = [];
  for (const line of logs) {
    const invoke = /^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[(\d+)\]$/.exec(
      line,
    );
    if (invoke) {
      if (Number(invoke[2]) !== stack.length + 1)
        throw Error("Incomplete invocation stack");
      let creation: Creation | undefined;
      const frame = {
        program: invoke[1]!,
        start: result.length,
        creation,
        events: [] as Buffer[],
      };
      if (frame.program === address) {
        const ix = own[next++];
        if (!ix?.data || !ix.accounts)
          throw Error("Missing attributed instruction");
        if (ix.stackHeight != null && ix.stackHeight !== Number(invoke[2]))
          throw Error("Instruction depth mismatch");
        const bytes = Buffer.from(bs58.decode(ix.data));
        if (bytes.length > 65536) throw Error("Instruction byte bound");
        const definition = definitions(program).find((d: any) =>
          bytes.subarray(0, 8).equals(Buffer.from(d.discriminator)),
        );
        if (definition) {
          if (
            ix.accounts.length < definition.accounts.length ||
            ix.accounts.length > 64
          )
            throw Error("Unknown account layout");
          const argsReader = new BorshReader(
            bytes.subarray(8),
            schemas[program]?.types,
          );
          const args = argsReader.fields(definition.args);
          argsReader.finish();
          frame.creation = {
            ix,
            name: definition.name,
            args,
            accounts: Object.fromEntries(
              definition.accounts.map((a: any, i: number) => [
                a.name,
                ix.accounts![i]!,
              ]),
            ),
            events: frame.events,
            ordinal: next - 1,
          };
          for (const account of definition.accounts) {
            const value = frame.creation.accounts[account.name]!;
            key(value);
            if (account.address && value !== account.address)
              throw Error("Wrong fixed instruction account");
            const meta = tx.transaction.message.accountKeys.find(
              (k) => k.pubkey === value,
            );
            if (account.optional && value === address) continue;
            if (
              !meta ||
              (account.signer && Number(invoke[2]) === 1 && !meta.signer) ||
              (account.writable && !meta.writable)
            )
              throw Error("Missing account privilege: " + account.name);
          }
        }
        if (bytes.subarray(0, 8).equals(EVENT_CPI))
          frame.events.push(bytes.subarray(8));
      }
      stack.push(frame);
      continue;
    }
    const end = /^Program ([1-9A-HJ-NP-Za-km-z]+) (success|failed:.*)$/.exec(
      line,
    );
    if (end) {
      const frame = stack.pop();
      if (frame?.program !== end[1]) throw Error("Mismatched invocation stack");
      if (end[2] !== "success") {
        result.splice(frame.start);
        continue;
      }
      if (frame.creation) result.push(frame.creation);
      for (const parent of stack)
        if (parent.creation) parent.events.push(...frame.events);
      continue;
    }
    if (
      stack.at(-1)?.program === address &&
      /^Program log: Instruction: (?:Create|Initialize)/.test(line) &&
      !stack.at(-1)?.creation
    )
      throw Error("Unknown creation instruction layout");
    if (
      line.startsWith("Program data: ") &&
      stack.at(-1)?.program === address
    ) {
      const data = line.slice(14);
      if (
        data.length > 48000 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          data,
        )
      )
        throw Error("Malformed program data");
      stack.at(-1)!.events.push(Buffer.from(data, "base64"));
    }
  }
  if (stack.length || next !== own.length)
    throw Error("Truncated or incompatible invocation history");
  return result;
}
function accountData(
  address: string,
  owner: string,
  evidence: AccountEvidence,
) {
  const a = evidence.accounts[address];
  if (!a || a.owner !== owner || a.executable || a.data[1] !== "base64")
    throw Error("Missing or incompatible account evidence");
  const b = Buffer.from(a.data[0], "base64");
  if (b.length > 65536) throw Error("Account data bound");
  return b;
}
function readAccount(
  program: string,
  name: string,
  address: string,
  e: AccountEvidence,
) {
  const schema = schemas[program],
    disc = schema.accounts.find((a: any) => a.name === name)?.discriminator;
  const b = accountData(address, schema.address, e);
  if (!disc || !b.subarray(0, 8).equals(Buffer.from(disc)))
    throw Error("Wrong account discriminator");
  const r = new BorshReader(b.subarray(8), schema.types);
  const data = r.read({ defined: { name } });
  r.finish(true);
  return data;
}
function eventData(program: string, creation: Creation) {
  const schema = schemas[program];
  for (const b of creation.events) {
    const def = schema.events.find((e: any) =>
      b.subarray(0, 8).equals(Buffer.from(e.discriminator)),
    );
    if (def) {
      const r = new BorshReader(b.subarray(8), schema.types);
      const value = r.read({ defined: { name: def.name } });
      r.finish();
      return value;
    }
  }
  throw Error("Required creation event unavailable");
}
function checkPdas(program: string, c: Creation) {
  const schema = schemas[program];
  if (!schema) return;
  const definition = definitions(program).find((d: any) => d.name === c.name);
  for (const a of definition.accounts) {
    if (!a.pda || (a.optional && c.accounts[a.name] === schema.address))
      continue;
    const seeds = a.pda.seeds.map((s: any) => {
      if (s.kind === "const") return Buffer.from(s.value);
      if (s.kind === "account" && !s.path.includes("."))
        return key(c.accounts[s.path]!).toBuffer();
      if (s.kind === "arg" && s.path === "index") {
        const b = Buffer.alloc(2);
        b.writeUInt16LE(c.args.index);
        return b;
      }
      throw Error("Unsupported PDA seed layout");
    });
    let owner = schema.address;
    if (a.pda.program) {
      const p = a.pda.program;
      owner =
        p.kind === "const"
          ? key(Buffer.from(p.value) as any).toBase58()
          : c.accounts[p.path];
    }
    if (pda(owner, seeds) !== c.accounts[a.name])
      throw Error("Instruction PDA mismatch");
  }
}
export function requiredLaunchAccounts(
  program: string,
  tx: ParsedChainTransaction,
) {
  return [
    ...new Set(
      creations(program, tx).flatMap((c) =>
        program === "pump"
          ? [c.accounts.bonding_curve!]
          : program === "pumpswap"
            ? [c.accounts.pool!]
            : program === "meteora-dlmm"
              ? [c.accounts.lb_pair!]
              : [c.accounts.pool_state!],
      ),
    ),
  ];
}
export function decodeVerifiedTransaction(
  program: string,
  tx: ParsedChainTransaction,
  evidence: AccountEvidence,
): VerifiedLaunch[] {
  if (
    evidence.commitment !== "finalized" ||
    !Number.isSafeInteger(evidence.contextSlot) ||
    evidence.contextSlot < tx.slot
  )
    throw Error("Account evidence is behind transaction");
  return creations(program, tx).map((c) => {
    let address: string,
      mints: string[],
      creator: string | null,
      timestamp: string | null = null;
    const a = c.accounts;
    if (program === "raydium-cpmm") {
      const owner = VERIFIED_PROGRAMS.find((p) => p.name === program)!.address;
      address = a.pool_state!;
      mints = [a.token_0_mint!, a.token_1_mint!];
      creator = a.creator!;
      if (
        Buffer.compare(key(mints[0]!).toBuffer(), key(mints[1]!).toBuffer()) >=
        0
      )
        throw Error("Unsorted CPMM mints");
      const expected = pda(owner, [
        Buffer.from("pool"),
        key(a.amm_config!).toBuffer(),
        ...mints.map((m) => key(m).toBuffer()),
      ]);
      if (
        address !== expected &&
        !tx.transaction.message.accountKeys.find((k) => k.pubkey === address)
          ?.signer
      )
        throw Error("Invalid CPMM pool ownership");
      for (const [field, seeds] of [
        ["authority", [Buffer.from("vault_and_lp_mint_auth_seed")]],
        ["lp_mint", [Buffer.from("pool_lp_mint"), key(address).toBuffer()]],
        [
          "token_0_vault",
          [
            Buffer.from("pool_vault"),
            key(address).toBuffer(),
            key(mints[0]!).toBuffer(),
          ],
        ],
        [
          "token_1_vault",
          [
            Buffer.from("pool_vault"),
            key(address).toBuffer(),
            key(mints[1]!).toBuffer(),
          ],
        ],
        [
          "observation_state",
          [Buffer.from("observation"), key(address).toBuffer()],
        ],
      ] as [string, Buffer[]][])
        if (pda(owner, seeds) !== a[field])
          throw Error("CPMM account PDA mismatch");
      const b = accountData(address, owner, evidence);
      if (
        b.length !== 637 ||
        !b.subarray(0, 8).equals(discriminator("account", "PoolState"))
      )
        throw Error("Unknown CPMM PoolState layout");
      const fields = [
        "amm_config",
        "creator",
        "token_0_vault",
        "token_1_vault",
        "lp_mint",
        "token_0_mint",
        "token_1_mint",
        "token_0_program",
        "token_1_program",
        "observation_state",
      ];
      for (let i = 0; i < fields.length; i++)
        if (
          key(b.subarray(8 + 32 * i, 40 + 32 * i)).toBase58() !== a[fields[i]!]
        )
          throw Error("CPMM account relationship mismatch");
    } else {
      checkPdas(program, c);
      const ev = eventData(program, c);
      if (program === "pump") {
        address = a.bonding_curve!;
        mints = [a.mint!];
        creator = ev.creator;
        timestamp = ev.timestamp;
        if (
          ev.mint !== mints[0] ||
          ev.bonding_curve !== address ||
          ev.user !== a.user ||
          ev.name !== c.args.name ||
          ev.symbol !== c.args.symbol ||
          ev.uri !== c.args.uri ||
          ev.creator !== c.args.creator
        )
          throw Error("Pump instruction/event mismatch");
        readAccount(program, "BondingCurve", address, evidence);
      } else if (program === "pumpswap") {
        address = a.pool!;
        mints = [a.base_mint!, a.quote_mint!];
        creator = a.creator!;
        timestamp = ev.timestamp;
        if (
          ev.pool !== address ||
          ev.base_mint !== mints[0] ||
          ev.quote_mint !== mints[1] ||
          ev.creator !== creator ||
          ev.index !== c.args.index ||
          ev.lp_mint !== a.lp_mint
        )
          throw Error("PumpSwap instruction/event mismatch");
        const pool = readAccount(program, "Pool", address, evidence);
        for (const field of [
          "creator",
          "base_mint",
          "quote_mint",
          "lp_mint",
          "pool_base_token_account",
          "pool_quote_token_account",
        ])
          if (pool[field] !== a[field])
            throw Error("PumpSwap account relationship mismatch");
      } else {
        address = a.lb_pair!;
        mints = [a.token_mint_x!, a.token_mint_y!];
        creator = a.funder ?? null;
        if (
          ev.lb_pair !== address ||
          ev.token_x !== mints[0] ||
          ev.token_y !== mints[1]
        )
          throw Error("DLMM instruction/event mismatch");
        const pool = readAccount(program, "LbPair", address, evidence);
        if (
          pool.token_x_mint !== mints[0] ||
          pool.token_y_mint !== mints[1] ||
          pool.reserve_x !== a.reserve_x ||
          pool.reserve_y !== a.reserve_y ||
          pool.oracle !== a.oracle ||
          pool.bin_step !== ev.bin_step
        )
          throw Error("DLMM account relationship mismatch");
        if (c.name === "initialize_lb_pair" && ev.bin_step !== c.args.bin_step)
          throw Error("DLMM bin step mismatch");
      }
    }
    return {
      id: `${program}:${tx.transaction.signatures[0]}:${c.ordinal}`,
      program,
      signature: tx.transaction.signatures[0]!,
      slot: tx.slot,
      kind: program === "pump" ? "launch" : "pool",
      address,
      mints,
      creator,
      chainTimestamp: timestamp,
      instruction: c.name,
      layoutRevision: PROTOCOL_REVISIONS[program]!,
      accountContextSlot: evidence.contextSlot,
      executionEligible: false,
    };
  });
}
