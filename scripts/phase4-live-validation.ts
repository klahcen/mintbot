/** Bounded current mainnet reads only. Historical creation proofs are never made fresh or traded. */
import { readFile, writeFile } from "node:fs/promises";
import { VerifiedReadRpc } from "../src/verified-rpc.js";
import { MarketRpc } from "../src/market/rpc.js";
import { PumpMarketAdapter } from "../src/market/pump.js";
import { PoolMarketAdapter } from "../src/market/pools.js";
import { marketRisk } from "../src/market/risk.js";
import {
  publicEvidence,
  failed,
  type Signal,
  type MarketBatch,
  type MarketState,
  type Quote,
} from "../src/market/types.js";
import type { VerifiedLaunch } from "../src/verified-decoders.js";
import { PUMP, FEES } from "../src/market/accounts.js";
import { VERIFIED_PROGRAMS } from "../src/chain.js";
import { Telemetry } from "../src/telemetry.js";
const endpoint =
    process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  m = new Telemetry(),
  rpc = new MarketRpc(endpoint, m),
  verifier = new VerifiedReadRpc(endpoint),
  rows = [];
for (const venue of [
  "pump",
  "pumpswap",
  "raydium-cpmm",
  "meteora-dlmm",
] as const) {
  let launch: VerifiedLaunch | undefined;
  let state: MarketState | undefined;
  let buy: Quote | undefined;
  let sell: Quote | undefined;
  const issues: string[] = [];
  try {
    const fixture = JSON.parse(
      await readFile(`docs/phase3/fixtures/${venue}-creation.json`, "utf8"),
    );
    const result = await m.measureAsync(
      "market.transaction_verification_ms",
      () =>
        verifier.verify(
          venue,
          fixture.provenance.signature,
          fixture.result.slot,
        ),
    );
    if (!result?.length) throw Error("Finalized creation unavailable");
    launch = result[0];
    const p = VERIFIED_PROGRAMS.find((p) => p.name === venue)!.address;
    const external = await Promise.allSettled([
      rpc.fees([launch.address]),
      rpc.deployment(p, launch.slot),
      venue === "pump" || venue === "pumpswap"
        ? rpc.deployment(FEES, launch.slot)
        : Promise.resolve({
            status: "verified" as const,
            value: true,
            reason: "No external fee program",
          }),
    ]);
    const signals = external.map((r) =>
      r.status === "fulfilled" ? r.value : failed((r.reason as Error).message),
    );
    const adapter =
      venue === "pump" ? new PumpMarketAdapter() : new PoolMarketAdapter(venue);
    let captured: MarketBatch | undefined;
    const reader = {
      provider: rpc.provider,
      accounts: async (keys: string[], slot: number) => {
        captured = await rpc.accounts(keys, slot);
        return captured;
      },
      largest: rpc.largest.bind(rpc),
      holders: rpc.holders.bind(rpc),
    };
    try {
      state = await m.measureAsync("market.state_retrieval_ms", () =>
        adapter.read(launch!, reader),
      );
    } finally {
      if (captured)
        await writeFile(
          `docs/phase4/fixtures/${venue}-live-market.json`,
          JSON.stringify(
            {
              ...(publicEvidence(captured) as object),
              provenance: {
                provider: rpc.provider,
                capturedAt: new Date(captured.retrievedAt).toISOString(),
                method: "getMultipleAccounts",
                historicalAccountSnapshot: false,
                scope:
                  "Current read-only state of a historical verified creation; no fresh launch or paper entry claimed",
              },
            },
            null,
            2,
          ) + "\n",
        );
    }
    try {
      m.measure("market.quote_computation_ms", () => {
        buy = adapter.quote(
          state!,
          "buy",
          venue === "pump" ? 10000n : 1000000n,
          100,
        );
        sell = adapter.quote(state!, "sell", buy.minimumOutput, 100);
      });
    } catch (e) {
      issues.push((e as Error).message);
    }
    launch.freshness = {
      origin: "history",
      receiptAt: Date.now(),
      eventSlot: launch.slot,
      chainHeadSlot: state.slot,
      eventTimeMs: launch.blockTimeMs,
    };
    const version =
      signals[1].status === "verified" && signals[2].status === "verified"
        ? signals[1]
        : failed("Protocol or fee program deployment unavailable");
    const risk = m.measure("market.risk_evaluation_ms", () =>
      marketRisk(state!, buy, sell, signals[0], version),
    );
    rows.push({
      venue,
      launch,
      state,
      buy,
      sell,
      risk,
      networkFees: signals[0],
      deployment: signals[1],
      feeProgramDeployment: signals[2],
      issues,
      paperEntryAttempted: false,
    });
  } catch (e) {
    rows.push({
      venue,
      launch,
      state,
      buy,
      sell,
      issues: [...issues, (e as Error).message],
      paperEntryAttempted: false,
    });
  }
  console.log(venue, rows.at(-1)?.issues);
}
await writeFile(
  "docs/phase4/live-readonly-validation.json",
  JSON.stringify(
    publicEvidence({
      capturedAt: new Date().toISOString(),
      provider: rpc.provider,
      rows,
      telemetry: m.report(),
      liveTrading: false,
      scope:
        "Bounded native Node reads of finalized historical creation proofs and current market state. No signing, submission, wallet funding, or paper entry; no fresh-launch viability claim.",
    }),
    null,
    2,
  ) + "\n",
);
