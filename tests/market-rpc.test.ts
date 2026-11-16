import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { MarketRpc } from "../src/market/rpc.js";
import { Telemetry } from "../src/telemetry.js";
import { Message, SystemProgram } from "@solana/web3.js";
import { json } from "./market-fixtures.js";
import pins from "../src/market/deployment-pins.json" with { type: "json" };
import { PUMP } from "../src/market/accounts.js";
async function server(
  fn: (method: string, params: any) => unknown | Promise<unknown>,
  run: (rpc: MarketRpc, methods: string[]) => Promise<void>,
  timeout = 1000,
) {
  const methods: string[] = [];
  const http = createServer(async (req, res) => {
    let body = "";
    for await (const b of req) body += b;
    const q = JSON.parse(body);
    methods.push(q.method);
    try {
      const result = await fn(q.method, q.params);
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    } catch {
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32000, message: "test failure" },
        }),
      );
    }
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  try {
    const address = http.address() as { port: number };
    await run(
      new MarketRpc(
        `http://127.0.0.1:${address.port}/secret-rpc-token`,
        new Telemetry(),
        timeout,
      ),
      methods,
    );
  } finally {
    http.closeAllConnections();
    await new Promise<void>((r) => http.close(() => r()));
  }
}
test("Market transport requests finalized minimum-context evidence and bounds account count", async () => {
  await server(
    (_method, p) => {
      assert.equal(p[1].commitment, "finalized");
      assert.equal(p[1].minContextSlot, 100);
      return { context: { slot: 101 }, value: [null] };
    },
    async (r, methods) => {
      const b = await r.accounts([PUMP], 100);
      assert.equal(b.contextSlot, 101);
      assert.equal(b.accounts[PUMP], null);
      assert(!b.provider.includes("secret"));
      await assert.rejects(r.accounts(Array(33).fill(PUMP), 100), /bound/);
      assert.deepEqual(methods, ["getMultipleAccounts"]);
    },
  );
});
test("Market RPC timeout and response errors are sanitized and counted", async () => {
  await server(
    async () => {
      await new Promise((r) => setTimeout(r, 50));
      return {};
    },
    async (r) => {
      await assert.rejects(
        r.accounts([PUMP], 0),
        (e) =>
          e instanceof Error && e.message === "Market read failed or timed out",
      );
    },
    10,
  );
  await server(
    () => {
      throw Error("test");
    },
    async (r) => {
      await assert.rejects(r.accounts([PUMP], 0), /failed/);
    },
  );
});
test("Inconsistent slots and truncated account response arrays fail closed", async () => {
  for (const result of [
    { context: { slot: 99 }, value: [null] },
    { context: { slot: 101 }, value: [] },
  ])
    await server(
      () => result,
      async (r) => {
        await assert.rejects(r.accounts([PUMP], 100), /Inconsistent/);
      },
    );
});
test("Deployment header pins accept recorded loader evidence and reject re-upgrades", async () => {
  const f = await json("docs/phase4/fixtures/deployment-headers.json");
  for (const drift of [false, true])
    await server(
      (_m, p) => {
        const values = p[0].map((key: string) =>
          structuredClone(f.result.value[f.keys.indexOf(key)]),
        );
        if (drift) {
          const bytes = Buffer.from(values[1].data[0], "base64");
          bytes.writeBigUInt64LE(BigInt(pins[PUMP].deploymentSlot + 1), 4);
          values[1].data[0] = bytes.toString("base64");
        }
        return { context: f.result.context, value: values };
      },
      async (r) => {
        if (drift) await assert.rejects(r.deployment(PUMP, 0), /upgraded/);
        else assert.equal((await r.deployment(PUMP, 0)).status, "verified");
      },
    );
});
test("Complete owner enumeration is bounded and uses no largest-account safety shortcut", async () => {
  await server(
    (m) => {
      assert.equal(m, "getProgramAccounts");
      return {
        context: { slot: 100 },
        value: Array.from({ length: 21 }, (_, i) => ({ pubkey: String(i) })),
      };
    },
    async (r) => {
      await assert.rejects(r.holders(PUMP, PUMP, 0), /exceeds bound/);
    },
  );
});
test("Network estimates use only allowlisted read RPCs and an unsigned fee message", async () => {
  await server(
    (method, params) => {
      if (method === "getLatestBlockhash")
        return {
          context: { slot: 100 },
          value: {
            blockhash: "11111111111111111111111111111111",
            lastValidBlockHeight: 100,
          },
        };
      if (method === "getRecentPrioritizationFees")
        return [
          { slot: 99, prioritizationFee: 1000 },
          { slot: 100, prioritizationFee: 2000 },
        ];
      if (method === "getMinimumBalanceForRentExemption") return 2039280;
      if (method === "getFeeForMessage") {
        assert.equal(params[1].commitment, "finalized");
        assert(typeof params[0] === "string");
        const message = Message.from(Buffer.from(params[0], "base64"));
        assert.equal(message.header.numRequiredSignatures, 1);
        assert.notEqual(message.instructions[0].programIdIndex, 0);
        assert(
          message.accountKeys[message.instructions[0].programIdIndex].equals(
            SystemProgram.programId,
          ),
        );
        return { context: { slot: 100 }, value: 5000 };
      }
      throw Error("Unpermitted method");
    },
    async (r, methods) => {
      const fee = await r.fees([PUMP]);
      assert.equal(fee.value?.baseLamports, "5000");
      assert.equal(fee.value?.priorityLamports, "200");
      assert.equal(fee.value?.rentLamports, "2039280");
      assert(methods.every((m) => m.startsWith("get")));
    },
  );
});
