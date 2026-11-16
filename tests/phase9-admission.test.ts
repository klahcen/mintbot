import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AsyncEventJournal } from "../src/async-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import { ResearchAdmission } from "../src/research/admission.js";
import { Telemetry } from "../src/telemetry.js";
const event = (slot: number) => ({ program: "pumpswap", signature: "conflicting-burst", slot, logs: [], failed: false, observedAt: Date.now() });
test("Unbounded conflict replay reproduces acknowledgement saturation while the worker remains durable", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phase9-capacity-reproduction-")), metrics = new Telemetry();
  const journal = await AsyncEventJournal.open({ path: join(directory, "wal"), maxUnacked: 32, batchDelayMs: 100 }, metrics);
  const pipeline = new EventIngestion({ journal, metrics });
  try {
    await pipeline.acceptDurable(event(100)); await pipeline.drain();
    await Promise.all(Array.from({ length: 1000 }, (_, i) => pipeline.acceptDurable(event(101 + i))));
    assert.equal(pipeline.status().fatal, "gap-persistence-failed");
    assert.equal(metrics.report().gauges["journal.unacked"].peak, 32);
    assert.equal(journal.status().writerFailure, null);
  } finally { await pipeline.close().catch(() => {}); await rm(directory, { recursive: true, force: true }); }
});
test("Bounded admission prevents conflict-gap metadata from saturating a real worker acknowledgement queue", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phase9-admission-")), metrics = new Telemetry();
  const journal = await AsyncEventJournal.open({ path: join(directory, "wal"), maxUnacked: 32, batchSize: 8, batchDelayMs: 5 }, metrics);
  const pipeline = new EventIngestion({ journal, metrics }), intake = new ResearchAdmission(pipeline, metrics, 128);
  try {
    await pipeline.acceptDurable(event(100)); await pipeline.drain();
    const results = Array.from({ length: 1000 }, (_, i) => intake.offer(event(101 + i)));
    const admitted = results.filter((r): r is NonNullable<typeof r> => !!r);
    assert.equal(admitted.length, 128);
    await Promise.all(admitted); await intake.drain();
    assert.equal(pipeline.status().fatal, null);
    assert.equal(journal.gaps.get("pumpswap")!.knownRefused, 128);
    assert.equal(journal.completed.size, 1);
    assert.equal(intake.pendingBytes, 0);
    assert(metrics.report().gauges["journal.unacked"].peak < 32);
  } finally { intake.close(); await pipeline.close(); await rm(directory, { recursive: true, force: true }); }
});
test("A refused event does not release admission before its gap metadata flush finishes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phase9-flush-"));
  const journal = await AsyncEventJournal.open({ path: join(directory, "wal") });
  const pipeline = new EventIngestion({ journal }), intake = new ResearchAdmission(pipeline, new Telemetry());
  let release!: () => void;
  try {
    await pipeline.acceptDurable(event(100)); await pipeline.drain();
    const original = journal.flush.bind(journal), barrier = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void; const waiting = new Promise<void>(resolve => { entered = resolve; });
    journal.flush = async () => { await original(); entered(); await barrier; };
    let completed = false; const job = intake.offer(event(101))!.then(() => { completed = true; });
    await waiting; assert.equal(completed, false); assert.equal(intake.pending, 1);
    release(); await job; assert.equal(completed, true); journal.flush = original;
  } finally { release?.(); intake.close(); await pipeline.close(); await rm(directory, { recursive: true, force: true }); }
});
