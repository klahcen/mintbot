import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, appendFile, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AsyncEventJournal } from "../src/async-journal.js";
import { EventJournal } from "../src/event-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import { Telemetry } from "../src/telemetry.js";
const event = (i: number) => ({
  program: "pumpswap",
  signature: `wal-${i}`,
  slot: 1000 + i,
  logs: [],
  failed: false,
  observedAt: Date.now(),
});
test("group acknowledgements follow fsync, duplicates await ownership and checkpoints preserve pending work", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-j3-"));
  const path = join(dir, "wal");
  let j: AsyncEventJournal | undefined;
  try {
    const metrics = new Telemetry();
    j = await AsyncEventJournal.open({ path, batchDelayMs: 10 }, metrics);
    assert.throws(() => j!.offer(event(0)), /offerDurable/);
    const tasks = Array.from({ length: 100 }, (_, i) =>
      j!.offerDurable(event(i)),
    );
    const duplicate = j.offerDurable(event(0));
    assert.equal(j.isOwned([...j.pending.keys()][0]!), false);
    const results = await Promise.all(tasks);
    assert.equal((await duplicate).status, "duplicate");
    assert.ok(results.every((r) => r.status === "accepted"));
    assert.equal(metrics.report().counters["journal.ownership_acks"], 100);
    assert.ok(metrics.report().counters["journal.fsync_batches"]! < 100);
    await Promise.all(
      results.slice(0, 50).map((r) => j!.completeDurable(r.id)),
    );
    await j.checkpoint();
    await j.shutdown();
    j = undefined;
    const restored = new EventJournal({ path });
    assert.equal(restored.pending.size, 50);
    assert.equal(restored.completed.size, 50);
    restored.close();
  } finally {
    await j?.shutdown();
    await rm(dir, { recursive: true, force: true });
  }
});
for (const point of ["write", "sync"] as const)
  test(`${point} ENOSPC failure never acknowledges ownership and surfaces durable failure`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "mintbot-full3-"));
    let j: AsyncEventJournal | undefined;
    try {
      j = await AsyncEventJournal.open({
        path: join(dir, "wal"),
        testFault: { point, afterBatches: 0, code: "ENOSPC" },
      });
      await assert.rejects(j.offerDurable(event(1)), /ENOSPC/);
      assert.equal(j.isOwned([...j.pending.keys()][0]!), false);
      await assert.rejects(j.flush());
      assert.match(j.status().writerFailure!, /ENOSPC/);
    } finally {
      await j?.shutdown().catch(() => {});
      await rm(dir, { recursive: true, force: true });
    }
  });
test("worker journal pipeline drains only fsynced ownership and bounded completion acknowledgements", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-ingest3-"));
  let p: EventIngestion | undefined;
  try {
    const journal = await AsyncEventJournal.open({ path: join(dir, "wal") });
    let calls = 0;
    p = new EventIngestion({
      journal,
      capacity: 16,
      strategy: () => {
        calls++;
      },
    });
    await Promise.all(
      Array.from({ length: 100 }, (_, i) => p!.acceptDurable(event(i))),
    );
    await p.drain();
    assert.equal(calls, 100);
    assert.equal(p.status().pending, 0);
    await p.close();
    p = undefined;
    const restored = new EventJournal({ path: join(dir, "wal") });
    assert.equal(restored.completed.size, 100);
    restored.close();
  } finally {
    await p?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test("complete WAL corruption fails closed; a truncated final record is discarded explicitly on restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-corrupt3-"));
  const path = join(dir, "wal");
  try {
    const j = await AsyncEventJournal.open({ path });
    await j.offerDurable(event(1));
    await j.shutdown();
    const valid = await readFile(path);
    await appendFile(path, '{"kind":"put"');
    const r = await AsyncEventJournal.open({ path });
    assert.equal(r.pending.size, 1);
    await r.shutdown();
    await writeFile(
      path,
      Buffer.concat([valid, Buffer.from('{"invalid":true}\n')]),
    );
    await assert.rejects(AsyncEventJournal.open({ path }), /journal record/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test(
  "SIGKILL after worker ownership and paper commit replays once without a second purchase or fee",
  { timeout: 20000 },
  async () => {
    const { spawn } = await import("node:child_process");
    const { load, initial } = await import("../src/store.js");
    const { Engine, syntheticLaunch } = await import("../src/engine.js");
    const { StrategySchema } = await import("../src/model.js");
    const dir = await mkdtemp(join(tmpdir(), "mintbot-kill3-"));
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "tests/helpers/async-crash-worker.ts", dir],
      { stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    let stderr = "";
    child.stderr!.on("data", (b) => {
      stderr += b;
    });
    try {
      await new Promise<void>((resolve, reject) => {
        child.once("message", () => resolve());
        child.once("exit", () =>
          reject(Error("Crash fixture exited early: " + stderr)),
        );
      });
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGKILL");
      await exited;
      const config = StrategySchema.parse(
          JSON.parse(await readFile("config/strategy.json", "utf8")),
        ),
        store = await load(join(dir, "state.json"), initial(config));
      const before = store.state.balanceSol;
      const journal = await AsyncEventJournal.open({ path: join(dir, "wal") });
      const p = new EventIngestion({
        journal,
        strategy: async (_e, _l, id) => {
          const q = syntheticLaunch(777);
          q.id = id;
          await new Engine(store).ingest(q);
        },
      });
      await p.drain();
      assert.equal(store.state.positions.length, 1);
      assert.equal(store.state.trades.length, 1);
      assert.equal(store.state.balanceSol, before);
      assert.equal(journal.pending.size, 0);
      await p.close();
    } finally {
      child.kill("SIGKILL");
      await rm(dir, { recursive: true, force: true });
    }
  },
);
test("checksummed records detect otherwise valid JSON corruption", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-checksum3-")),
    path = join(dir, "wal");
  try {
    const j = await AsyncEventJournal.open({ path });
    await j.offerDurable(event(123));
    await j.shutdown();
    const raw = await readFile(path, "utf8");
    await writeFile(path, raw.replace("wal-123", "wal-124"));
    await assert.rejects(AsyncEventJournal.open({ path }), /checksum/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("bounded unacknowledged admission and duplicate worker responses preserve exactly one ownership acknowledgement", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-ack3-"));
  let j: AsyncEventJournal | undefined;
  try {
    const metrics = new Telemetry();
    j = await AsyncEventJournal.open(
      {
        path: join(dir, "wal"),
        maxUnacked: 8,
        batchDelayMs: 20,
        testDuplicateAcks: true,
      },
      metrics,
    );
    const offered = Array.from({ length: 20 }, (_, i) =>
      j!.offerDurable(event(i)),
    );
    const duplicate = j.offerDurable(event(0));
    const result = await Promise.all(offered);
    assert.equal((await duplicate).status, "duplicate");
    assert.equal(result.filter((r) => r.status === "accepted").length, 6);
    assert.equal(result.filter((r) => r.status === "full").length, 14);
    await j.flush();
    assert.equal(metrics.report().counters["journal.ownership_acks"], 6);
    assert.equal(metrics.report().gauges["journal.unacked"]!.current, 0);
    assert.ok(metrics.report().gauges["journal.unacked"]!.peak <= 8);
  } finally {
    await j?.shutdown();
    await rm(dir, { recursive: true, force: true });
  }
});
