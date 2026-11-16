import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir, cpus } from "node:os";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { AsyncEventJournal } from "../src/async-journal.js";
import { Telemetry } from "../src/telemetry.js";
import { pumpLogs } from "./benchmark-fixtures.js";
import { VERIFIED_PROGRAMS } from "../src/chain.js";
const args = process.argv.slice(2),
  opt = (n: string, d: string) =>
    args.includes(n) ? args[args.indexOf(n) + 1]! : d;
const root = resolve(opt("--before-root", "/tmp/mintbot-phase3-before"));
const { EventJournal } = (await import(
  pathToFileURL(join(root, "src/event-journal.ts")).href
)) as typeof import("../src/event-journal.js");
const logs = pumpLogs(VERIFIED_PROGRAMS[0]!.address),
  rows = [];
let seed = 34711;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
for (let repetition = 1; repetition <= 3; repetition++)
  for (const adapter of random() < 0.5
    ? ["sync", "worker"]
    : ["worker", "sync"]) {
    const dir = await mkdtemp(join(tmpdir(), "mintbot-wal-bench3-")),
      metrics = new Telemetry();
    const j =
      adapter === "worker"
        ? await AsyncEventJournal.open({ path: join(dir, "wal") }, metrics)
        : new EventJournal({ path: join(dir, "wal") });
    const loop = monitorEventLoopDelay({ resolution: 10 });
    loop.enable();
    await new Promise((r) => setTimeout(r, 15));
    const cpu = process.cpuUsage(),
      mem = process.memoryUsage(),
      start = performance.now();
    let peakRss = mem.rss;
    const latency = new Telemetry();
    let completed = 0;
    try {
      for (let base = 0; base < 1000; base += 64) {
        const times = new Map<string, number>();
        const receipts = await Promise.all(
          Array.from({ length: Math.min(64, 1000 - base) }, async (_, n) => {
            const e = {
              program: "pump",
              signature: `journal-${base + n}`,
              slot: 1000 + base + n,
              failed: false,
              observedAt: Date.now(),
              logs,
            };
            const t = performance.now();
            const receipt =
              adapter === "worker" ? await j.offerDurable(e) : j.offer(e);
            if (receipt.status !== "accepted")
              throw Error("Refused benchmark receipt");
            times.set(receipt.id, t);
            return receipt;
          }),
        );
        await Promise.all(
          receipts.map(async (receipt) => {
            if (adapter === "worker") await j.completeDurable(receipt.id);
            else j.complete(receipt.id);
            completed++;
            latency.observe(
              "receipt_to_completion_ms",
              performance.now() - times.get(receipt.id)!,
            );
          }),
        );
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
      }
      const elapsedMs = performance.now() - start;
      await new Promise((r) => setTimeout(r, 15));
      loop.disable();
      rows.push({
        repetition,
        adapter,
        completed,
        elapsedMs,
        completedPerSecond: (completed * 1000) / elapsedMs,
        latency: latency.snapshot(),
        cpuMicroseconds: process.cpuUsage(cpu),
        memoryBefore: mem,
        memoryAfter: process.memoryUsage(),
        sampledPeakRssBytes: peakRss,
        eventLoopDelayMs: {
          p95: loop.percentile(95) / 1e6,
          p99: loop.percentile(99) / 1e6,
          max: loop.max / 1e6,
        },
        journal: j.status(),
        telemetry: metrics.report(),
      });
    } finally {
      if (adapter === "worker") await j.shutdown();
      else j.close();
      await rm(dir, { recursive: true, force: true });
    }
  }
await writeFile(
  opt("--output", "docs/phase3/journal-comparison.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      environment: { node: process.version, cpu: cpus()[0]?.model },
      events: 1000,
      repetitions: 3,
      seed: 34711,
      durability:
        "Both paths fsync WAL data before receipt/completion acknowledgement; worker also fsyncs directory. Same 64-offer groups and completion population. Worker startup excluded. Randomized adapter order per repetition.",
      baselineSha256: createHash("sha256")
        .update(await readFile(join(root, "src/event-journal.ts")))
        .digest("hex"),
      harnessSha256: createHash("sha256")
        .update(
          await readFile(new URL("./journal-benchmark.ts", import.meta.url)),
        )
        .digest("hex"),
      rows,
    },
    null,
    2,
  ) + "\n",
);
