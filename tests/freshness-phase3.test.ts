import test from "node:test";
import assert from "node:assert/strict";
import { EventIngestion } from "../src/ingestion.js";
import { EventJournal } from "../src/event-journal.js";
import { freshnessReasons } from "../src/freshness.js";
import { Store, initial } from "../src/store.js";
import { Engine, syntheticLaunch } from "../src/engine.js";
import { StrategySchema } from "../src/model.js";
import { readFile } from "node:fs/promises";
const event = (id: number) => ({
  program: "pumpswap",
  signature: `fair-${id}`,
  slot: 1000 + id,
  observedAt: Date.now(),
  logs: [],
  failed: false,
});
test("weighted fairness gives live work prompt admission and eventual service to historical work", async () => {
  const order: string[] = [];
  const p = new EventIngestion({
    journal: new EventJournal(),
    capacity: 1,
    strategy: (e) => {
      order.push(e.signature);
    },
  });
  for (let i = 0; i < 100; i++) p.accept(event(i), "history");
  for (let i = 100; i < 120; i++) p.accept(event(i), "live");
  await p.drain();
  assert.equal(order.length, 120);
  assert.equal(order[0], "fair-100");
  assert.ok(order.indexOf("fair-0") <= 4);
  assert.ok(order.indexOf("fair-119") < 40);
  await p.close();
});
test("missing chain head/time and recovered launches cannot silently become fresh paper entries", async () => {
  const now = Date.now(),
    policy = {
      maxReceiptAgeMs: 5000,
      maxSlotLag: 8,
      allowHistorical: false,
      maxEventAgeMs: 10000,
    };
  assert.ok(
    freshnessReasons(
      { origin: "history", receiptAt: now, eventSlot: 10, chainHeadSlot: 10 },
      policy,
      now,
    ).includes("Historical or resumed launch"),
  );
  assert.ok(
    freshnessReasons(
      { origin: "live", receiptAt: now, eventSlot: 10, chainHeadSlot: null },
      policy,
      now,
    ).includes("Unknown or stale launch slot"),
  );
  assert.ok(
    freshnessReasons(
      { origin: "live", receiptAt: now, eventSlot: 10, chainHeadSlot: 10 },
      policy,
      now,
    ).includes("Unknown or stale chain event time"),
  );
  const config = StrategySchema.parse(
      JSON.parse(await readFile("config/strategy.json", "utf8")),
    ),
    state = initial(config);
  state.running = true;
  const engine = new Engine(new Store(state));
  const quote = {
    ...syntheticLaunch(1),
    freshness: {
      origin: "history" as const,
      receiptAt: now,
      eventSlot: 10,
      chainHeadSlot: 10,
    },
  };
  const result = await engine.ingest(quote);
  assert.ok(
    "reasons" in result &&
      result.reasons?.includes("Historical or resumed launch"),
  );
  assert.equal(engine.store.state.positions.length, 0);
});
test("fork or provider changes to an owned identity are explicit gaps and never second strategy callbacks", async () => {
  const j = new EventJournal();
  let calls = 0;
  const p = new EventIngestion({
    journal: j,
    strategy: () => {
      calls++;
    },
  });
  const original = event(1);
  p.accept(original);
  await p.drain();
  const moved = p.accept({ ...original, slot: original.slot + 1 }, "history");
  assert.equal(moved.reason, "fork-or-provider-conflict");
  const changed = p.accept({ ...original, failed: true }, "live");
  assert.equal(changed.reason, "fork-or-provider-conflict");
  await p.drain();
  assert.equal(calls, 1);
  assert.equal(j.gaps.get("pumpswap")!.reason, "fork-or-provider-conflict");
  await p.close();
});
