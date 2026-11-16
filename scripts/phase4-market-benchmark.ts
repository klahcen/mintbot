import { readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { Telemetry } from "../src/telemetry.js";
import { Store, initial } from "../src/store.js";
import {
  RealMarketPaper,
  initializeMarketLedger,
} from "../src/market/paper.js";
import { MarketService } from "../src/market/service.js";
import { decodeVerifiedTransaction } from "../src/verified-decoders.js";
import { recorded, paperCase, json } from "../tests/market-fixtures.js";
const rows = [];
const n = 100;
for (let repetition = 1; repetition <= 3; repetition++)
  for (const venue of [
    "pump",
    "pumpswap",
    "raydium-cpmm",
    "meteora-dlmm",
  ] as const) {
    const r = await recorded(venue),
      tx = (await json(`docs/phase3/fixtures/${venue}-creation.json`)).result,
      proof = await json(`docs/phase3/fixtures/${venue}-accounts.json`),
      m = new Telemetry();
    const config = await json("config/strategy.json");
    config.tradeSol = venue === "pump" ? 0.00001 : 0.001;
    const rpc = {
      ...r.rpc,
      accounts: async (keys: string[], slot: number) => {
        m.increment("fixture.account_reads");
        return r.rpc.accounts(keys, slot);
      },
    };
    let snapshots = 0,
      buyQuotes = 0,
      sellQuotes = 0,
      rejectedStates = 0;
    const start = performance.now(),
      cpu = process.cpuUsage();
    for (let i = 0; i < n; i++) {
      m.measure("market.transaction_verification_cpu_ms", () =>
        decodeVerifiedTransaction(venue, tx, proof),
      );
      try {
        const state = await m.measureAsync("market.state_retrieval_ms", () =>
          r.adapter.read(r.launch, rpc),
        );
        snapshots++;
        let buy, sell;
        try {
          m.measure("market.quote_computation_ms", () => {
            buy = r.adapter.quote(
              state,
              "buy",
              venue === "pump" ? 10000n : 1000000n,
              100,
            );
            buyQuotes++;
            sell = r.adapter.quote(state, "sell", buy.minimumOutput, 100);
            sellQuotes++;
          });
        } catch {
          m.increment("market.quote_failed");
        }
        const engine = new RealMarketPaper(
          new Store(initializeMarketLedger(initial(config)), undefined, m),
        );
        await engine.review(
          state,
          buy,
          sell,
          {
            status: "unknown",
            reason: "Offline replay has no current network fee evidence",
          },
          {
            status: "unknown",
            reason: "Offline replay has no current deployment evidence",
          },
        );
        if (engine.store.state.positions.length)
          throw Error("Offline historical fixture unexpectedly traded");
      } catch {
        rejectedStates++;
      }
    }
    const elapsedMs = performance.now() - start;
    rows.push({
      repetition,
      venue,
      iterations: n,
      snapshots,
      buyQuotes,
      sellQuotes,
      rejectedStates,
      realMarketFills: 0,
      elapsedMs,
      eventsPerSecond: (n * 1000) / elapsedMs,
      cpuMicroseconds: process.cpuUsage(cpu),
      telemetry: m.report(),
    });
    console.log(
      `${venue} run ${repetition}: ${snapshots} states, ${buyQuotes}/${sellQuotes} buy/sell quotes, ${((n * 1000) / elapsedMs).toFixed(1)} evaluations/s`,
    );
  }
const executionMetrics = new Telemetry();
let unitBuys = 0,
  unitSells = 0;
for (let i = 0; i < 100; i++) {
  const c = await paperCase(),
    config = await json("config/strategy.json");
  Object.assign(config, { tradeSol: 0.00001, minLiquiditySol: 0 });
  const s = initializeMarketLedger(initial(config));
  s.running = true;
  const e = new RealMarketPaper(new Store(s, undefined, executionMetrics));
  const result = await e.review(c.state, c.buy, c.sell, c.fees, c.version);
  if (!("positionId" in result)) throw Error("Unit eligibility case rejected");
  unitBuys++;
  const p = e.store.state.positions[0];
  await e.exit(
    p.id,
    c.state,
    c.adapter.quote(c.state, "sell", BigInt(p.market!.atoms), 100),
    c.fees,
    c.version,
  );
  unitSells++;
}
const c = await paperCase(),
  burstMetrics = new Telemetry(),
  paper = new RealMarketPaper(
    new Store(
      initializeMarketLedger(initial(await json("config/strategy.json"))),
      undefined,
      burstMetrics,
    ),
  );
const service = new MarketService(paper, c.rpc, burstMetrics);
const jobs = Array.from({ length: 64 }, (_, i) =>
  service.evaluate({ ...c.state.launch, id: `unit-burst-${i}` }),
);
const outcomes = await Promise.allSettled(jobs);
let duplicates = 0;
for (let i = 0; i < 8; i++) {
  const r = await service.evaluate({
    ...c.state.launch,
    id: `unit-burst-${i}`,
  });
  if ("duplicate" in r) duplicates++;
}
await service.close();
const fixtures = Object.fromEntries(
  await Promise.all(
    ["pump", "pumpswap", "raydium-cpmm", "meteora-dlmm"].map(async (venue) => [
      venue,
      createHash("sha256")
        .update(await readFile(`docs/phase4/fixtures/${venue}-market.json`))
        .digest("hex"),
    ]),
  ),
);
await writeFile(
  "docs/phase4/market-benchmark.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      node: process.version,
      scope:
        "Offline replay of one recorded market snapshot per venue, repeated 100 times in three runs; no live RPC latency, distinct-launch throughput or actual mainnet fills measured. Cold Store per historical evaluation, including validation and fail-closed review. Unit execution uses explicitly simulated freshness/concentration/fee/deployment safety evidence, with recorded Pump reserves. Burst has synthetic event IDs/freshness, recorded accounts, unknown mandatory safety and no fills.",
      rows,
      unitExecution: {
        unitBuys,
        unitSells,
        realMarketFills: 0,
        telemetry: executionMetrics.report(),
      },
      burst: {
        offered: 64,
        admitted: outcomes.filter((o) => o.status === "fulfilled").length,
        admissionRejected: outcomes.filter((o) => o.status === "rejected")
          .length,
        duplicates,
        realMarketFills: 0,
        telemetry: burstMetrics.report(),
      },
      fixtures,
    },
    null,
    2,
  ) + "\n",
);
