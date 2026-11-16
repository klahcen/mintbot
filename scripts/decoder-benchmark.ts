import { PublicKey } from "@solana/web3.js";
import { decodeLaunch, VERIFIED_PROGRAMS } from "../src/chain.js";
import { Telemetry } from "../src/telemetry.js";
import { pumpLogs } from "./benchmark-fixtures.js";
import { writeFile } from "node:fs/promises";
const rows = [];
for (const workload of ["repeated-mint", "unique-mints"] as const) {
  const events = Array.from({ length: 1000 }, (_, i) => {
    const logs = pumpLogs(VERIFIED_PROGRAMS[0]!.address);
    if (workload === "unique-mints") {
      const bytes = Buffer.from(logs[1]!.slice(14), "base64");
      let offset = 8;
      for (let n = 0; n < 3; n++) offset += 4 + bytes.readUInt32LE(offset);
      const key = Buffer.alloc(32);
      key.writeUInt32LE(i + 1);
      const mint = new PublicKey(key);
      const curve = PublicKey.findProgramAddressSync(
        [Buffer.from("bonding-curve"), key],
        new PublicKey(VERIFIED_PROGRAMS[0]!.address),
      )[0];
      bytes.set(key, offset);
      bytes.set(curve.toBuffer(), offset + 32);
      logs[1] = `Program data: ${bytes.toString("base64")}`;
    }
    return {
      program: "pump",
      signature: `fixture-${i}`,
      slot: i,
      logs,
      failed: false,
      observedAt: Date.now(),
    };
  });
  for (const pdaCache of [false, true]) {
    const m = new Telemetry();
    const begin = m.now();
    for (const event of events) decodeLaunch(event, m, { pdaCache });
    rows.push({
      workload,
      pdaCache,
      events: events.length,
      elapsedMs: m.now() - begin,
      ...m.report(),
    });
  }
}
await writeFile(
  "docs/phase2/decoder-detail.json",
  JSON.stringify(
    {
      scope:
        "Offline decode only; fixture generation excluded; repeated mint has deliberate cache locality; unique-mint workload exposes cold misses; cache disabled/enabled ordered pairs, not randomized",
      rows,
    },
    null,
    2,
  ) + "\n",
);
