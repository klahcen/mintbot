import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { performance, PerformanceObserver } from "node:perf_hooks";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
const args = process.argv.slice(2),
  opt = (n: string, d: string) =>
    args.includes(n) ? args[args.indexOf(n) + 1]! : d;
const root = resolve(opt("--source-root", "/tmp/mintbot-phase3-before"));
const { EventJournal } = (await import(
  pathToFileURL(join(root, "src/event-journal.ts")).href
)) as typeof import("../src/event-journal.js");
const { pumpLogs } = await import("./benchmark-fixtures.js");
const { VERIFIED_PROGRAMS } = await import("../src/chain.js");
const dir = await mkdtemp(join(tmpdir(), "mintbot-profile3-"));
const logs = pumpLogs(VERIFIED_PROGRAMS[0]!.address);
const samples: Record<string, number[]> = {};
const record = (key: string, ms: number) => (samples[key] ??= []).push(ms);
const restore: (() => void)[] = [];
const gc: number[] = [];
const observer = new PerformanceObserver((list) => {
  for (const e of list.getEntries()) gc.push(e.duration);
});
observer.observe({ entryTypes: ["gc"] });
for (const key of [
  "writeSync",
  "fsyncSync",
  "writeFileSync",
  "renameSync",
] as const) {
  const original = fs[key] as (...args: any[]) => any;
  (fs as any)[key] = (...args: any[]) => {
    const start = performance.now();
    try {
      return original(...args);
    } finally {
      record(key, performance.now() - start);
    }
  };
  restore.push(() => {
    (fs as any)[key] = original;
  });
}
syncBuiltinESMExports();
const stringify = JSON.stringify;
JSON.stringify = ((...args: any[]) => {
  const start = performance.now();
  try {
    return (stringify as any)(...args);
  } finally {
    record("JSON.stringify", performance.now() - start);
  }
}) as typeof stringify;
const cpu = process.cpuUsage(),
  memory = process.memoryUsage();
let elapsed = 0,
  timerDelay = 0;
try {
  const j = new EventJournal({ path: join(dir, "work.wal") });
  const begin = performance.now();
  const timer = new Promise<void>((r) =>
    setTimeout(() => {
      timerDelay = performance.now() - begin;
      r();
    }, 0),
  );
  for (let i = 0; i < 1000; i++) {
    const event = {
      program: "pump",
      signature: `profile-${i}`,
      slot: 1000 + i,
      failed: false,
      logs,
      observedAt: Date.now(),
    };
    let t = performance.now();
    const receipt = j.offer(event);
    record("offer", performance.now() - t);
    if (receipt.status !== "accepted")
      throw Error("Unexpected profile refusal");
    t = performance.now();
    j.complete(receipt.id);
    record("complete", performance.now() - t);
  }
  const start = performance.now();
  j.compact();
  record("compact", performance.now() - start);
  elapsed = performance.now() - begin;
  await timer;
  j.close();
  await new Promise((r) => setImmediate(r));
} finally {
  JSON.stringify = stringify;
  for (const fn of restore) fn();
  syncBuiltinESMExports();
  observer.disconnect();
  await rm(dir, { recursive: true, force: true });
}
const summarize = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return {
    count: s.length,
    totalMs: xs.reduce((a, b) => a + b, 0),
    p50: s[Math.floor((s.length - 1) * 0.5)],
    p95: s[Math.floor((s.length - 1) * 0.95)],
    p99: s[Math.floor((s.length - 1) * 0.99)],
    max: s.at(-1),
  };
};
await writeFile(
  opt("--output", "docs/phase3/wal-profile-before.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      node: process.version,
      sourceRoot: root,
      sourceSha256: createHash("sha256")
        .update(fs.readFileSync(join(root, "src/event-journal.ts")))
        .digest("hex"),
      events: 1000,
      durable: true,
      elapsedMs: elapsed,
      zeroDelayTimerObservedMs: timerDelay,
      cpuMicroseconds: process.cpuUsage(cpu),
      memoryBefore: memory,
      memoryAfter: process.memoryUsage(),
      gc: summarize(gc),
      stages: Object.fromEntries(
        Object.entries(samples).map(([k, v]) => [k, summarize(v)]),
      ),
      scope:
        "Instrumented offline direct journal offer+completion with real disk I/O, fsync per record and one forced compaction. Nested timings overlap; hook overhead and ordered execution apply. GC entries only observed before collector disconnect. Timer delay measures starvation of a ready callback, not chain latency.",
    },
    null,
    2,
  ) + "\n",
);
