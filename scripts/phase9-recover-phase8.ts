/** Bounded attempt against a retained Phase8 anchor; insufficient history stays incomplete. */
import { readFile, mkdir, writeFile, open, rename } from "node:fs/promises";
import { AsyncEventJournal } from "../src/async-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import { HttpRecoveryRpc, recoverGap } from "../src/backfill.js";
import { Telemetry } from "../src/telemetry.js";
if (!process.argv.includes("--run")) throw Error("Explicit --run required");
const previous = JSON.parse(await readFile("docs/phase8/mainnet/evidence.json", "utf8"));
const directory = `docs/phase9/phase8-recovery-${Date.now()}`;
await mkdir(directory);
const metrics = new Telemetry(), journal = await AsyncEventJournal.open({ path: `${directory}/ingestion.wal` }, metrics);
const pipeline = new EventIngestion({ journal, metrics, enrich: async () => [], strategy: async () => { /* historical inspection never enters a strategy */ } });
const anchor = previous.journal.anchors.pump;
// This is the LAST retained selected-candidate anchor, not an invented anchor
// preceding the first outage; coverage of earlier outages cannot be certified.
pipeline.recordGap("pump", anchor.slot - 32, anchor.slot, "phase8-last-retained-anchor-only", anchor);
const endpoint = process.env.SOLANA_SECONDARY_RPC_URL ?? "https://solana-rpc.publicnode.com";
const progress: unknown[] = [];
const result = await recoverGap(pipeline, new HttpRecoveryRpc(endpoint, 5000, 4 * 1024 * 1024, "finalized"), "pump", anchor, {
  pageSize: 20, maxPages: 2, maxTransactions: 20, maxWindowSlots: 2000, retries: 0, deadlineMs: 15000,
  onProgress: async page => {
    progress.push(page);
    const file = await open(`${directory}/progress.tmp`, "w", 0o600);
    try { await file.writeFile(JSON.stringify(progress)); await file.sync(); } finally { await file.close(); }
    await rename(`${directory}/progress.tmp`, `${directory}/progress.json`);
    const dir = await open(directory, "r"); try { await dir.sync(); } finally { await dir.close(); }
  },
});
await pipeline.close();
await writeFile(`${directory}/evidence.json`, JSON.stringify({ generatedAt: new Date().toISOString(), provider: new URL(endpoint).host, originalAnchor: anchor, originalTransportGapRecords: previous.gaps, result, progress, journal: journal.status(), telemetry: metrics.report(), liveTrading: false, scope: "Bounded current finalized history attempt from last selected Phase8 anchor; cannot prove earlier disconnect coverage or public RPC completeness. No historical trading." }, null, 2) + "\n");
console.log(JSON.stringify({ directory, result }));
