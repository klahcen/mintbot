import test from "node:test";
import assert from "node:assert/strict";
import { decodeLaunch, VERIFIED_PROGRAMS } from "../src/chain.js";
import { Telemetry } from "../src/telemetry.js";
import { pumpLogs } from "../scripts/benchmark-fixtures.js";
import { DecoderRegistry } from "../src/decoders.js";
test("cached and uncached Pump decoding agree and a warm cache still rejects a forged curve", () => {
  const o = {
    program: "pump",
    signature: "s",
    slot: 1,
    failed: false,
    observedAt: 1,
    logs: pumpLogs(VERIFIED_PROGRAMS[0]!.address),
  };
  const m = new Telemetry();
  assert.deepEqual(decodeLaunch(o, m, { pdaCache: false }), decodeLaunch(o, m));
  const bytes = Buffer.from(o.logs[1]!.slice(14), "base64");
  let offset = 8;
  for (let n = 0; n < 3; n++) offset += 4 + bytes.readUInt32LE(offset);
  bytes[offset + 32] ^= 1;
  assert.throws(
    () =>
      decodeLaunch(
        {
          ...o,
          logs: [
            o.logs[0]!,
            `Program data: ${bytes.toString("base64")}`,
            o.logs[2]!,
          ],
        },
        m,
      ),
    /PDA mismatch/,
  );
  assert.ok(m.report().counters["decoding.pda_cache_hits"] >= 1);
});
test("registry exposes observation-only coverage for future protocols", () => {
  const registry = new DecoderRegistry();
  assert.deepEqual(
    registry
      .coverage()
      .filter((p) => p.verifiedDecoder)
      .map((p) => p.program),
    ["pump"],
  );
  assert.equal(
    registry.decode({
      program: "pumpswap",
      signature: "s",
      slot: 1,
      logs: [],
      failed: false,
      observedAt: 1,
    }).supported,
    false,
  );
});
