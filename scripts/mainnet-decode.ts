import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { decodeLaunch } from "../src/chain.js";
import { Telemetry } from "../src/telemetry.js";
const [capture, output] = process.argv.slice(2);
if (!capture || !output)
  throw Error("Supply bounded observation capture and output");
const events = JSON.parse(await readFile(capture, "utf8"));
if (events.length > 10000) throw Error("Observation bound");
const m = new Telemetry(),
  mints = new Set<string>();
let pumpEvents = 0,
  failures = 0;
const cpu = process.cpuUsage(),
  start = performance.now();
for (const event of events) {
  if (event.program !== "pump" || event.failed) continue;
  pumpEvents++;
  try {
    for (const launch of decodeLaunch(event, m)) mints.add(launch.mint);
  } catch {
    failures++;
  }
}
const elapsedMs = performance.now() - start;
await writeFile(
  output,
  JSON.stringify(
    {
      pumpObservations: pumpEvents,
      decodeFailures: failures,
      distinctDecodedMints: mints.size,
      mintSample: [...mints].slice(0, 100),
      elapsedMs,
      cpuMicroseconds: process.cpuUsage(cpu),
      telemetry: m.report(),
      scope:
        "Local replay of actual bounded read-only observations through existing pinned Pump log decoder; no automatic trade or safety/price assertion. Other protocols require full finalized transaction/account verification, not log-only launch claims.",
    },
    null,
    2,
  ) + "\n",
);
