import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { StrategySchema } from "../src/model.js";
import { initial, Store } from "../src/store.js";
import { Engine, syntheticLaunch } from "../src/engine.js";
import { assess, decision, exitReason } from "../src/risk.js";
const config = StrategySchema.parse(
  JSON.parse(await readFile("config/strategy.json", "utf8")),
);
function setup() {
  const state = initial(config);
  state.running = true;
  const store = new Store(state);
  return { store, engine: new Engine(store) };
}
test("default startup is stopped paper trading", () => {
  assert.equal(initial(config).mode, "paper");
  assert.equal(initial(config).running, false);
});
test("safe fixture enters; duplicate event and concurrent event cannot double spend", async () => {
  const { store, engine } = setup();
  await Promise.all([
    engine.ingest(syntheticLaunch(1)),
    engine.ingest(syntheticLaunch(1)),
  ]);
  assert.equal(store.state.positions.length, 1);
  assert.equal(store.state.trades.length, 1);
  assert.ok(Math.abs(store.state.balanceSol - 9.89999) < 1e-9);
});
test("reserve, daily spend, max risk, kill, position limits reject", () => {
  const l = syntheticLaunch(1),
    s = initial(config);
  s.running = true;
  assert.deepEqual(decision(l, s, config), []);
  s.balanceSol = 1;
  assert.ok(decision(l, s, config).includes("Wallet reserve"));
  s.balanceSol = 10;
  s.dailySpendSol = 1;
  assert.ok(decision(l, s, config).includes("Daily spend"));
  s.dailySpendSol = 0;
  s.killed = true;
  assert.ok(decision(l, s, config).includes("Trading disabled"));
  l.freezeAuthority = null;
  l.restricted = null;
  assert.ok(assess(l).score > config.maxRiskScore);
});
test("stale and future prices never authorize entries", () => {
  const s = initial(config);
  s.running = true;
  const l = syntheticLaunch();
  l.priceAt = Date.now() - 60000;
  assert.ok(decision(l, s, config).includes("Invalid or stale price"));
  l.priceAt = Date.now() + 60000;
  assert.ok(decision(l, s, config).includes("Invalid or stale price"));
});
test("partial sell conserves allocated basis and nets all modeled costs", async () => {
  const { store, engine } = setup();
  await engine.ingest(syntheticLaunch(2));
  const id = store.state.positions[0].id;
  await engine.sell(id, 0.5);
  assert.equal(store.state.positions.length, 1);
  await engine.sell(id);
  assert.equal(store.state.positions.length, 0);
  assert.ok(
    Math.abs(store.state.balanceSol - (10 + store.state.realizedPnlSol)) < 1e-9,
  );
  assert.ok(store.state.realizedPnlSol < 0);
});
test("concurrent full exits create one sell", async () => {
  const { store, engine } = setup();
  await engine.ingest(syntheticLaunch(3));
  const id = store.state.positions[0].id;
  const results = await Promise.allSettled([engine.sell(id), engine.sell(id)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(store.state.trades.filter((t) => t.side === "sell").length, 1);
});
test("failed sells and missing liquidity increment failures, preserve position", async () => {
  const { store, engine } = setup();
  await engine.ingest(syntheticLaunch(4));
  await engine.mark("synthetic-mint-4", 0.0001, 0);
  assert.equal(store.state.positions.length, 1);
  assert.equal(store.state.failures, 1);
  assert.ok(
    store.state.alerts.some((a) => a.message.includes("Liquidity drop")),
  );
});
test("take profit, stop loss, trailing and time exits evaluate fresh marks only", async () => {
  const { store, engine } = setup();
  await engine.ingest(syntheticLaunch(5));
  const p = store.state.positions[0];
  assert.equal(
    exitReason({ ...p, priceSol: p.entryPriceSol * 2 }, config),
    "take-profit",
  );
  assert.equal(
    exitReason({ ...p, priceSol: p.entryPriceSol * 0.5 }, config),
    "stop-loss",
  );
  assert.equal(
    exitReason(
      {
        ...p,
        highPriceSol: p.entryPriceSol * 1.2,
        priceSol: p.entryPriceSol * 1.05,
      },
      config,
    ),
    "trailing-stop",
  );
  assert.equal(
    exitReason({ ...p, openedAt: Date.now() - config.maxHoldMs - 1 }, config),
    "time-exit",
  );
  assert.equal(exitReason({ ...p, priceAt: 0 }, config), null);
  await engine.mark(p.mint, p.entryPriceSol * 2, 100);
  assert.equal(store.state.positions.length, 0);
});
test("stale manual sells and fees exceeding proceeds reject without mutation", async () => {
  const { store, engine } = setup();
  await engine.ingest(syntheticLaunch(6));
  const id = store.state.positions[0].id;
  await store.transaction((s) => {
    s.positions[0].priceAt = 0;
  });
  await assert.rejects(engine.sell(id), /Stale/);
  await store.transaction((s) => {
    s.positions[0].priceAt = Date.now();
    s.positions[0].priceSol = 1e-15;
  });
  await assert.rejects(engine.sell(id), /Fees exceed/);
  assert.equal(store.state.positions.length, 1);
});
test("failed transaction rolls back entire mutation and queue remains usable", async () => {
  const { store } = setup();
  await assert.rejects(
    store.transaction((s) => {
      s.balanceSol = 0;
      throw Error("fault");
    }),
  );
  assert.equal(store.state.balanceSol, 10);
  await store.transaction((s) => {
    s.running = false;
  });
  assert.equal(store.state.running, false);
});

test("all strategy filters and mandatory unknown signals reject independently", () => {
  const state = initial(config);
  state.running = true;
  const l = syntheticLaunch(9);
  assert.ok(
    decision({ ...l, sellSimulation: null }, state, {
      ...config,
      maxRiskScore: 100,
    }).includes("Mandatory token safety"),
  );
  assert.ok(
    decision(l, state, { ...config, kind: "pool" }).includes("Event kind"),
  );
  assert.ok(
    decision(l, state, {
      ...config,
      kind: "momentum",
      minMomentumBps: 500,
    }).includes("Momentum"),
  );
  assert.ok(
    decision(l, state, { ...config, kind: "delayed", delayMs: 60000 }).includes(
      "Entry delay",
    ),
  );
  assert.ok(
    decision(l, state, { ...config, minLiquiditySol: 1000 }).includes(
      "Liquidity",
    ),
  );
  assert.ok(
    decision(l, state, { ...config, maxMarketCapSol: 100 }).includes(
      "Market cap",
    ),
  );
  assert.ok(
    decision(l, state, { ...config, minVolumeSol: 100 }).includes("Volume"),
  );
  assert.ok(
    decision(l, state, { ...config, creatorBlocklist: [l.creator] }).includes(
      "Creator policy",
    ),
  );
  assert.ok(
    decision(l, state, { ...config, creatorAllowlist: ["another"] }).includes(
      "Creator policy",
    ),
  );
  assert.ok(
    decision(l, state, { ...config, maxTradeSol: 0.01 }).includes(
      "Trade limit",
    ),
  );
});
test("position and failure caps remain enforced during concurrent entries", async () => {
  const { store, engine } = setup();
  await store.transaction((s) => {
    s.strategies[0].maxPositions = 1;
  });
  await Promise.all([
    engine.ingest(syntheticLaunch(10)),
    engine.ingest(syntheticLaunch(11)),
  ]);
  assert.equal(store.state.positions.length, 1);
  await store.transaction((s) => {
    s.failures = config.maxFailures;
  });
  const result = await engine.ingest(syntheticLaunch(12));
  assert.ok(
    "reasons" in result && result.reasons?.includes("Failure circuit breaker"),
  );
});
test("malformed internal events and restored state fail closed", async () => {
  const { store, engine } = setup();
  await assert.rejects(
    engine.ingest({ ...syntheticLaunch(15), liquiditySol: NaN }),
  );
  assert.equal(store.state.positions.length, 0);
  const { StateSchema } = await import("../src/model.js");
  assert.equal(
    StateSchema.safeParse({ ...store.state, strategies: [] }).success,
    false,
  );
});

test("delayed entries recheck current limits after delay and retain duplicate protection", async () => {
  const { store, engine } = setup();
  await store.transaction((s) => {
    s.strategies[0].kind = "delayed";
    s.strategies[0].delayMs = 1000;
  });
  await engine.ingest(syntheticLaunch(20));
  assert.equal(store.state.positions.length, 0);
  assert.equal(store.state.pendingLaunches.length, 1);
  await engine.ingest(syntheticLaunch(20));
  assert.equal(store.state.pendingLaunches.length, 1);
  await store.transaction((s) => {
    s.pendingLaunches[0].detectedAt -= 2000;
  });
  await engine.tick();
  assert.equal(store.state.positions.length, 1);
  assert.equal(store.state.pendingLaunches.length, 0);
});
test("stale delayed evidence rejects rather than inventing refreshed prices", async () => {
  const { store, engine } = setup();
  await store.transaction((s) => {
    s.strategies[0].delayMs = 1000;
  });
  await engine.ingest(syntheticLaunch(21));
  await store.transaction((s) => {
    s.pendingLaunches[0].detectedAt -= 2000;
    s.pendingLaunches[0].priceAt = 0;
  });
  await engine.tick();
  assert.equal(store.state.positions.length, 0);
  assert.equal(store.state.pendingLaunches.length, 0);
});
test("timer can enforce time exit with fresh stored evidence, stale prices still block", async () => {
  const { store, engine } = setup();
  await engine.ingest(syntheticLaunch(22));
  await store.transaction((s) => {
    s.positions[0].openedAt -= config.maxHoldMs + 1;
  });
  await engine.tick();
  assert.equal(store.state.positions.length, 0);
  assert.equal(store.state.trades[0].reason, "time-exit");
  await engine.ingest(syntheticLaunch(23));
  await store.transaction((s) => {
    s.positions[0].openedAt = 0;
    s.positions[0].priceAt = 0;
  });
  await engine.tick();
  assert.equal(store.state.positions.length, 1);
});
test("unexpected automatic exit costs preserve new observations and halt on failure threshold", async () => {
  const { store, engine } = setup();
  await engine.ingest(syntheticLaunch(24));
  await store.transaction((s) => {
    s.strategies[0].maxFailures = 1;
  });
  await engine.mark("synthetic-mint-24", 1e-15, 100);
  assert.equal(store.state.positions[0].priceSol, 1e-15);
  assert.equal(store.state.failures, 1);
  assert.equal(store.state.running, false);
});
