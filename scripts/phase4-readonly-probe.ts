import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { MarketRpc } from "../src/market/rpc.js";
import { Telemetry } from "../src/telemetry.js";
const fixtures = await Promise.all(
  ["pump", "pumpswap", "raydium-cpmm", "meteora-dlmm"].map(async (venue) =>
    JSON.parse(
      await readFile(`docs/phase4/fixtures/${venue}-market.json`, "utf8"),
    ),
  ),
);
const keys = [...new Set(fixtures.flatMap((f) => Object.keys(f.accounts)))];
const m = new Telemetry(),
  rpc = new MarketRpc(
    process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    m,
  ),
  start = performance.now();
let result;
try {
  const snapshot = await rpc.accounts(
    keys,
    Math.max(...fixtures.map((f) => f.contextSlot)),
  );
  result = {
    status: "read-success",
    contextSlot: snapshot.contextSlot,
    accounts: Object.keys(snapshot.accounts).length,
    scope:
      "Read-only account retrieval only; no transaction verification, fee/risk completeness or paper entry demonstrated",
  };
} catch (e) {
  result = {
    status: "read-failed",
    reason: (e as Error).message,
    scope:
      "Native Node transport probe failed; recorded Python RPC captures do not establish end-to-end Node/mainnet service operation",
  };
}
await writeFile(
  "docs/phase4/native-rpc-probe.json",
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      provider: rpc.provider,
      elapsedMs: performance.now() - start,
      requests: 1,
      result,
      telemetry: m.report(),
      liveTrading: false,
    },
    null,
    2,
  ) + "\n",
);
console.log(result.status);
