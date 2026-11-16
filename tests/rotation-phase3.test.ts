import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RotatingJsonl } from "../src/rotating-jsonl.js";
test("raw rotation has bounded retention with persistent cumulative coverage tombstones and intact pending WAL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-rotate3-")),
    path = join(dir, "raw.jsonl");
  try {
    await writeFile(join(dir, "work.wal"), "pending work must remain");
    const raw = await RotatingJsonl.open(path, {
      maxBytes: 1024,
      maxArchives: 2,
    });
    for (let slot = 100; slot < 110; slot++)
      await raw.append({ slot, payload: "x".repeat(600) });
    await raw.close();
    const manifest = JSON.parse(
      await readFile(path + ".retention.json", "utf8"),
    );
    assert.equal(manifest.archives.length, 2);
    assert.equal(manifest.deletedFiles, 7);
    assert.equal(manifest.removedCoverage.fromSlot, 100);
    assert.equal(manifest.removedCoverage.toSlot, 106);
    assert.equal(
      (await readdir(dir)).filter((n) => n.includes(".archive-")).length,
      2,
    );
    assert.equal(
      await readFile(join(dir, "work.wal"), "utf8"),
      "pending work must remain",
    );
    const restored = await RotatingJsonl.open(path, {
      maxBytes: 1024,
      maxArchives: 2,
    });
    assert.equal(restored.status().deletedFiles, 7);
    assert.equal(restored.status().removedCoverage.toSlot, 106);
    await restored.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("raw persistence rejects oversized records rather than silently truncating them", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-raw3-"));
  try {
    const raw = await RotatingJsonl.open(join(dir, "raw"), { maxBytes: 1024 });
    await assert.rejects(
      raw.append({ slot: 1, payload: "x".repeat(1100) }),
      /bound/,
    );
    await raw.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("raw writer ownership is exclusive and journal/raw path overlap is rejected before opening storage", async () => {
  const { createMonitoringService } = await import("../src/monitor-service.js");
  const { VERIFIED_PROGRAMS } = await import("../src/chain.js");
  const dir = await mkdtemp(join(tmpdir(), "mintbot-rawlease3-")),
    path = join(dir, "raw");
  let raw: RotatingJsonl | undefined;
  try {
    raw = await RotatingJsonl.open(path);
    await assert.rejects(RotatingJsonl.open(path), /active writer/);
    await raw.close();
    raw = undefined;
    const again = await RotatingJsonl.open(path);
    await again.close();
    await assert.rejects(
      createMonitoringService({
        programs: [VERIFIED_PROGRAMS[0]!],
        websocketUrls: ["ws://fixture.invalid"],
        journal: { path },
        rawPath: path,
      }),
      /must not overlap/,
    );
  } finally {
    await raw?.close();
    await rm(dir, { recursive: true, force: true });
  }
});
