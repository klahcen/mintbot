/** Exercise the actual web3 HTTP client after its scoped Jayson 5 override. No network outside localhost. */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequire } from "node:module";
import { Connection, PublicKey } from "@solana/web3.js";
const require = createRequire(import.meta.url);

test("Jayson override preserves web3 HTTP IDs, params, account bytes and RPC failures", async () => {
  let behavior: "balance" | "accounts" | "error" | "invalid" = "balance";
  const received: any[] = [];
  const server = createServer(async (request, response) => {
    const parts: Buffer[] = [];
    for await (const chunk of request) parts.push(Buffer.from(chunk));
    const input = JSON.parse(Buffer.concat(parts).toString());
    received.push(input);
    response.setHeader("content-type", "application/json");
    if (behavior === "invalid") { response.end("{bad json"); return; }
    const result = behavior === "accounts"
      ? { context: { slot: 77 }, value: [{ data: ["AQID", "base64"], owner: PublicKey.default.toBase58(), executable: false, lamports: 5, rentEpoch: 0 }] }
      : { context: { slot: 77 }, value: 123456789 };
    response.end(JSON.stringify(behavior === "error"
      ? { jsonrpc: "2.0", id: input.id, error: { code: -32005, message: "Unit provider unavailable" } }
      : { jsonrpc: "2.0", id: input.id, result }));
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const address = server.address(); assert(address && typeof address === "object");
    const connection = new Connection(`http://127.0.0.1:${address.port}`, { commitment: "finalized", disableRetryOnRateLimit: true });
    assert.equal(await connection.getBalance(PublicKey.default), 123456789);
    behavior = "accounts";
    const accounts = await connection.getMultipleAccountsInfo([PublicKey.default]);
    assert.equal(accounts[0]?.data.toString("hex"), "010203");
    assert.equal(accounts[0]?.lamports, 5);
    behavior = "error"; await assert.rejects(connection.getBalance(PublicKey.default), /Unit provider unavailable/);
    behavior = "invalid"; await assert.rejects(connection.getBalance(PublicKey.default), /JSON|Unexpected|property/i);
    assert.equal(received[0].method, "getBalance");
    assert.deepEqual(received[0].params, [PublicKey.default.toBase58(), { commitment: "finalized" }]);
    assert.equal(new Set(received.map(row => row.id)).size, received.length);
    assert(received.every(row => typeof row.id === "string" && row.id.length > 0 && row.jsonrpc === "2.0"));
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test("Web3-used Jayson browser parser treats prototype-shaped keys as data and retains batch behavior", async () => {
  const Client = require("jayson/lib/client/browser");
  const client = new Client((wire: string, callback: Function) => {
    const input = JSON.parse(wire);
    if (Array.isArray(input)) callback(null, JSON.stringify(input.map(row => ({ jsonrpc: "2.0", id: row.id, result: row.method }))));
    else callback(null, `{"jsonrpc":"2.0","id":"${input.id}","result":{"__proto__":{"phase8Polluted":true},"value":7}}`);
  });
  const response: any = await new Promise((resolve, reject) => client.request("unit", [], (error: Error | null, result: any) => error ? reject(error) : resolve(result)));
  assert.equal(Object.getPrototypeOf(response.result), Object.prototype);
  assert.equal(Object.hasOwn(response.result, "__proto__"), true);
  assert.equal(({} as any).phase8Polluted, undefined);
  const batch = [client.request("one", []), client.request("two", [])];
  const results: any = await new Promise((resolve, reject) => client.request(batch, (error: Error | null, result: any) => error ? reject(error) : resolve(result)));
  assert.deepEqual(results.map((row: any) => row.result), ["one", "two"]);
});
