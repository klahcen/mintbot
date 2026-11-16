import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import {
  ComputeBudgetProgram,
  PublicKey,
  type Connection,
} from "@solana/web3.js";
import { MintLayout, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import {
  VERIFIED_PROGRAMS,
  SolanaMonitor,
  decodeLaunch,
  decodeComputeBudget,
  inspectTransaction,
  scanMint,
  validatePrograms,
} from "../src/chain.js";
class FakeSocket extends EventEmitter {
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.emit("close");
  }
}
const observation = {
  program: "pump",
  signature: "signature",
  slot: 5,
  logs: [],
  failed: false,
  observedAt: 1,
};
test("verified programs are valid and missing protocol decoder fails closed", () => {
  validatePrograms(VERIFIED_PROGRAMS);
  assert.throws(() =>
    validatePrograms([VERIFIED_PROGRAMS[0]!, VERIFIED_PROGRAMS[0]!]),
  );
  assert.throws(
    () => decodeLaunch({ ...observation, program: "pumpswap" }),
    /decoder is not installed/,
  );
});
function createPumpData(): Buffer {
  const program = new PublicKey(VERIFIED_PROGRAMS[0]!.address);
  const mint = PublicKey.default;
  const curve = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), mint.toBuffer()],
    program,
  )[0];
  const string = (value: string) => {
    const bytes = Buffer.from(value);
    const length = Buffer.alloc(4);
    length.writeUInt32LE(bytes.length);
    return Buffer.concat([length, bytes]);
  };
  const u64 = Buffer.alloc(8);
  u64.writeBigUInt64LE(1000n);
  return Buffer.concat([
    Buffer.from([27, 114, 169, 77, 222, 235, 99, 118]),
    string("Test token"),
    string("TEST"),
    string("https://example.com"),
    mint.toBuffer(),
    curve.toBuffer(),
    mint.toBuffer(),
    mint.toBuffer(),
    u64,
    u64,
    u64,
    u64,
    u64,
    TOKEN_PROGRAM_ID.toBuffer(),
    Buffer.from([0, 1]),
    mint.toBuffer(),
    u64,
    u64,
    Buffer.from([0, 0]),
  ]);
}
test("pinned Pump CreateEvent decodes bounded strings, verifies PDA and rejects failed or malformed data", () => {
  const program = VERIFIED_PROGRAMS[0]!.address;
  const data = createPumpData();
  const logs = [
    `Program ${program} invoke [1]`,
    `Program data: ${data.toString("base64")}`,
    `Program ${program} success`,
  ];
  const decoded = decodeLaunch({ ...observation, logs });
  assert.equal(decoded[0]?.name, "Test token");
  assert.equal(decoded[0]?.tokenTotalSupply, "1000");
  assert.throws(
    () => decodeLaunch({ ...observation, logs, failed: true }),
    /Failed transaction/,
  );
  assert.throws(
    () => decodeLaunch({ ...observation, logs: logs.slice(0, 2) }),
    /Truncated invocation/,
  );
  const malicious = Buffer.from(data);
  malicious.writeUInt32LE(0xffffffff, 8);
  assert.throws(
    () =>
      decodeLaunch({
        ...observation,
        logs: [
          logs[0]!,
          `Program data: ${malicious.toString("base64")}`,
          logs[2]!,
        ],
      }),
    /exceeds bound/,
  );
  assert.throws(
    () =>
      decodeLaunch({
        ...observation,
        logs: [
          logs[0]!,
          `Program data: ${data.subarray(0, -1).toString("base64")}`,
          logs[2]!,
        ],
      }),
    /truncated/,
  );
});
test("spoofed event from nested malicious program is ignored despite a genuine Pump parent", () => {
  const pump = VERIFIED_PROGRAMS[0]!.address,
    spoof = PublicKey.default.toBase58();
  const data = createPumpData().toString("base64");
  assert.deepEqual(
    decodeLaunch({
      ...observation,
      logs: [
        `Program ${pump} invoke [1]`,
        `Program ${spoof} invoke [2]`,
        `Program data: ${data}`,
        `Program ${spoof} success`,
        `Program ${pump} success`,
      ],
    }),
    [],
  );
  assert.deepEqual(
    decodeLaunch({ ...observation, logs: [`Program data: ${data}`] }),
    [],
  );
  assert.deepEqual(
    decodeLaunch({
      ...observation,
      logs: [
        `Program ${spoof} invoke [1]`,
        `Program ${pump} invoke [2]`,
        `Program data: ${data}`,
        `Program ${pump} failed: custom program error: 0x1`,
        `Program ${spoof} success`,
      ],
    }),
    [],
  );
});
test("historical finalized mainnet fixture replays observed compute and CPI inventory", async () => {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        "../docs/fixtures/mainnet-pumpswap-transaction.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    result: any;
  };
  const tx = fixture.result;
  tx.transaction.message.instructions.forEach((ix: any) => {
    ix.programId = new PublicKey(ix.programId);
  });
  tx.meta.innerInstructions.forEach((group: any) =>
    group.instructions.forEach((ix: any) => {
      ix.programId = new PublicKey(ix.programId);
    }),
  );
  const connection = { getParsedTransaction: async () => tx } as Pick<
    Connection,
    "getParsedTransaction"
  >;
  const result = await inspectTransaction(
    connection,
    tx.transaction.signatures[0],
  );
  assert.equal(result.slot, 464978495);
  assert.equal(result.feeLamports, 7000);
  assert.equal(result.computeUnitsConsumed, 57286);
  assert.deepEqual(result.inventory[0]?.compute, {
    kind: "computeUnitLimit",
    value: "200000",
  });
  assert.deepEqual(result.inventory[1]?.compute, {
    kind: "microLamportsPerComputeUnit",
    value: "10000",
  });
  assert.ok(result.programs.includes(VERIFIED_PROGRAMS[1]!.address));
});
test("official compute budget binary encoding including u64 precision", () => {
  assert.deepEqual(
    decodeComputeBudget(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 250000 }).data,
    ),
    { kind: "computeUnitLimit", value: "250000" },
  );
  assert.deepEqual(
    decodeComputeBudget(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: 9007199254740993n,
      }).data,
    ),
    { kind: "microLamportsPerComputeUnit", value: "9007199254740993" },
  );
  assert.throws(() => decodeComputeBudget(Uint8Array.from([3, 0])));
});
test("WebSocket subscribes per program, deduplicates, tracks monotonic slot and stops", () => {
  const socket = new FakeSocket();
  const events: unknown[] = [];
  const monitor = new SolanaMonitor(
    "ws://localhost",
    [VERIFIED_PROGRAMS[0]!],
    (event) => events.push(event),
    {},
    () => socket,
  );
  monitor.start();
  socket.emit("open");
  assert.equal(JSON.parse(socket.sent[0]!).method, "logsSubscribe");
  socket.emit("message", JSON.stringify({ id: 1, result: 44 }));
  const send = (signature: string, slot: number) =>
    socket.emit(
      "message",
      JSON.stringify({
        method: "logsNotification",
        params: {
          subscription: 44,
          result: {
            context: { slot },
            value: { signature, err: null, logs: ["program log"] },
          },
        },
      }),
    );
  send("a", 9);
  send("a", 9);
  send("b", 8);
  assert.equal(events.length, 2);
  assert.equal(monitor.latestSlot, 9);
  monitor.stop();
  send("c", 10);
  assert.equal(events.length, 2);
});
test("WebSocket reconnect budget terminates after repeated disconnection", async () => {
  const sockets: FakeSocket[] = [];
  const errors: string[] = [];
  const monitor = new SolanaMonitor(
    "ws://localhost",
    [],
    () => {},
    {
      maxReconnects: 1,
      reconnectBaseMs: 1,
      onError: (error) => errors.push(error.message),
    },
    () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  );
  monitor.start();
  sockets[0]!.close();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(sockets.length, 2);
  sockets[1]!.close();
  assert.match(errors.join(), /budget exhausted/);
  monitor.stop();
});
test("transaction inspection inventories top-level, inner and compute instructions", async () => {
  const connection = {
    getParsedTransaction: async (_signature: string, options: unknown) => {
      assert.deepEqual(options, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
      });
      return {
        slot: 1,
        version: 0,
        blockTime: 2,
        transaction: {
          message: {
            instructions: [
              {
                programId: ComputeBudgetProgram.programId,
                accounts: [],
                data: bs58.encode(
                  ComputeBudgetProgram.setComputeUnitLimit({ units: 100000 })
                    .data,
                ),
              },
            ],
          },
        },
        meta: {
          fee: 5000,
          err: null,
          computeUnitsConsumed: 80000,
          innerInstructions: [
            {
              index: 0,
              instructions: [
                {
                  programId: TOKEN_PROGRAM_ID,
                  parsed: { type: "transferChecked" },
                },
              ],
            },
          ],
        },
      };
    },
  } as unknown as Pick<Connection, "getParsedTransaction">;
  const result = await inspectTransaction(connection, "signature");
  assert.equal(result.outcome, "succeeded");
  assert.equal(result.inventory[1]?.inner, true);
  assert.equal(result.inventory[0]?.compute?.value, "100000");
});
test("mint scanner decodes official token layout and keeps unknown evidence explicit", async () => {
  const address = new PublicKey(VERIFIED_PROGRAMS[0]!.address);
  const data = Buffer.alloc(MintLayout.span);
  MintLayout.encode(
    {
      mintAuthorityOption: 1,
      mintAuthority: address,
      supply: 1000n,
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data,
  );
  const connection = {
    getAccountInfoAndContext: async () => ({
      context: { slot: 10 },
      value: { owner: TOKEN_PROGRAM_ID, data, executable: false, lamports: 1 },
    }),
    getTokenLargestAccounts: async () => ({
      context: { slot: 11 },
      value: [{ amount: "600" }],
    }),
  } as unknown as Pick<
    Connection,
    "getAccountInfoAndContext" | "getTokenLargestAccounts"
  >;
  const result = await scanMint(connection, address.toBase58());
  assert.equal(result.mintAuthority, address.toBase58());
  assert.equal(result.largestTokenAccountBps, 6000);
  assert.ok(
    result.unknown.some((signal) => signal.includes("sell simulation")),
  );
});
