import test from "node:test";
import assert from "node:assert/strict";
import { PoolMarketAdapter } from "../src/market/pools.js";
import { quoteDlmm } from "../src/market/dlmm-quote.js";
import { publicEvidence } from "../src/market/types.js";
import { recorded, json } from "./market-fixtures.js";
test("Recorded PumpSwap evidence distinguishes real liquidity from virtual reserves and quotes both sides", async () => {
  const r = await recorded("pumpswap"),
    s = await r.adapter.read(r.launch, r.rpc);
  assert.equal(s.liquidityLamports, 2908960632n);
  assert.equal(s.quoteReserve, 20493040672n);
  assert(s.quoteReserve > s.liquidityLamports);
  const buy = r.adapter.quote(s, "buy", 1000000n, 100),
    sell = r.adapter.quote(s, "sell", buy.output, 100);
  assert.equal(buy.output, 42355954415n);
  assert.equal(sell.output, 975210n);
  assert.equal(buy.poolFeeAsset, "So11111111111111111111111111111111111111112");
});
test("Recorded Raydium CPMM drained liquidity produces no imaginary executable sell route", async () => {
  const r = await recorded("raydium-cpmm"),
    s = await r.adapter.read(r.launch, r.rpc);
  assert.equal(s.liquidityLamports, 1n);
  const buy = r.adapter.quote(s, "buy", 1000000n, 100);
  assert.throws(() => r.adapter.quote(s, "sell", buy.output, 100), /liquidity/);
});
test("Recorded DLMM empty verified bins fail closed instead of using custody spot price", async () => {
  const r = await recorded("meteora-dlmm");
  await assert.rejects(r.adapter.read(r.launch, r.rpc), /liquidity/);
});
test("Pool adapters reject unsupported layout revisions and quote staleness", async () => {
  for (const venue of ["pumpswap", "raydium-cpmm", "meteora-dlmm"] as const) {
    const r = await recorded(venue);
    await assert.rejects(
      r.adapter.read({ ...r.launch, layoutRevision: "unreviewed" }, r.rpc),
      /revision/,
    );
  }
  const r = await recorded("pumpswap"),
    s = await r.adapter.read(r.launch, r.rpc);
  assert.throws(
    () => r.adapter.quote(s, "buy", 100n, 100, s.retrievedMono + 1501),
    /stale/,
  );
});
test("Pool adapters require mint, reserve and protocol account ownership evidence", async () => {
  const r = await recorded("pumpswap");
  const old = r.rpc.accounts;
  r.rpc.accounts = async (keys, slot) => {
    const b = await old(keys, slot);
    for (const a of Object.values(b.accounts))
      if (a) a.owner = "11111111111111111111111111111111";
    return b;
  };
  await assert.rejects(
    r.adapter.read(r.launch, r.rpc),
    /invalid market account/,
  );
});
test("DLMM bigint dynamic fee traversal matches retained independent upstream BN reference vectors", async () => {
  const vectors = await json("docs/phase4/dlmm-reference-vectors.json");
  const p = {
    base_factor: 10000,
    filter_period: 30,
    decay_period: 600,
    reduction_factor: 5000,
    variable_fee_control: 40000,
    max_volatility_accumulator: 350000,
    base_fee_power_factor: 0,
    collect_fee_mode: 0,
    protocol_share: 1000,
  };
  for (const v of vectors.rows) {
    const model = {
      activeId: 0,
      binStep: 10,
      parameters: { ...p, collect_fee_mode: v.mode },
      volatility: {
        index_reference: 0,
        volatility_reference: 0,
        volatility_accumulator: 260000,
        last_update_timestamp: "1000",
      },
      timestamp: "2000",
      bins: Array.from({ length: 5 }, (_, i) => ({
        id: i - 2,
        x: "1000",
        y: "1000",
        price: ((1n << 64n) * BigInt(i + 1)).toString(),
      })),
    };
    if (v.result) {
      assert.throws(() => quoteDlmm(model, v.side, BigInt(v.input)));
    } else {
      const q = quoteDlmm(model, v.side, BigInt(v.input));
      assert.equal(q.output.toString(), v.output);
      assert.equal(q.fee.toString(), v.fee);
    }
  }
});
test("DLMM cannot fabricate a partial fill beyond verified array coverage", () => {
  const model = {
    activeId: 0,
    binStep: 10,
    parameters: {
      base_factor: 10000,
      base_fee_power_factor: 0,
      variable_fee_control: 0,
      filter_period: 30,
      decay_period: 600,
      reduction_factor: 5000,
      max_volatility_accumulator: 350000,
      collect_fee_mode: 0,
    },
    volatility: {
      index_reference: 0,
      volatility_reference: 0,
      volatility_accumulator: 0,
      last_update_timestamp: "1",
    },
    timestamp: "1000",
    bins: [{ id: 0, x: "10", y: "10", price: (1n << 64n).toString() }],
  };
  assert.throws(() => quoteDlmm(model, "buy", 100n), /exceeds verified/);
});
test("Raydium creator fees preserve input/output token units (synthetic quote-model unit case)", async () => {
  const r = await recorded("raydium-cpmm"),
    s = await r.adapter.read(r.launch, r.rpc);
  s.baseReserve = 1000000000n;
  s.quoteReserve = 1000000000n;
  s.liquidityLamports = s.quoteReserve;
  const model = s.signals.quoteModel.value as any;
  model.fees = ["2500", "1000"];
  model.feeOnBuyInput = false;
  const quote = r.adapter.quote(s, "buy", 1000000n, 100);
  assert.equal(quote.poolFee, 2500n);
  assert.equal(
    quote.poolFeeAsset,
    "So11111111111111111111111111111111111111112",
  );
  assert.equal(quote.outputFee?.mint, s.mint);
  assert.equal(quote.outputFee?.atoms, 997n);
  assert.equal(quote.output, 995508n);
});
