import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { AsyncEventJournal } from "../../src/async-journal.js";
import { initial, load } from "../../src/store.js";
import { StrategySchema } from "../../src/model.js";
import { Engine, syntheticLaunch } from "../../src/engine.js";
const dir = process.argv[2]!;
const journal = await AsyncEventJournal.open({ path: join(dir, "wal") });
const event = {
  program: "pumpswap",
  signature: "kill-owned",
  slot: 1000,
  logs: [],
  failed: false,
  observedAt: Date.now(),
};
const owned = await journal.offerDurable(event);
if (owned.status !== "accepted") throw Error("Ownership failed");
const config = StrategySchema.parse(
    JSON.parse(await readFile("config/strategy.json", "utf8")),
  ),
  store = await load(join(dir, "state.json"), initial(config));
await store.transaction((s) => {
  s.running = true;
});
const quote = syntheticLaunch(777);
quote.id = owned.id;
await new Engine(store).ingest(quote);
process.send?.({ ready: true });
await new Promise(() => {});
