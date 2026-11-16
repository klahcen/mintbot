import { telemetry } from "../src/telemetry.js";
import { Connection } from "@solana/web3.js";
import {
  VERIFIED_PROGRAMS,
  inspectTransaction,
  scanMint,
} from "../src/chain.js";
const rpc = process.env.SOLANA_RPC_URL;
if (!rpc) throw Error("Set SOLANA_RPC_URL explicitly for read-only access");
const connection = new Connection(rpc, "confirmed");
const [command, arg] = process.argv.slice(2);
if (command === "transaction") {
  if (!arg) throw Error("Supply signature");
  console.log(
    JSON.stringify(await inspectTransaction(connection, arg), null, 2),
  );
} else if (command === "mint") {
  if (!arg) throw Error("Supply mint address");
  console.log(JSON.stringify(await scanMint(connection, arg), null, 2));
} else {
  const endpoint = process.env.SOLANA_WS_URL;
  if (!endpoint) throw Error("Set SOLANA_WS_URL");
  const names = (
    process.env.MONITOR_PROGRAMS ?? "pump,pumpswap,raydium-cpmm,meteora-dlmm"
  ).split(",");
  const programs = names.map((name) => {
    const program = VERIFIED_PROGRAMS.find((p) => p.name === name);
    if (!program) throw Error(`Unverified program name: ${name}`);
    return program;
  });
  const { createMonitoringService } = await import("../src/monitor-service.js");
  const service = await createMonitoringService({
    programs,
    websocketUrls: [endpoint, process.env.SOLANA_SECONDARY_WS_URL].filter(
      (v): v is string => !!v,
    ),
    rpcUrl: rpc,
    journal: {
      path: process.env.INGESTION_JOURNAL_PATH ?? "data/monitor-ingestion.wal",
    },
    rawPath: "data/observations.jsonl",
    discoveryPath: "data/discoveries.jsonl",
    onObservation: (event) =>
      console.log(
        JSON.stringify({
          kind: "program-observation",
          program: event.program,
          signature: event.signature,
          slot: event.slot,
          failed: event.failed,
        }),
      ),
    metrics: telemetry,
    onVerifiedLaunch: (launch) =>
      console.log(
        JSON.stringify({
          kind: "verified-protocol-launch",
          launch,
          executionEligible: false,
        }),
      ),
    onDiscovery: (launch) =>
      console.log(
        JSON.stringify({
          kind: "pump-launch",
          launch,
          executionEligible: false,
          reason: "Risk, price and liquidity enrichment required",
        }),
      ),
  });
  service.start();
  const stop = async () => {
    await service.close();
    console.error(
      JSON.stringify({
        kind: "telemetry",
        ...telemetry.report(),
        ingestion: service.snapshot(),
      }),
    );
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}
