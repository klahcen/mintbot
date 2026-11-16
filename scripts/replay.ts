import { telemetry } from "../src/telemetry.js";
import { readFile } from "node:fs/promises";
import { StrategySchema } from "../src/model.js";
import { initial, Store } from "../src/store.js";
import { Engine, syntheticLaunch } from "../src/engine.js";
if (process.argv.includes("--benchmark")) {
  await import("./benchmark.js");
} else {
  const c = StrategySchema.parse(
    JSON.parse(await readFile("config/strategy.json", "utf8")),
  );
  const s = initial(c);
  s.running = true;
  const store = new Store(s);
  const e = new Engine(store);
  await e.ingest(syntheticLaunch(1));
  await e.mark("synthetic-mint-1", 0.0002, 100);
  await e.ingest(syntheticLaunch(2));
  await e.mark("synthetic-mint-2", 0.00005, 100);
  console.log(
    JSON.stringify(
      {
        scope:
          "SYNTHETIC paper simulation; not historical or mainnet executions",
        balanceSol: store.state.balanceSol,
        realizedPnlSol: store.state.realizedPnlSol,
        trades: store.state.trades,
        telemetry: telemetry.report(),
      },
      null,
      2,
    ),
  );
}
