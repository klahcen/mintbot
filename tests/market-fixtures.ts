import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { decodeVerifiedTransaction } from "../src/verified-decoders.js";
import { PumpMarketAdapter } from "../src/market/pump.js";
import { PoolMarketAdapter } from "../src/market/pools.js";
import {
  verified,
  type MarketReader,
  type MarketBatch,
} from "../src/market/types.js";
export const json = async (p: string) => JSON.parse(await readFile(p, "utf8"));
export async function recorded(
  venue: "pump" | "pumpswap" | "raydium-cpmm" | "meteora-dlmm",
) {
  const fixture = await json(`docs/phase4/fixtures/${venue}-market.json`),
    launch = decodeVerifiedTransaction(
      venue,
      (await json(`docs/phase3/fixtures/${venue}-creation.json`)).result,
      await json(`docs/phase3/fixtures/${venue}-accounts.json`),
    )[0];
  const rpc: MarketReader = {
    provider: fixture.provenance.provider,
    accounts: async (keys) => ({
      contextSlot: fixture.contextSlot,
      commitment: "finalized",
      provider: fixture.provenance.provider,
      retrievedAt: Date.now(),
      retrievedMono: performance.now(),
      accounts: Object.fromEntries(
        keys.map((k) => [k, structuredClone(fixture.accounts[k]) ?? null]),
      ),
    }),
    largest: async () => ({ slot: fixture.contextSlot, amounts: [] }),
  };
  const adapter =
    venue === "pump" ? new PumpMarketAdapter() : new PoolMarketAdapter(venue);
  launch.creationCommitment = "finalized";
  launch.sourceProvider = fixture.provenance.provider;
  return { fixture, launch, rpc, adapter };
}
/** Unit-only safety/clock overrides. These are never saved as real-chain evidence or mainnet fills. */
export async function paperCase() {
  const r = await recorded("pump"),
    state = await r.adapter.read(r.launch, r.rpc);
  state.launch = {
    ...state.launch,
    slot: state.slot,
    blockTimeMs: Date.now(),
    freshness: {
      origin: "live",
      receiptAt: Date.now(),
      eventSlot: state.slot,
      chainHeadSlot: state.slot,
      eventTimeMs: Date.now(),
    },
  };
  state.signals.holderConcentration = verified(
    { topOwnerBps: 500 },
    "UNIT TEST safety stub; no claim of real owner distribution",
    state.slot,
  );
  const fees = verified(
    {
      baseLamports: "5000",
      priorityLamports: "0",
      rentLamports: "0",
      computeUnitLimit: 200000,
      observedAt: Date.now(),
    },
    "UNIT TEST fee stub",
  );
  const version = verified(true, "UNIT TEST reviewed-version stub");
  const buy = r.adapter.quote(state, "buy", 10000n, 100),
    sell = r.adapter.quote(state, "sell", buy.minimumOutput, 100);
  return { ...r, state, buy, sell, fees, version };
}
