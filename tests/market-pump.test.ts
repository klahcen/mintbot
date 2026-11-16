import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { decodeVerifiedTransaction } from "../src/verified-decoders.js";
import {
  PumpMarketAdapter,
  PUMP_FEES,
  PUMP_GLOBAL,
} from "../src/market/pump.js";
import {
  atoms,
  decimal,
  type MarketBatch,
  type MarketReader,
} from "../src/market/types.js";
const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
const original = await json("docs/phase4/fixtures/pump-market.json");
const launch = decodeVerifiedTransaction(
  "pump",
  (await json("docs/phase3/fixtures/pump-creation.json")).result,
  await json("docs/phase3/fixtures/pump-accounts.json"),
)[0];
const adapter = new PumpMarketAdapter();
function rpc(change?: (b: MarketBatch) => void): MarketReader {
  return {
    provider: original.provenance.provider,
    accounts: async () => {
      const b = {
        ...structuredClone(original),
        provider: original.provenance.provider,
        retrievedAt: Date.now(),
        retrievedMono: performance.now(),
      } as MarketBatch;
      change?.(b);
      return b;
    },
    largest: async () => ({ slot: original.contextSlot, amounts: [] }),
  };
}
function binary(b: MarketBatch, key: string, change: (v: Buffer) => void) {
  const data = Buffer.from(b.accounts[key]!.data[0], "base64");
  change(data);
  b.accounts[key]!.data[0] = data.toString("base64");
}
test("Pump recorded finalized market evidence supports bounded integer buy and sell quotes", async () => {
  const s = await adapter.read(launch, rpc());
  const q = adapter.quote(s, "buy", 10000n, 100);
  const sell = adapter.quote(s, "sell", q.output, 100);
  assert.equal(s.decimals, 6);
  assert.equal(s.liquidityLamports, 41424n);
  assert(q.output > 0n);
  assert(sell.output > 0n && sell.output < 10000n);
  assert.equal(q.kind, "account-state-estimate");
  assert.equal(s.signals.holderConcentration.status, "unknown");
  assert.equal(s.signals.mintAuthority.status, "verified");
  assert.equal(q.provider, original.provenance.provider);
  assert.equal(q.slot, original.contextSlot);
  assert.equal(q.minimumOutput, (q.output * 9900n) / 10000n);
});
test("Pump quote expires by monotonic state age", async () => {
  const s = await adapter.read(launch, rpc());
  assert.throws(
    () => adapter.quote(s, "buy", 10000n, 100, s.retrievedMono + 1501),
    /stale/,
  );
});
test("Pump missing accounts fail closed", async () => {
  await assert.rejects(
    adapter.read(
      launch,
      rpc((b) => {
        b.accounts[PUMP_GLOBAL] = null;
      }),
    ),
    /Missing/,
  );
});
test("Pump unknown program account versions fail closed", async () => {
  await assert.rejects(
    adapter.read(
      launch,
      rpc((b) => {
        const a = b.accounts[launch.address]!;
        a.data[0] = Buffer.concat([
          Buffer.from(a.data[0], "base64"),
          Buffer.from([1]),
        ]).toString("base64");
      }),
    ),
    /Unsupported/,
  );
});
test("Pump reserve changes invalidate evidence digest and alter quotes", async () => {
  const a = await adapter.read(launch, rpc());
  const b = await adapter.read(
    launch,
    rpc((s) =>
      binary(s, launch.address, (v) =>
        v.writeBigUInt64LE(v.readBigUInt64LE(16) + 1000000000n, 16),
      ),
    ),
  );
  assert.notEqual(a.digest, b.digest);
  assert.notEqual(
    adapter.quote(a, "buy", 10000n, 0).output,
    adapter.quote(b, "buy", 10000n, 0).output,
  );
});
test("Pump reorganized observations and inconsistent provider evidence fail closed", async () => {
  await assert.rejects(
    adapter.read({ ...launch, slot: original.contextSlot + 1 }, rpc()),
    /reorganized/,
  );
  await assert.rejects(
    adapter.read(
      launch,
      rpc((b) => {
        b.provider = "different-provider";
      }),
    ),
    /provider/,
  );
});
test("Pump incorrect decimals fail closed", async () => {
  await assert.rejects(
    adapter.read(
      launch,
      rpc((b) =>
        binary(b, launch.mints[0], (v) => {
          v[44] = 9;
        }),
      ),
    ),
    /decimals/,
  );
});
test("Pump real liquidity limits sell route despite virtual reserves", async () => {
  const s = await adapter.read(launch, rpc());
  assert.throws(() => adapter.quote(s, "sell", 1000000000n, 100), /sell route/);
});
test("Pump failed RPC propagates without synthetic price fallback", async () => {
  const r = rpc();
  r.accounts = async () => {
    throw Error("RPC timeout");
  };
  await assert.rejects(adapter.read(launch, r), /timeout/);
});
test("Pump mint and freeze authorities remain failed safety evidence", async () => {
  const s = await adapter.read(
    launch,
    rpc((b) =>
      binary(b, launch.mints[0], (v) => {
        v.writeUInt32LE(1, 0);
        v.writeUInt32LE(1, 46);
      }),
    ),
  );
  assert.equal(s.signals.mintAuthority.status, "failed");
  assert.equal(s.signals.freezeAuthority.status, "failed");
});
test("Pump completion and unsupported fee schedules fail closed", async () => {
  await assert.rejects(
    adapter.read(
      launch,
      rpc((b) =>
        binary(b, launch.address, (v) => {
          v[48] = 1;
        }),
      ),
    ),
    /Unsupported/,
  );
  await assert.rejects(
    adapter.read(
      launch,
      rpc((b) =>
        binary(b, PUMP_FEES, (v) => {
          v.writeUInt32LE(255, 65);
        }),
      ),
    ),
    /fee tier/,
  );
});
test("Explicit integer decimal conversions never round token atoms", () => {
  assert.equal(atoms("0.1", 9), 100000000n);
  assert.equal(decimal(100000000n, 9), "0.100000000");
  assert.throws(() => atoms("0.0000000001", 9), /Inexact/);
  assert.equal(atoms("18446744073709551615", 0), 18446744073709551615n);
});
test("Token-2022 transfer restrictions cannot pass as metadata-only tokens", async () => {
  const { ExtensionType } = await import("@solana/spl-token");
  const s = await adapter.read(
    launch,
    rpc((b) =>
      binary(b, launch.mints[0], (v) => {
        v.writeUInt16LE(ExtensionType.NonTransferable, 166);
      }),
    ),
  );
  assert.equal(s.signals.transferRestrictions.status, "failed");
  assert.throws(() => adapter.quote(s, "buy", 10000n, 100), /quote unavailable/);
});
test("Frozen protocol custody prevents a quoteable Pump snapshot", async () => {
  const keys = Object.keys(original.accounts),
    ata = keys[2];
  await assert.rejects(
    adapter.read(
      launch,
      rpc((b) =>
        binary(b, ata, (v) => {
          v[108] = 2;
        }),
      ),
    ),
    /restricted/,
  );
});
