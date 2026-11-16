/** Inspect one immutable WAL checkpoint without opening its active writer ownership. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { DecoderRegistry } from "../src/decoders.js";
import { Telemetry } from "../src/telemetry.js";
const path = process.argv[2] ?? "docs/phase9/mainnet-extended/ingestion.wal";
const bytes = await readFile(path);
if (bytes.length > 64 * 1024 * 1024) throw Error("Research WAL size bound");
const newline = bytes.indexOf(10);
if (newline < 0) throw Error("No complete checkpoint record");
const first = bytes.subarray(0, newline), frame = JSON.parse(first.toString());
if (frame.record.kind !== "snapshot" || frame.sha256 !== createHash("sha256").update(JSON.stringify(frame.record)).digest("hex")) throw Error("Checkpoint integrity mismatch");
await writeFile("docs/phase9/quarantine-checkpoint.json.gz", gzipSync(first));
const registry = new DecoderRegistry(), metrics = new Telemetry(), counts: Record<string, number> = {};
const rows = frame.record.pending.filter((p: any) => p.quarantined).map((p: any) => {
  let result = "No decoder failure reproduced";
  try { registry.decode(p.observation, metrics); } catch (error) { result = (error as Error).message; }
  counts[result] = (counts[result] ?? 0) + 1;
  return { id: p.id, slot: p.observation.slot, origin: p.origin, attempts: p.attempts, result, logTruncated: p.observation.logs.some((l: string) => /truncated/i.test(l)), logBytes: Buffer.byteLength(JSON.stringify(p.observation.logs)) };
});
await writeFile("docs/phase9/quarantine-diagnostics.json", JSON.stringify({ generatedAt: new Date().toISOString(), checkpointSha256: frame.sha256, counts, rows, liveTrading: false, scope: "One verified retained checkpoint only; later WAL changes are not included. Replayed existing strict log decoder failures, not automatic classification of every token or an attempt to relax decoding. Oldest pending age includes quarantined work and is not active queue latency." }, null, 2) + "\n");
console.log(JSON.stringify({ checkpointQuarantined: rows.length, counts }));
