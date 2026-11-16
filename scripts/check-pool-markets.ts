import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { decodeVerifiedTransaction } from "../src/verified-decoders.js";
import { PoolMarketAdapter } from "../src/market/pools.js";
import { publicEvidence } from "../src/market/types.js";
const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const rows = [];
for (const venue of ["pumpswap", "raydium-cpmm", "meteora-dlmm"] as const) {
  try {
    const f = await json(`docs/phase4/fixtures/${venue}-market.json`);
    const l = decodeVerifiedTransaction(
      venue,
      (await json(`docs/phase3/fixtures/${venue}-creation.json`)).result,
      await json(`docs/phase3/fixtures/${venue}-accounts.json`),
    )[0];
    const rpc = {
      provider: f.provenance.provider,
      accounts: async () => ({
        ...f,
        provider: f.provenance.provider,
        retrievedAt: Date.now(),
        retrievedMono: performance.now(),
      }),
      largest: async () => ({ slot: f.contextSlot, amounts: [] }),
    };
    const a = new PoolMarketAdapter(venue);
    const state = await a.read(l, rpc);
    try {
      const buy = a.quote(state, "buy", 1000000n, 100);
      const sell = a.quote(state, "sell", buy.output, 100);
      rows.push({ venue, state, buy, sell });
    } catch (e) {
      rows.push({ venue, state, quoteError: (e as Error).message });
    }
  } catch (e) {
    rows.push({ venue, error: (e as Error).message });
  }
}
await writeFile(
  "docs/phase4/pool-fixture-validation.json",
  JSON.stringify(
    publicEvidence(
      rows.map((row) => ({
        ...row,
        scope:
          "Offline recorded-fixture quote regression. Local test clocks are reset; no current-chain freshness or paper eligibility asserted.",
      })),
    ),
    null,
    2,
  ) + "\n",
);
console.log(
  rows.map((r: any) => [r.venue, r.error ?? r.quoteError ?? "quoted"]),
);
