import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AsyncEventJournal } from "../src/async-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import { recoverGap, HttpRecoveryRpc, RecoveryCoordinator, type RecoveryRpc } from "../src/backfill.js";
import { EventJournal } from "../src/event-journal.js";
import { VERIFIED_PROGRAMS } from "../src/chain.js";
import { pumpLogs } from "../scripts/benchmark-fixtures.js";

test("Interrupted recovery keeps its durable gap and page evidence; restart rescans without duplicate strategy decisions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-phase9-recovery-"));
  const path = join(dir, "ingestion.wal"), progress = join(dir, "progress.json");
  const decisions: string[] = [];
  const rows = [
    { signature: "new", slot: 110, err: null },
    { signature: "anchor", slot: 100, err: null },
    { signature: "overlap", slot: 90, err: null },
    { signature: "boundary", slot: 67, err: null },
  ];
  const rpc: RecoveryRpc = {
    getSlot: async () => 120,
    getSignaturesForAddress: async (_, o) => {
      const start = o.before ? rows.findIndex(r => r.signature === o.before) + 1 : 0;
      return rows.slice(start, start + o.limit);
    },
    getTransaction: async signature => ({
      slot: rows.find(r => r.signature === signature)!.slot,
      meta: { err: null, logMessages: pumpLogs(VERIFIED_PROGRAMS[0]!.address) },
      transaction: { signatures: [signature], message: { accountKeys: [VERIFIED_PROGRAMS[0]!.address] } },
    }),
  };
  let pipeline: EventIngestion | undefined;
  const start = async () => new EventIngestion({ journal: await AsyncEventJournal.open({ path }), strategy: async e => { decisions.push(e.signature); } });
  try {
    pipeline = await start();
    const anchor = { signature: "anchor", slot: 100 };
    pipeline.recordGap("pump", 68, 120, "test-disconnect", anchor);
    const first = await recoverGap(pipeline, rpc, "pump", anchor, {
      pageSize: 2, maxPages: 5, retries: 0,
      onProgress: async p => { await writeFile(progress, JSON.stringify(p)); throw Error("checkpoint fault"); },
    });
    assert.notEqual(first.status, "recovered");
    assert.equal(JSON.parse(await readFile(progress, "utf8")).cursor, "anchor");
    await pipeline.close();
    pipeline = await start();
    assert.notEqual(pipeline.journal.gaps.get("pump")!.status, "recovered");
    const second = await recoverGap(pipeline, rpc, "pump", anchor, { pageSize: 2, maxPages: 5 });
    assert.equal(second.status, "recovered");
    assert(second.duplicates >= 2);
    assert.equal(decisions.filter(s => s === "new").length, 1);
    assert.equal(new Set(decisions).size, decisions.length);
    await pipeline.close(); pipeline = undefined;
    const restored = await AsyncEventJournal.open({ path });
    assert.equal(restored.gaps.get("pump")!.status, "recovered");
    await restored.shutdown();
  } finally { await pipeline?.close(); await rm(dir, { recursive: true, force: true }); }
});

test("Finalized recovery pins all RPC methods while the existing confirmed default is preserved", async () => {
  const original = globalThis.fetch, calls: any[] = [];
  globalThis.fetch = (async (_url: unknown, options: any) => {
    const call = JSON.parse(options.body); calls.push(call);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: call.id, result: call.method === "getSlot" ? 1 : call.method === "getTransaction" ? null : [] }));
  }) as typeof fetch;
  try {
    const rpc = new HttpRecoveryRpc("https://unit.invalid", 100, 4096, "finalized");
    await rpc.getSlot(); await rpc.getSignaturesForAddress(VERIFIED_PROGRAMS[0]!.address, { limit: 2 }); await rpc.getTransaction("unit");
    for (const c of calls) assert.equal(c.params.at(-1).commitment, "finalized");
    await new HttpRecoveryRpc("https://unit.invalid").getSlot();
    assert.equal(calls.at(-1).params[0].commitment, "confirmed");
  } finally { globalThis.fetch = original; }
});

test("A new incident merged into an exhausted recovery cycle remains explicitly unrecoverable", async () => {
  const journal = new EventJournal(), pipeline = new EventIngestion({ journal });
  pipeline.recordGap("pump", 1, 10, "disconnect");
  journal.updateGap({ ...journal.gaps.get("pump")!, attempts: 3, status: "unrecoverable" });
  pipeline.recordGap("pump", 1, 20, "second-disconnect");
  assert.equal(journal.gaps.get("pump")!.status, "unrecoverable");
  let calls = 0;
  const c = new RecoveryCoordinator(pipeline, { getSlot: async () => { calls++; return 20; }, getSignaturesForAddress: async () => [], getTransaction: async () => null });
  c.request("pump"); await c.drain();
  assert.equal(calls, 0);
  assert.equal(journal.gaps.get("pump")!.toSlot, 20);
  assert.equal(journal.gaps.get("pump")!.attempts, 3);
  assert.equal(journal.gaps.get("pump")!.status, "unrecoverable");
  journal.updateGap({ ...journal.gaps.get("pump")!, attempts: 0, status: "pending" });
  pipeline.recordGap("pump", 1, 21, "reviewed-new-cycle");
  assert.equal(journal.gaps.get("pump")!.status, "pending");
  assert.equal(journal.gaps.get("pump")!.attempts, 0);
  await c.close(); await pipeline.close();
});
