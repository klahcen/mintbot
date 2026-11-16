import { readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { cpus } from "node:os";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { PublicKey, type Connection } from "@solana/web3.js";
import { Telemetry } from "../src/telemetry.js";
import { MeasuredQueue } from "../src/queue.js";
import { pumpLogs } from "./benchmark-fixtures.js";
import type { ProgramObservation } from "../src/chain.js";

const args = process.argv.slice(2);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i < 0 ? fallback : (args[i + 1] ?? "");
};
const root = resolve(option("--source-root", "."));
const count = Number(option("--events", "1000"));
const repetitions = Number(option("--runs", "3"));
if (!["on", "off"].includes(option("--instrumentation", "on")))
  throw Error("Instrumentation must be on or off");
if (
  !Number.isSafeInteger(count) ||
  count < 16 ||
  count > 10000 ||
  !Number.isSafeInteger(repetitions) ||
  repetitions < 1 ||
  repetitions > 20
)
  throw Error("Use 16..10000 events and 1..20 runs");
const modules = await Promise.all(
  ["engine", "store", "chain", "model"].map(
    (name) => import(pathToFileURL(join(root, "src", name + ".ts")).href),
  ),
);
const [engineModule, storeModule, chainModule, modelModule] = modules as [
  typeof import("../src/engine.js"),
  typeof import("../src/store.js"),
  typeof import("../src/chain.js"),
  typeof import("../src/model.js"),
];
const config = modelModule.StrategySchema.parse(
  JSON.parse(await readFile(join(root, "config/strategy.json"), "utf8")),
);
const hashes: Record<string, string> = {};
for (const name of ["engine", "store", "chain", "risk", "telemetry"])
  hashes[name] = createHash("sha256")
    .update(await readFile(join(root, "src", name + ".ts")))
    .digest("hex");
const fixture = JSON.parse(
  await readFile(
    new URL(
      "../docs/fixtures/mainnet-pumpswap-transaction.json",
      import.meta.url,
    ),
    "utf8",
  ),
).result;
for (const ix of fixture.transaction.message.instructions)
  ix.programId = new PublicKey(ix.programId);
for (const group of fixture.meta.innerInstructions ?? [])
  for (const ix of group.instructions)
    ix.programId = new PublicKey(ix.programId);
class Socket extends EventEmitter {
  send(_data: string) {}
  close() {
    this.emit("close");
  }
}
type Scenario = "sequential" | "dedupe-burst" | "overload-reconnect";
async function run(scenario: Scenario, events: number) {
  const external = new Telemetry({ sampleLimit: 10000 });
  const internal = new Telemetry({
    sampleLimit: 10000,
    enabled: option("--instrumentation", "on") !== "off",
  });
  const state = storeModule.initial(config);
  state.running = true;
  const store = new storeModule.Store(state, undefined, internal);
  const engine = new engineModule.Engine(store, internal);
  const capacity = scenario === "overload-reconnect" ? 64 : events + 1;
  const queue = new MeasuredQueue(capacity, external, "replay");
  const logs = pumpLogs(chainModule.VERIFIED_PROGRAMS[0]!.address);
  let socket: Socket;
  let ready: () => void = () => {};
  let receivedAt = external.now();
  let callbacks = 0,
    offered = 0,
    duplicates = 0,
    dropped = 0,
    completed = 0,
    rpcErrors = 0,
    reconnects = 0,
    paperBuys = 0;
  let lastDelivered = "";
  const delivered = new Set<string>();
  const tasks: Promise<unknown>[] = [];
  const monitor = new chainModule.SolanaMonitor(
    "ws://fixture.invalid",
    [chainModule.VERIFIED_PROGRAMS[0]!],
    (event: ProgramObservation) => {
      callbacks++;
      delivered.add(event.signature);
      lastDelivered = event.signature;
      const arrival = receivedAt;
      tasks.push(
        queue
          .submit(async () => {
            external.measure("harness.decoding_ms", () =>
              chainModule.decodeLaunch(event, internal),
            );
            // The historical transaction is inspected independently. A mocked read failure is not used as safety evidence.
            const id = Number(event.signature.slice(8));
            const connection = {
              getParsedTransaction: async () => {
                if (id % 17 === 0)
                  throw Error("injected read-only RPC failure");
                return fixture;
              },
            } as unknown as Pick<Connection, "getParsedTransaction">;
            try {
              await external.measureAsync("harness.rpc_inspection_ms", () =>
                chainModule.inspectTransaction(
                  connection,
                  event.signature,
                  internal,
                ),
              );
            } catch {
              rpcErrors++;
            }
            const launch = engineModule.syntheticLaunch(id);
            const result = await external.measureAsync(
              "harness.paper_ingestion_ms",
              () => engine.ingest(launch),
            );
            if ("positionId" in result) paperBuys++;
            completed++;
          }, arrival)
          .then((result) => {
            if (!result.accepted) dropped++;
          }),
      );
    },
    {
      telemetry: internal,
      maxReconnects: 1,
      reconnectBaseMs: 1,
      onError: (error) => {
        if (error.message === "injected transport error") rpcErrors++;
        else throw error;
      },
    },
    () => {
      socket = new Socket();
      queueMicrotask(() => {
        socket.emit("open");
        socket.emit("message", JSON.stringify({ id: 1, result: 44 }));
        ready();
      });
      return socket;
    },
  );
  const open = new Promise<void>((resolve) => {
    ready = resolve;
  });
  monitor.start();
  await open;
  const emit = (id: number) => {
    const signature = `fixture-${id}`;
    offered++;
    receivedAt = external.now();
    const before = callbacks;
    external.measure("harness.monitor_ingestion_ms", () =>
      socket.emit(
        "message",
        JSON.stringify({
          method: "logsNotification",
          params: {
            subscription: 44,
            result: {
              context: { slot: id + 1 },
              value: { signature, err: null, logs },
            },
          },
        }),
      ),
    );
    if (callbacks === before && delivered.has(signature)) duplicates++;
  };
  const begin = external.now();
  try {
    for (let i = 0; i < events; i++) {
      const id =
        scenario === "sequential"
          ? i
          : Math.floor(i / 4) * 3 + Math.min(i % 4, 2);
      emit(id);
      if (scenario === "sequential") await queue.drain();
      if (scenario === "overload-reconnect" && i === Math.floor(events / 2)) {
        const connected = new Promise<void>((resolve) => {
          ready = resolve;
        });
        socket!.emit("error", new Error("injected transport error"));
        await connected;
        reconnects++;
        const previous = Number(lastDelivered.slice(8));
        emit(previous);
      }
    }
    await Promise.all(tasks);
    await queue.drain();
  } finally {
    monitor.stop();
    queue.close();
  }
  const elapsedMs = external.now() - begin;
  return {
    scenario,
    internalInstrumentationAvailable: store.metrics === internal,
    offered,
    completed,
    duplicates,
    dropped,
    rpcErrors,
    reconnects,
    paperBuys,
    capacity,
    elapsedMs,
    completedEventsPerSecond: completed / (elapsedMs / 1000),
    offeredEventsPerSecond: offered / (elapsedMs / 1000),
    queue: external.report().gauges,
    latencies: external.snapshot(),
    internal: internal.report(),
    conservation: {
      offeredEqualsCompletedDuplicatesDropped:
        offered === completed + duplicates + dropped,
    },
  };
}
// Identical untimed warm-up on both source versions; separate state/collectors, no warm-up samples retained.
for (const scenario of [
  "sequential",
  "dedupe-burst",
  "overload-reconnect",
] as const)
  await run(scenario, 32);
const results = [];
for (let repetition = 0; repetition < repetitions; repetition++)
  for (const scenario of [
    "sequential",
    "dedupe-burst",
    "overload-reconnect",
  ] as const)
    results.push({
      repetition: repetition + 1,
      ...(await run(scenario, count)),
    });
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpus()[0]?.model,
  },
  sourceRoot: root,
  sourceSha256: hashes,
  workload: {
    events: count,
    repetitions,
    instrumentation: option("--instrumentation", "on"),
    warmupEventsPerScenario: 32,
    clock: "node:perf_hooks performance.now (monotonic)",
    scope:
      "Offline replay: synthetic Pump CreateEvent bytes plus independent synthetic paper prices/safety assertions; saved historical swap inspection via mock RPC; no network, signing, disk persistence, chain landing or real fills. Fake WebSocket reconnect uses a real local 1ms timer; no provider recovery claim.",
    percentiles:
      "floor((n-1)*p), rolling last 10000 samples; independent runs; no stage sum (nested spans)",
    harnessSha256: createHash("sha256")
      .update(await readFile(new URL("./benchmark.ts", import.meta.url)))
      .digest("hex"),
  },
  results,
};
const output = JSON.stringify(report, null, 2) + "\n";
const file = option("--output", "");
if (file) await writeFile(file, output);
else process.stdout.write(output);
