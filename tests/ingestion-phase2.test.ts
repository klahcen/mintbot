import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, appendFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventJournal, eventIdentity } from "../src/event-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import {
  recoverGap,
  RecoveryRpcError,
  type RecoveryRpc,
  type SignatureInfo,
} from "../src/backfill.js";
import { VERIFIED_PROGRAMS, type ProgramObservation } from "../src/chain.js";
import { pumpLogs } from "../scripts/benchmark-fixtures.js";
import { Telemetry } from "../src/telemetry.js";
import { BoundedStage } from "../src/stages.js";
import { Engine, syntheticLaunch } from "../src/engine.js";
import { Store, initial } from "../src/store.js";
import { StrategySchema } from "../src/model.js";
const event = (
  signature: string,
  slot = 100,
  program = "pumpswap",
): ProgramObservation => ({
  program,
  signature,
  slot,
  logs: program === "pump" ? pumpLogs(VERIFIED_PROGRAMS[0]!.address) : [],
  failed: false,
  observedAt: Date.now(),
});
const config = StrategySchema.parse(
  JSON.parse(await readFile("config/strategy.json", "utf8")),
);
test("1000-event duplicate burst, provider overlap and out-of-order slots process once with bounded concurrent stages", async () => {
  const m = new Telemetry();
  const journal = new EventJournal({ maxPending: 1000 });
  const state = initial(config);
  state.running = true;
  const engine = new Engine(new Store(state, undefined, m));
  const calls = new Map<string, number>();
  let active = 0,
    peak = 0;
  const pipeline = new EventIngestion({
    journal,
    metrics: m,
    capacity: 16,
    enrichmentConcurrency: 4,
    enrich: async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setImmediate(r));
      active--;
    },
    strategy: async (o, _l, id) => {
      calls.set(id, (calls.get(id) ?? 0) + 1);
      const fixture = syntheticLaunch(Number(o.signature));
      fixture.id = id;
      await engine.ingest(fixture);
    },
  });
  for (let n = 0; n < 1000; n++) {
    const id = Math.floor(n / 2);
    pipeline.accept(event(String(id), 1000 - id), n % 2 ? "history" : "live");
  }
  await pipeline.drain();
  assert.equal(calls.size, 500);
  assert.ok([...calls.values()].every((v) => v === 1));
  assert.equal(m.report().counters["ingest.duplicates"], 500);
  assert.equal(m.report().counters["ingest.completed"], 500);
  assert.ok(m.report().gauges["ingest.in_flight"].peak <= 16);
  assert.ok(peak > 1 && peak <= 4);
  assert.equal(journal.pending.size, 0);
  assert.equal(engine.store.state.positions.length, 5);
  assert.equal(
    new Set(engine.store.state.positions.map((p) => p.mint)).size,
    5,
  );
  await pipeline.close();
});
test("saturation persists deferred work, exposes rejected unpersistable offers and recovers the pending WAL after restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-wal-"));
  const path = join(dir, "work.wal");
  try {
    const j = new EventJournal({ path, maxPending: 3, maxCompleted: 3 });
    const offered = [0, 1, 2].map((n) => j.offer(event(String(n), 100 + n)));
    assert.ok(offered.every((r) => r.status === "accepted"));
    assert.equal(j.offer(event("overflow", 104)).status, "full");
    j.recordGap(
      "pumpswap",
      99,
      104,
      "journal-capacity",
      j.anchors.get("pumpswap"),
      1,
    );
    j.close();
    await appendFile(path, '{"kind":"put","truncated":');
    let callbacks = 0;
    const restored = new EventJournal({ path, maxPending: 3, maxCompleted: 3 });
    const pipeline = new EventIngestion({
      journal: restored,
      capacity: 1,
      strategy: () => {
        callbacks++;
      },
    });
    await pipeline.drain();
    assert.equal(callbacks, 3);
    assert.equal(restored.gaps.get("pumpswap")!.knownRefused, 1);
    assert.equal(
      pipeline.accept(event("0", 100), "history").status,
      "duplicate",
    );
    await pipeline.close();
    const again = new EventJournal({ path, maxPending: 3, maxCompleted: 3 });
    assert.equal(again.pending.size, 0);
    assert.equal(again.completed.size, 3);
    again.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("dedupe eviction rejects too-old unknown work explicitly rather than double processing", async () => {
  const j = new EventJournal({ maxCompleted: 2 });
  const p = new EventIngestion({ journal: j });
  for (let n = 1; n <= 3; n++) {
    p.accept(event(String(n), n));
    await p.drain();
  }
  assert.equal(p.accept(event("1", 1), "history").status, "unrecoverable");
  assert.equal(j.gaps.get("pumpswap")!.reason, "outside-dedupe-window");
  assert.equal(j.completed.size, 2);
  await p.close();
});
test("malformed receipt does not poison healthy ingestion and permanent decode failures are quarantined", async () => {
  const j = new EventJournal();
  const p = new EventIngestion({ journal: j, maxAttempts: 1 });
  assert.equal(
    p.accept({ ...event("bad"), slot: NaN }).status,
    "unrecoverable",
  );
  assert.equal(p.status().fatal, null);
  p.accept(event("ok"));
  p.accept({
    ...event("malformed", 101, "pump"),
    logs: ["Program bad invoke [2]"],
  });
  await p.drain();
  assert.equal(j.pending.size, 1);
  assert.equal(p.status().quarantined, 1);
  assert.ok(j.completed.has(eventIdentity(event("ok"))));
  await p.close();
});
function fixtureRpc(
  rows: SignatureInfo[],
  missing = new Set<string>(),
): RecoveryRpc {
  return {
    getSlot: async () => 120,
    getSignaturesForAddress: async (_address, options) => {
      const start = options.before
        ? rows.findIndex((r) => r.signature === options.before) + 1
        : 0;
      return rows.slice(start, start + options.limit);
    },
    getTransaction: async (signature) => {
      if (missing.has(signature)) return null;
      const row = rows.find((r) => r.signature === signature)!;
      return {
        slot: row.slot,
        meta: {
          err: null,
          logMessages: pumpLogs(VERIFIED_PROGRAMS[0]!.address),
        },
        transaction: {
          signatures: [signature],
          message: { accountKeys: [VERIFIED_PROGRAMS[0]!.address] },
        },
      };
    },
  };
}
const rows = [
  { signature: "new-a", slot: 110, err: null },
  { signature: "new-b", slot: 109, err: null },
  { signature: "anchor", slot: 100, err: null },
  { signature: "late", slot: 90, err: null },
  { signature: "boundary", slot: 67, err: null },
];
test("historical pagination recovers disconnected slots through verified decoder and dedupes live/history overlap", async () => {
  const j = new EventJournal();
  const p = new EventIngestion({ journal: j });
  p.accept(event("anchor", 100, "pump"));
  p.accept(event("new-a", 110, "pump"));
  await p.drain();
  const result = await recoverGap(
    p,
    fixtureRpc(rows),
    "pump",
    { signature: "anchor", slot: 100 },
    { pageSize: 2, maxPages: 5, sleep: async () => {} },
  );
  assert.equal(result.status, "recovered");
  assert.equal(result.pages, 3);
  assert.equal(result.duplicates, 2);
  assert.equal(result.retrieved, 2);
  assert.equal(j.completed.size, 4);
  assert.equal(j.gaps.get("pump")!.status, "recovered");
  await p.close();
});
test("missing transactions and pagination/retention caps never report full recovery", async () => {
  for (const mode of [
    "missing",
    "page-cap",
    "retention",
    "no-anchor",
  ] as const) {
    const j = new EventJournal();
    const p = new EventIngestion({ journal: j });
    const rpc = fixtureRpc(
      mode === "retention" ? rows.slice(0, 2) : rows,
      new Set(mode === "missing" ? ["new-b"] : []),
    );
    const result = await recoverGap(
      p,
      rpc,
      "pump",
      mode === "no-anchor" ? undefined : { signature: "anchor", slot: 100 },
      {
        pageSize: 2,
        maxPages: mode === "page-cap" ? 1 : 5,
        retries: 0,
        sleep: async () => {},
      },
    );
    assert.notEqual(result.status, "recovered", mode);
    assert.notEqual(j.gaps.get("pump")!.status, "recovered", mode);
    await p.close();
  }
});
test("429 retry-after is honored within a bounded retry budget", async () => {
  const j = new EventJournal();
  const p = new EventIngestion({ journal: j });
  const rpc = fixtureRpc(rows);
  let calls = 0;
  rpc.getSlot = async () => {
    if (calls++ < 2) throw new RecoveryRpcError(true, 40);
    return 120;
  };
  const waits: number[] = [];
  const result = await recoverGap(
    p,
    rpc,
    "pump",
    { signature: "anchor", slot: 100 },
    {
      pageSize: 2,
      maxPages: 5,
      retryBaseMs: 1,
      sleep: async (ms) => {
        waits.push(ms);
      },
    },
  );
  assert.equal(result.status, "recovered");
  assert.equal(calls, 3);
  assert.deepEqual(waits, [40, 40]);
  await p.close();
});
test("bounded stage worker budget and failure isolation remain observable", async () => {
  const m = new Telemetry();
  const stage = new BoundedStage("test", 3, 2, m);
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const a = stage.trySubmit(async () => {
    await gate;
    throw Error("fault");
  })!;
  const b = stage.trySubmit(async () => {
    await gate;
    return 2;
  })!;
  const c = stage.trySubmit(() => 3)!;
  assert.equal(
    stage.trySubmit(() => 4),
    undefined,
  );
  release();
  await assert.rejects(a);
  assert.equal(await b, 2);
  assert.equal(await c, 3);
  await stage.drain();
  assert.equal(m.report().gauges["test.in_flight"].peak, 2);
  assert.equal(m.report().gauges["test.pending"].current, 0);
  stage.close();
});

test("RPC failure before getSlot still consumes a persisted bounded recovery cycle", async () => {
  const { RecoveryCoordinator } = await import("../src/backfill.js");
  const j = new EventJournal();
  const p = new EventIngestion({ journal: j });
  p.recordGap("pump", 68, 120, "disconnect", {
    signature: "anchor",
    slot: 100,
  });
  let calls = 0;
  const rpc: RecoveryRpc = {
    getSlot: async () => {
      calls++;
      throw new RecoveryRpcError(true);
    },
    getSignaturesForAddress: async () => [],
    getTransaction: async () => null,
  };
  const c = new RecoveryCoordinator(p, rpc, { retries: 0 });
  for (let n = 0; n < 4; n++) {
    c.request("pump", { signature: "anchor", slot: 100 });
    await c.drain();
  }
  assert.equal(calls, 3);
  assert.equal(j.gaps.get("pump")!.attempts, 3);
  assert.equal(j.gaps.get("pump")!.status, "unrecoverable");
  await c.close();
  await p.close();
});
