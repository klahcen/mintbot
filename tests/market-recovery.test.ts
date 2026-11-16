import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { MarketService } from "../src/market/service.js";
import {
  RealMarketPaper,
  initializeMarketLedger,
} from "../src/market/paper.js";
import { Store, initial } from "../src/store.js";
import { json, paperCase } from "./market-fixtures.js";
import { Telemetry } from "../src/telemetry.js";
async function engine() {
  return new RealMarketPaper(
    new Store(
      initializeMarketLedger(initial(await json("config/strategy.json"))),
    ),
  );
}
test("Deterministic market burst enforces bounded admission, queue metrics and fail-closed reviews", async () => {
  const c = await paperCase(),
    e = await engine(),
    m = new Telemetry();
  let release!: () => void;
  const barrier = new Promise<void>((r) => {
    release = r;
  });
  const service = new MarketService(
    e,
    {
      ...c.rpc,
      accounts: async (k, s) => {
        await barrier;
        return c.rpc.accounts(k, s);
      },
    },
    m,
  );
  const jobs = Array.from({ length: 64 }, (_, i) =>
    service.evaluate({ ...c.state.launch, id: `unit-burst-${i}` }),
  );
  const collected = Promise.allSettled(jobs);
  release();
  const results = await collected;
  assert.equal(results.filter((r) => r.status === "rejected").length, 32);
  assert.equal(e.store.state.positions.length, 0);
  assert.equal(m.report().gauges["market.pipeline.pending"].peak, 32);
  assert.equal(m.snapshot()["market.queue_backlog_age_ms"].count, 32);
  await service.close();
});
test("Duplicate verified market events perform no further RPC reads after a committed review", async () => {
  const c = await paperCase(),
    e = await engine();
  let calls = 0;
  const service = new MarketService(e, {
    ...c.rpc,
    accounts: async (k, s) => {
      calls++;
      return c.rpc.accounts(k, s);
    },
  });
  await service.evaluate(c.state.launch);
  const before = calls;
  assert.deepEqual(await service.evaluate(c.state.launch), { duplicate: true });
  assert.equal(calls, before);
  await service.close();
});
test("Conflicting account evidence at one finalized slot is rejected as a reorganized provider view", async () => {
  const c = await paperCase(),
    e = await engine();
  let changed = false;
  const service = new MarketService(e, {
    ...c.rpc,
    accounts: async (keys, min) => {
      const b = await c.rpc.accounts(keys, min);
      if (changed && b.accounts[c.launch.address]) {
        const a = b.accounts[c.launch.address]!;
        const bytes = Buffer.from(a.data[0], "base64");
        bytes.writeBigUInt64LE(bytes.readBigUInt64LE(16) + 1n, 16);
        a.data[0] = bytes.toString("base64");
      }
      return b;
    },
  });
  await service.evaluate(c.state.launch);
  changed = true;
  const l = { ...c.state.launch, id: "unit-conflict" };
  await service.evaluate(l);
  assert(
    e.store.state.marketReviews?.[0].reasons.some((r) =>
      r.includes("inconsistent provider"),
    ),
  );
  assert.equal(e.store.state.positions.length, 0);
  await service.close();
});
test("Repeated unavailable exits retain positions and trip the existing failure circuit", async () => {
  const c = await paperCase(),
    config = await json("config/strategy.json");
  Object.assign(config, { tradeSol: 0.00001, minLiquiditySol: 0 });
  const s = initializeMarketLedger(initial(config));
  s.running = true;
  const e = new RealMarketPaper(new Store(s));
  await e.review(c.state, c.buy, c.sell, c.fees, c.version);
  const id = e.store.state.positions[0].id;
  const service = new MarketService(e, {
    ...c.rpc,
    accounts: async () => {
      throw Error("Missing sell accounts");
    },
  });
  for (let i = 0; i < config.maxFailures; i++)
    await assert.rejects(service.exit(id), /Missing sell/);
  assert.equal(e.store.state.positions.length, 1);
  assert.equal(e.store.state.failures, config.maxFailures);
  assert.equal(e.store.state.running, false);
  await service.close();
});
test("Additional holder evidence at the same bank does not falsely imply a reorganization", async () => {
  const c = await paperCase(),
    e = await engine(),
    f = await json("docs/phase4/fixtures/pump-live-market.json");
  let enumerations = 0;
  const holders = Object.keys(f.accounts).filter(
    (k) =>
      k !== c.state.mint &&
      f.accounts[k]?.owner === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  );
  const reader = {
    provider: f.provider,
    accounts: async (keys: string[], _slot: number) => ({
      contextSlot: f.contextSlot,
      commitment: "finalized" as const,
      provider: f.provider,
      retrievedAt: Date.now(),
      retrievedMono: performance.now(),
      accounts: Object.fromEntries(
        keys.map((k) => [k, structuredClone(f.accounts[k]) ?? null]),
      ),
    }),
    largest: c.rpc.largest,
    holders: async () => {
      if (enumerations++ === 0)
        throw Error("Temporary enumeration unavailable");
      return holders;
    },
  };
  const service = new MarketService(e, reader),
    launch = {
      ...c.state.launch,
      slot: f.contextSlot,
      freshness: {
        ...c.state.launch.freshness!,
        eventSlot: f.contextSlot,
        chainHeadSlot: f.contextSlot,
      },
    };
  await service.evaluate({ ...launch, id: "unit-partial-holder-evidence" });
  await service.evaluate({ ...launch, id: "unit-complete-holder-evidence" });
  assert(
    !e.store.state.marketReviews![0].reasons.some((r) =>
      r.includes("inconsistent provider"),
    ),
  );
  assert.equal(e.store.state.positions.length, 0);
  await service.close();
});
