import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Connection } from "@solana/web3.js";
import { Histograms, Telemetry } from "../src/telemetry.js";
import { MeasuredQueue } from "../src/queue.js";
import { Store, initial } from "../src/store.js";
import { Engine, syntheticLaunch } from "../src/engine.js";
import { StrategySchema } from "../src/model.js";
import {
  SolanaMonitor,
  VERIFIED_PROGRAMS,
  decodeLaunch,
  inspectTransaction,
} from "../src/chain.js";
import {
  FakeSocket,
  ManualScheduler,
  notification,
  open,
} from "./helpers/fakes.js";
import { pumpLogs } from "../scripts/benchmark-fixtures.js";
const config = StrategySchema.parse(
  JSON.parse(await readFile("config/strategy.json", "utf8")),
);

test("bounded histograms preserve lifetime counts and expose retained sample percentiles", () => {
  const h = new Histograms(3);
  for (const n of [10, 20, 30, 40, 50]) h.observe("ms", n);
  h.observe("ms", NaN);
  h.observe("ms", -1);
  assert.deepEqual(h.snapshot().ms, {
    count: 5,
    samples: 3,
    p50: 40,
    p95: 40,
    p99: 40,
    max: 50,
  });
  assert.throws(() => new Histograms(0));
});
test("duration clocks remain monotonic when wall time moves backwards; spans close once on error", () => {
  const clock = new ManualScheduler();
  const metrics = new Telemetry({ clock: clock.now });
  const original = Date.now;
  try {
    Date.now = () => 10000;
    const end = metrics.start("duration_ms");
    clock.advance(7);
    Date.now = () => 1;
    end();
    end();
    assert.equal(metrics.snapshot().duration_ms.count, 1);
    assert.equal(metrics.snapshot().duration_ms.p50, 7);
    assert.throws(() =>
      metrics.measure("failed_ms", () => {
        clock.advance(3);
        throw Error("fault");
      }),
    );
    assert.equal(metrics.snapshot().failed_ms.p50, 3);
  } finally {
    Date.now = original;
  }
});
test("async failures retain timing and RPC errors are counted exactly once per failed call", async () => {
  const clock = new ManualScheduler();
  const metrics = new Telemetry({ clock: clock.now });
  await assert.rejects(
    metrics.rpc("fixture", async () => {
      clock.advance(4);
      throw Error("disconnect");
    }),
  );
  assert.equal(metrics.report().counters["rpc.errors"], 1);
  assert.equal(metrics.snapshot()["rpc.fixture_ms"].p50, 4);
  const connection = {
    getParsedTransaction: async () => {
      throw Error("mock RPC");
    },
  } as unknown as Pick<Connection, "getParsedTransaction">;
  await assert.rejects(inspectTransaction(connection, "fixture", metrics));
  assert.equal(metrics.report().counters["rpc.errors"], 2);
});
test("disabled telemetry preserves return values and errors without retaining samples", async () => {
  const metrics = new Telemetry({ enabled: false });
  assert.equal(
    metrics.measure("span", () => 42),
    42,
  );
  await assert.rejects(
    metrics.measureAsync("span", async () => {
      throw Error("fault");
    }),
  );
  metrics.increment("counter");
  metrics.adjustGauge("gauge", 1);
  assert.deepEqual(metrics.report().counters, {});
  assert.deepEqual(metrics.snapshot(), {});
});
test("deterministic burst bounds pending work, preserves FIFO, records drops and drains gauges", async () => {
  const clock = new ManualScheduler();
  const metrics = new Telemetry({ clock: clock.now });
  const queue = new MeasuredQueue(3, metrics, "burst");
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const order: number[] = [];
  const first = queue.submit(async () => {
    await gate;
    order.push(1);
  });
  const second = queue.submit(() => {
    order.push(2);
  });
  const third = queue.submit(() => {
    order.push(3);
  });
  assert.deepEqual(
    await queue.submit(() => {
      order.push(4);
    }),
    { accepted: false, reason: "capacity" },
  );
  await Promise.resolve();
  assert.equal(metrics.report().gauges["burst.pending"].current, 3);
  clock.advance(10);
  release();
  await Promise.all([first, second, third]);
  await queue.drain();
  assert.deepEqual(order, [1, 2, 3]);
  const report = metrics.report();
  assert.equal(report.counters["burst.offered"], 4);
  assert.equal(report.counters["burst.completed"], 3);
  assert.equal(report.counters["burst.dropped"], 1);
  assert.equal(report.gauges["burst.pending"].peak, 3);
  assert.equal(report.gauges["burst.pending"].current, 0);
  assert.equal(report.gauges["burst.queue_depth"].current, 0);
  assert.equal(report.gauges["burst.in_flight"].current, 0);
  assert.equal(report.histograms["burst.end_to_end_ms"].samples, 3);
});
test("queue fault and shutdown do not poison later accepted work or count failures as drops", async () => {
  const metrics = new Telemetry();
  const queue = new MeasuredQueue(2, metrics, "fault");
  const first = queue.submit(() => {
    throw Error("injected");
  });
  const next = queue.submit(() => 7);
  await assert.rejects(first);
  assert.deepEqual(await next, { accepted: true, value: 7 });
  queue.close();
  assert.deepEqual(await queue.submit(() => 8), {
    accepted: false,
    reason: "closed",
  });
  await queue.drain();
  assert.equal(metrics.report().counters["fault.errors"], 1);
  assert.equal(metrics.report().counters["fault.dropped"], 1);
  assert.equal(metrics.report().counters["fault.completed"], 1);
  assert.equal(metrics.report().gauges["fault.pending"].current, 0);
});
test("deterministic reconnect retains dedupe window and ignores superseded sockets", () => {
  const clock = new ManualScheduler();
  const metrics = new Telemetry({ clock: clock.now });
  const sockets: FakeSocket[] = [];
  const events: string[] = [];
  const monitor = new SolanaMonitor(
    "ws://fixture.invalid",
    [VERIFIED_PROGRAMS[0]!],
    (event) => {
      events.push(event.signature);
      assert.equal(JSON.stringify(event).includes("receivedAtMonoMs"), false);
      assert.equal(typeof event.receivedAtMonoMs, "number");
    },
    {
      telemetry: metrics,
      scheduler: clock,
      maxReconnects: 1,
      reconnectBaseMs: 10,
    },
    () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    },
  );
  monitor.start();
  open(sockets[0]);
  sockets[0].emit("message", notification("a"));
  sockets[0].close();
  clock.advance(9);
  assert.equal(sockets.length, 1);
  clock.advance(1);
  assert.equal(sockets.length, 2);
  open(sockets[1]);
  sockets[1].emit("message", notification("a"));
  sockets[1].emit("message", notification("b"));
  sockets[0].emit("message", notification("late"));
  assert.deepEqual(events, ["a", "b"]);
  assert.equal(metrics.report().counters["observations.duplicates"], 1);
  assert.equal(metrics.snapshot()["rpc.recovery_ms"].p50, 10);
  assert.equal(metrics.report().counters["rpc.reconnect_succeeded"], 1);
  sockets[1].emit("error", Error("transport"));
  assert.equal(metrics.report().counters["rpc.errors"], 1);
  assert.equal(metrics.report().counters["rpc.reconnect_exhausted"], 1);
  assert.equal(clock.pending, 0);
  monitor.stop();
});
test("stop cancels scheduled reconnect without sleeps or new socket generations", () => {
  const clock = new ManualScheduler();
  const sockets: FakeSocket[] = [];
  const monitor = new SolanaMonitor(
    "ws://fixture.invalid",
    [],
    () => {},
    { scheduler: clock, reconnectBaseMs: 10 },
    () => {
      const s = new FakeSocket();
      sockets.push(s);
      return s;
    },
  );
  monitor.start();
  sockets[0].close();
  assert.equal(clock.pending, 1);
  monitor.stop();
  clock.advance(100);
  assert.equal(sockets.length, 1);
  assert.equal(clock.pending, 0);
});
test("bounded dedupe eviction is explicit and is not reported as a dropped event", () => {
  const metrics = new Telemetry();
  const socket = new FakeSocket();
  const events: string[] = [];
  const monitor = new SolanaMonitor(
    "ws://fixture.invalid",
    [VERIFIED_PROGRAMS[0]!],
    (event) => events.push(event.signature),
    { telemetry: metrics, dedupeLimit: 2 },
    () => socket,
  );
  monitor.start();
  open(socket);
  for (const id of ["a", "b", "a", "c", "a"])
    socket.emit("message", notification(id));
  monitor.stop();
  assert.deepEqual(events, ["a", "b", "c", "a"]);
  assert.equal(metrics.report().counters["observations.duplicates"], 1);
  assert.equal(metrics.report().counters["monitor.dedupe_evictions"], 2);
  assert.equal(metrics.report().counters["rpc.errors"] ?? 0, 0);
});
test("malformed messages and callback failures remain distinct from transport RPC failures", () => {
  const metrics = new Telemetry();
  const socket = new FakeSocket();
  const monitor = new SolanaMonitor(
    "ws://fixture.invalid",
    [VERIFIED_PROGRAMS[0]!],
    () => {
      throw Error("consumer");
    },
    { telemetry: metrics },
    () => socket,
  );
  monitor.start();
  open(socket);
  socket.emit("message", "{");
  socket.emit("message", notification("a"));
  monitor.stop();
  assert.equal(metrics.report().counters["monitor.message_errors"], 2);
  assert.equal(metrics.report().counters["observations.handler_errors"], 1);
  assert.equal(metrics.report().counters["rpc.errors"] ?? 0, 0);
});
test("decoder success and rejection each close their latency span", () => {
  const metrics = new Telemetry();
  const observation = {
    program: "pump",
    signature: "fixture",
    slot: 1,
    observedAt: 1,
    failed: false,
    logs: pumpLogs(VERIFIED_PROGRAMS[0]!.address),
  };
  assert.equal(decodeLaunch(observation, metrics).length, 1);
  assert.throws(() => decodeLaunch({ ...observation, failed: true }, metrics));
  assert.equal(metrics.snapshot().decoding_ms.count, 2);
  assert.equal(metrics.report().counters["decoding.errors"], 1);
});
test("paper pipeline exposes all stages, duplicate path skips risk and balances remain correct", async () => {
  const metrics = new Telemetry();
  const state = initial(config);
  state.running = true;
  const store = new Store(state, undefined, metrics);
  const engine = new Engine(store, metrics);
  await Promise.all([
    engine.ingest(syntheticLaunch(100)),
    engine.ingest(syntheticLaunch(100)),
  ]);
  const report = metrics.report();
  for (const name of [
    "ingestion_ms",
    "ingestion.validation_ms",
    "engine.deduplication_ms",
    "risk_evaluation_ms",
    "strategy_decision_ms",
    "paper_execution_ms",
    "store.queue_wait_ms",
    "store.transaction_ms",
  ])
    assert.ok(report.histograms[name].count > 0, name);
  assert.equal(report.counters["engine.duplicates"], 1);
  assert.equal(report.histograms.risk_evaluation_ms.count, 2);
  assert.equal(report.histograms.strategy_decision_ms.count, 1);
  assert.equal(report.counters["ingestion.buys_committed"], 1);
  assert.equal(store.state.positions.length, 1);
  assert.ok(Math.abs(store.state.balanceSol - 9.89999) < 1e-9);
  assert.equal(report.gauges["store.queue_depth"].current, 0);
  await assert.rejects(
    store.transaction(() => {
      throw Error("fault");
    }),
  );
  await store.transaction(() => {});
  assert.equal(metrics.report().counters["store.errors"], 1);
  assert.equal(metrics.report().gauges["store.in_flight"].current, 0);
});

test("delayed-entry retention drops are counted without changing its existing bound", async () => {
  const metrics = new Telemetry();
  const state = initial({ ...config, delayMs: 60000, maxPriceAgeMs: 120000 });
  state.running = true;
  const engine = new Engine(new Store(state, undefined, metrics), metrics);
  for (let i = 0; i < 201; i++) await engine.ingest(syntheticLaunch(i));
  assert.equal(engine.store.state.pendingLaunches.length, 200);
  assert.equal(engine.store.state.pendingLaunches[0].id, "synthetic-1");
  assert.equal(metrics.report().counters["strategy.pending_dropped"], 1);
  assert.equal(engine.store.state.positions.length, 0);
});
test("failed subscription writes count one transport error and exhaust a zero reconnect budget", () => {
  const clock = new ManualScheduler();
  const metrics = new Telemetry({ clock: clock.now });
  const socket = new FakeSocket();
  socket.send = () => {
    throw Error("write failed");
  };
  const monitor = new SolanaMonitor(
    "ws://fixture.invalid",
    [VERIFIED_PROGRAMS[0]!],
    () => {},
    { telemetry: metrics, scheduler: clock, maxReconnects: 0 },
    () => socket,
  );
  monitor.start();
  assert.doesNotThrow(() => socket.emit("open"));
  assert.equal(metrics.report().counters["rpc.errors"], 1);
  assert.equal(metrics.report().counters["rpc.reconnect_exhausted"], 1);
  assert.equal(clock.pending, 0);
  monitor.stop();
});
test("offline replay benchmark emits complete and conserved deterministic workload counts", async () => {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "tsx",
      "scripts/replay.ts",
      "--benchmark",
      "--events",
      "32",
      "--runs",
      "1",
    ],
    {
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, MONITOR_PROGRAMS: "" },
    },
  );
  const report = JSON.parse(stdout);
  assert.equal(report.results.length, 3);
  assert.deepEqual(
    report.results.map((r: any) => [
      r.completed,
      r.duplicates,
      r.dropped,
      r.rpcErrors,
    ]),
    [
      [32, 0, 0, 2],
      [24, 8, 0, 2],
      [24, 9, 0, 3],
    ],
  );
  for (const result of report.results) {
    assert.equal(
      result.conservation.offeredEqualsCompletedDuplicatesDropped,
      true,
    );
    assert.ok(result.completedEventsPerSecond > 0);
    assert.equal(result.queue["replay.pending"].current, 0);
    assert.ok(result.latencies["replay.end_to_end_ms"].p99 >= 0);
    assert.equal(result.internal.counters["rpc.errors"], result.rpcErrors);
    assert.equal(result.internalInstrumentationAvailable, true);
  }
});
