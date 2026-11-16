import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, initial, load } from "../src/store.js";
import { Engine, syntheticLaunch } from "../src/engine.js";
import { StrategySchema } from "../src/model.js";
import { Telemetry } from "../src/telemetry.js";
const config = StrategySchema.parse(
  JSON.parse(await readFile("config/strategy.json", "utf8")),
);
test("cached rows are deeply immutable, active positions remain isolated and generic transactions remain editable", async () => {
  const state = initial(config);
  state.running = true;
  const store = new Store(state);
  const engine = new Engine(store);
  await engine.ingest(syntheticLaunch(1));
  const before = store.state;
  assert.ok(Object.isFrozen(before.launches[0].reasons));
  await assert.rejects(
    store.paperTransaction((s) => {
      s.launches[0].reasons!.push("tamper");
    }),
  );
  assert.equal(store.state, before);
  await assert.rejects(
    store.paperTransaction((s) => {
      s.positions[0].quantity = 0;
      throw Error("rollback");
    }),
  );
  assert.equal(store.state.positions[0].quantity, before.positions[0].quantity);
  await store.transaction((s) => {
    s.launches[0].reasons!.push("generic edit");
  });
  assert.ok(store.state.launches[0].reasons!.includes("generic edit"));
});
test("cached row schemas reject new malformed records, numeric invalidity and bounds exactly as full state", async () => {
  const store = new Store(initial(config));
  await assert.rejects(
    store.paperTransaction((s) => {
      s.launches.push({ ...syntheticLaunch(), priceSol: NaN });
    }),
  );
  await assert.rejects(
    store.paperTransaction((s) => {
      s.balanceSol = -1;
    }),
  );
  await assert.rejects(
    store.paperTransaction((s) => {
      s.seen = Array(10001).fill("x");
    }),
  );
  assert.equal(store.state.balanceSol, 10);
});
test("Store admission is bounded and rejected work is explicit without poisoning FIFO", async () => {
  const metrics = new Telemetry();
  const store = new Store(initial(config), undefined, metrics, 2);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const a = store.transaction(async (s) => {
    await gate;
    s.balanceSol = 9;
  });
  const b = store.transaction((s) => {
    s.balanceSol -= 1;
  });
  await assert.rejects(
    store.transaction(() => {}),
    /capacity/,
  );
  release();
  await Promise.all([a, b]);
  assert.equal(store.state.balanceSol, 8);
  assert.equal(metrics.report().counters["store.rejected"], 1);
});
test("restart restores last acknowledged state and ignores orphan temporary writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-state2-"));
  const path = join(dir, "state.json");
  try {
    const store = await load(path, initial(config));
    await store.transaction((s) => {
      s.balanceSol = 9;
      s.running = true;
    });
    await writeFile(path + ".tmp", '{"corrupt":');
    const restored = await load(path, initial(config));
    assert.equal(restored.state.balanceSol, 9);
    assert.equal(restored.state.running, false);
    assert.equal(restored.state.mode, "paper");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("frozen outer rows with mutable nested arrays are recursively frozen before cache reuse", async () => {
  const store = new Store(initial(config));
  const reasons = ["original"];
  const row = Object.freeze({ ...syntheticLaunch(99), reasons });
  await store.paperTransaction((s) => {
    s.launches.push(row);
  });
  assert.ok(Object.isFrozen(reasons));
  assert.throws(() => reasons.push("tamper"));
});

test("accessor-backed histories are copied rather than trusted as immutable cached rows", async () => {
  let price = 0.1;
  const state = initial(config);
  state.launches = [
    {
      ...syntheticLaunch(1),
      get priceSol() {
        return price;
      },
    },
  ];
  const store = new Store(state);
  await store.paperTransaction(() => {});
  price = -100;
  assert.equal(store.state.launches[0].priceSol, 0.1);
});
test(
  "hard crash between paper commit and journal acknowledgement replays without duplicate positions",
  { timeout: 15000 },
  async () => {
    const { spawn } = await import("node:child_process");
    const { EventJournal, eventIdentity } = await import(
      "../src/event-journal.js"
    );
    const { EventIngestion } = await import("../src/ingestion.js");
    const dir = await mkdtemp(join(tmpdir(), "mintbot-hardcrash-"));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "tests/helpers/crash-worker.ts", dir],
      { cwd: process.cwd(), stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    let stderr = "";
    child.stderr?.on("data", (value) => (stderr += String(value)));
    try {
      await new Promise<void>((resolve, reject) => {
        child.once("message", () => resolve());
        child.once("exit", (code) =>
          reject(Error("Crash worker exited early " + code + stderr)),
        );
      });
      const exited = new Promise<void>((resolve) =>
        child.once("exit", () => resolve()),
      );
      child.kill("SIGKILL");
      await exited;
      const store = await load(join(dir, "state.json"), initial(config));
      assert.equal(store.state.trades.length, 1);
      const journal = new EventJournal({ path: join(dir, "work.wal") });
      const engine = new Engine(store);
      const pipeline = new EventIngestion({
        journal,
        strategy: async (observation) => {
          const launch = syntheticLaunch(1);
          launch.id = eventIdentity(observation);
          await engine.ingest(launch);
        },
      });
      await pipeline.drain();
      assert.equal(store.state.positions.length, 1);
      assert.equal(store.state.trades.length, 1);
      assert.equal(journal.pending.size, 0);
      assert.equal(journal.completed.size, 1);
      await pipeline.close();
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
      await rm(dir, { recursive: true, force: true });
    }
  },
);
