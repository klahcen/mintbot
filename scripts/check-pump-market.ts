import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { decodeVerifiedTransaction } from "../src/verified-decoders.js";
import { PumpMarketAdapter } from "../src/market/pump.js";
import { publicEvidence } from "../src/market/types.js";
const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const launch = decodeVerifiedTransaction(
  "pump",
  (await json("docs/phase3/fixtures/pump-creation.json")).result,
  await json("docs/phase3/fixtures/pump-accounts.json"),
)[0];
const fixture = await json("docs/phase4/fixtures/pump-market.json");
const rpc = {
  provider: fixture.provenance.provider,
  accounts: async () => ({
    ...fixture,
    provider: fixture.provenance.provider,
    retrievedAt: Date.now(),
    retrievedMono: performance.now(),
  }),
  largest: async () => ({ slot: fixture.contextSlot, amounts: [] }),
};
const adapter = new PumpMarketAdapter();
const state = await adapter.read(launch, rpc);
const buy = adapter.quote(state, "buy", 10000n, 100);
const sell = adapter.quote(state, "sell", buy.output, 100);
console.log(
  JSON.stringify(
    publicEvidence({
      scope:
        "Offline recorded-fixture quote regression. Local test clocks are reset; no current-chain freshness or paper eligibility asserted.",
      fixtureCapturedAt: fixture.provenance.capturedAt,
      state,
      buy,
      sell,
    }),
    null,
    2,
  ),
);
