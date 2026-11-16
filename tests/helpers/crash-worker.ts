import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { EventJournal, eventIdentity } from "../../src/event-journal.js";
import { load, initial } from "../../src/store.js";
import { Engine, syntheticLaunch } from "../../src/engine.js";
import { StrategySchema } from "../../src/model.js";
const dir = process.argv[2]!;
const config = StrategySchema.parse(
  JSON.parse(await readFile("config/strategy.json", "utf8")),
);
const journal = new EventJournal({ path: join(dir, "work.wal") });
const observation = {
  program: "pumpswap",
  signature: "crash-event",
  slot: 1000,
  logs: [],
  failed: false,
  observedAt: Date.now(),
};
journal.offer(observation);
const store = await load(join(dir, "state.json"), initial(config));
await store.transaction((s) => {
  s.running = true;
});
const launch = syntheticLaunch(1);
launch.id = eventIdentity(observation);
await new Engine(store).ingest(launch);
process.send?.({ committed: true });
setInterval(() => {}, 1000);
