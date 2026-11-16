import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { Store, initial, load } from "../src/store.js";
import { Engine } from "../src/engine.js";
import {
  RealMarketPaper,
  initializeMarketLedger,
} from "../src/market/paper.js";
import { marketRisk } from "../src/market/risk.js";
import { MarketService } from "../src/market/service.js";
import { unknown, verified, failed } from "../src/market/types.js";
import { json, paperCase } from "./market-fixtures.js";
async function setup(path?: string) {
  const config = await json("config/strategy.json");
  Object.assign(config, { tradeSol: 0.00001, minLiquiditySol: 0 });
  const s = initializeMarketLedger(initial(config));
  s.running = true;
  return new RealMarketPaper(new Store(s, path, undefined, 1024, true));
}
test("Real-market paper commits exact integer fills, conservative slippage and network costs (unit safety stubs)", async () => {
  const c = await paperCase(),
    e = await setup();
  const r = await e.review(c.state, c.buy, c.sell, c.fees, c.version);
  assert("positionId" in r);
  const p = e.store.state.positions[0];
  assert.equal(p.market?.atoms, c.buy.minimumOutput.toString());
  assert.equal(e.store.state.marketLedger?.balanceLamports, "9999985000");
  assert.equal(e.store.state.trades[0].market?.inputAtoms, "10000");
  assert.equal(e.store.state.marketReviews?.[0].reasons.length, 0);
  assert(p.source.startsWith("real-market-paper:"));
});
test("Real-market duplicate decisions survive durable store reload without a second fill", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-market-paper-"));
  try {
    const c = await paperCase(),
      e = await setup(join(dir, "state.json"));
    await e.review(c.state, c.buy, c.sell, c.fees, c.version);
    const restored = new RealMarketPaper(
      await load(join(dir, "state.json"), e.store.state, undefined, true),
    );
    assert.deepEqual(
      await restored.review(c.state, c.buy, c.sell, c.fees, c.version),
      { duplicate: true },
    );
    assert.equal(restored.store.state.positions.length, 1);
    assert.equal(restored.store.state.running, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("Unknown and stale mandatory evidence cannot create paper positions", async () => {
  for (const name of [
    "mintAuthority",
    "freezeAuthority",
    "transferRestrictions",
    "holderConcentration",
  ]) {
    const c = await paperCase();
    c.state.signals[name] = unknown("Unit missing evidence");
    const e = await setup();
    const r = await e.review(c.state, c.buy, c.sell, c.fees, c.version);
    assert("reasons" in r && r.reasons!.some((x) => x.includes(name)));
    assert.equal(e.store.state.positions.length, 0);
  }
  const c = await paperCase();
  c.state.retrievedMono = performance.now() - 1600;
  const risk = marketRisk(c.state, c.buy, c.sell, c.fees, c.version);
  assert.equal(risk.signals.quoteFreshness.status, "stale");
  assert.equal(risk.eligible, false);
});
test("Verified status cannot disguise unsafe authority values or invalid concentration", async () => {
  const c = await paperCase();
  c.state.signals.mintAuthority = verified(true, "Enabled authority");
  c.state.signals.holderConcentration = verified(
    {},
    "Missing owner concentration",
  );
  assert.equal(
    marketRisk(c.state, c.buy, c.sell, c.fees, c.version).eligible,
    false,
  );
});
test("Synthetic marking, synthetic sells and timer exits cannot fill market-backed positions", async () => {
  const c = await paperCase(),
    e = await setup();
  await e.review(c.state, c.buy, c.sell, c.fees, c.version);
  const p = e.store.state.positions[0];
  const synthetic = new Engine(e.store);
  await assert.rejects(synthetic.mark(p.mint, 1, 100), /account-state/);
  await assert.rejects(synthetic.sell(p.id), /validated sell/);
  await synthetic.tick();
  assert.equal(e.store.state.positions.length, 1);
  assert.equal(e.store.state.trades.length, 1);
});
test("Real-market exit uses fresh sell amounts and exact integer realized PNL", async () => {
  const c = await paperCase(),
    e = await setup();
  await e.review(c.state, c.buy, c.sell, c.fees, c.version);
  const p = e.store.state.positions[0];
  const quote = c.adapter.quote(c.state, "sell", BigInt(p.market!.atoms), 100);
  const r = await e.exit(p.id, c.state, quote, c.fees, c.version);
  const net = quote.minimumOutput - 5000n;
  assert("pnlLamports" in r);
  assert.equal(r.pnlLamports, (net - 15000n).toString());
  assert.equal(
    e.store.state.marketLedger?.balanceLamports,
    (10000000000n - 15000n + net).toString(),
  );
  assert.equal(e.store.state.positions.length, 0);
});
test("Expired quotes and failed sell safety retain the entire position", async () => {
  const c = await paperCase(),
    e = await setup();
  await e.review(c.state, c.buy, c.sell, c.fees, c.version);
  const p = e.store.state.positions[0];
  const quote = c.adapter.quote(c.state, "sell", BigInt(p.market!.atoms), 100);
  quote.expiresMono = 0;
  await assert.rejects(
    e.exit(p.id, c.state, quote, c.fees, c.version),
    /Stale quote/,
  );
  quote.expiresMono = performance.now() + 1000;
  await assert.rejects(
    e.exit(p.id, c.state, quote, c.fees, failed("Upgrade")),
    /safety/,
  );
  assert.equal(e.store.state.positions.length, 1);
  assert.equal(e.store.state.trades.length, 1);
});
test("Kill switch and exact reserve limits block market fills", async () => {
  const c = await paperCase(),
    e = await setup();
  e.store.state.killed = true;
  await e.review(c.state, c.buy, c.sell, c.fees, c.version);
  assert.equal(e.store.state.positions.length, 0);
  const e2 = await setup();
  e2.store.state.strategies[0].reserveSol = 10;
  await e2.review(
    { ...c.state, launch: { ...c.state.launch, id: "unit-reserve" } },
    c.buy,
    c.sell,
    c.fees,
    c.version,
  );
  assert.equal(e2.store.state.positions.length, 0);
});
test("Historical/restarted events never enter the fast-launch market path or request RPC", async () => {
  const c = await paperCase(),
    e = await setup();
  let calls = 0;
  const rpc = {
    ...c.rpc,
    accounts: async () => {
      calls++;
      throw Error("Must not query");
    },
  };
  const service = new MarketService(e, rpc);
  for (const origin of ["history", "restart"] as const) {
    const l = structuredClone(c.state.launch);
    l.id = `unit-${origin}`;
    l.freshness!.origin = origin;
    await service.evaluate(l);
  }
  assert.equal(calls, 0);
  assert.equal(e.store.state.positions.length, 0);
  assert.equal(e.store.state.marketReviews?.length, 2);
  await service.close();
});
test("Market pipeline records unavailable routes without synthetic fallback", async () => {
  const c = await paperCase(),
    e = await setup();
  const service = new MarketService(e, {
    ...c.rpc,
    accounts: async () => {
      throw Error("RPC timeout");
    },
  });
  await service.evaluate(c.state.launch);
  assert.equal(e.store.state.positions.length, 0);
  assert(
    e.store.state.marketReviews?.[0].reasons.some((r) => r.includes("timeout")),
  );
  await service.close();
});
test("Fee expiry, volume and momentum unknowns fail closed", async () => {
  const c = await paperCase(),
    e = await setup();
  e.store.state.strategies[0].minVolumeSol = 1;
  const fees = structuredClone(c.fees);
  fees.value!.observedAt = Date.now() - 6000;
  const r = await e.review(c.state, c.buy, c.sell, fees, c.version);
  assert(
    "reasons" in r &&
      r.reasons!.some((r) => r.includes("volume")) &&
      r.reasons!.some((r) => r.includes("fee")),
  );
  assert.equal(e.store.state.positions.length, 0);
});
