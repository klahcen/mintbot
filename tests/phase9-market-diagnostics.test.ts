import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { PumpMarketAdapter, decodePump } from "../src/market/pump.js";
import { mint } from "../src/market/accounts.js";
import type { MarketReader, MarketBatch } from "../src/market/types.js";

test("All eight Phase8 decisions reproduce their actual state fields without relabeling protocol rejection as token risk", async () => {
  const original = JSON.parse(await readFile("docs/phase8/mainnet/evidence.json", "utf8"));
  let supply = 0, variants = 0, stale = 0;
  for (const review of original.ledger.marketReviews) {
    const launch = review.evidence.launch ?? review.evidence.state?.launch;
    const capture = original.captured.filter((c: any) => c.method === "market.getMultipleAccounts" && c.result.accounts?.[launch.address]).at(-1);
    if (!capture) {
      assert.deepEqual(review.reasons, ["Unknown or stale chain event time"]); stale++; continue;
    }
    const batch: MarketBatch = { ...capture.result, retrievedAt: Date.now(), retrievedMono: performance.now() };
    const curve = decodePump(batch, launch.address, "BondingCurve"), token = mint(batch, launch.mints[0]);
    assert.equal(token.decimals, 6);
    assert.equal(token.signals.transferRestrictions.status, "verified");
    const rpc: MarketReader = { provider: batch.provider, accounts: async () => structuredClone(batch), largest: async () => ({ slot: batch.contextSlot, amounts: [] }) };
    await assert.rejects(new PumpMarketAdapter().read(launch, rpc), (e: any) => {
      assert.equal(e.message, review.reasons[0]);
      if (e.marketFailure.kind === "identity-or-supply") {
        supply++;
        assert.equal(curve.is_mayhem_mode, true);
        assert.equal(e.marketFailure.creatorMatches, true);
        assert.equal(e.marketFailure.mintSupply, "2000000000000000");
        assert.equal(e.marketFailure.curveTotalSupply, "1000000000000000");
      } else {
        variants++;
        assert.equal(e.marketFailure.kind, "unsupported-variant");
        assert.notEqual(e.marketFailure.quoteMint, "11111111111111111111111111111111");
        assert.equal(e.marketFailure.complete, false);
      }
      return true;
    });
  }
  assert.deepEqual({ supply, variants, stale }, { supply: 4, variants: 2, stale: 2 });
});
