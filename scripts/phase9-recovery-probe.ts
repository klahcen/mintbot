/** Controlled finalized history probe, separate from actual disconnect coverage and trading. */
import { mkdir, writeFile } from "node:fs/promises";
import { HttpRecoveryRpc, recoverGap, type RecoveryRpc } from "../src/backfill.js";
import { VERIFIED_PROGRAMS } from "../src/chain.js";
import { AsyncEventJournal } from "../src/async-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import { Telemetry } from "../src/telemetry.js";
if (!process.argv.includes("--run")) throw Error("Explicit --run required");
const directory = `docs/phase9/recovery-probe-${Date.now()}`;
await mkdir(directory);
const endpoint = process.env.SOLANA_SECONDARY_RPC_URL ?? "https://solana-rpc.publicnode.com";
const rpc = new HttpRecoveryRpc(endpoint, 5000, 4 * 1024 * 1024, "finalized");
const program = VERIFIED_PROGRAMS.find(p => p.name === "meteora-dlmm")!;
const captured: unknown[] = [], metrics = new Telemetry();
let capturedBytes = 0;
function retain(value: unknown) {
  capturedBytes += Buffer.byteLength(JSON.stringify(value));
  if (capturedBytes > 16 * 1024 * 1024) throw Error("Recovery capture bound");
  captured.push(value);
}
const reader: RecoveryRpc = {
  getSlot: async () => { const result = await rpc.getSlot(); retain({ method: "getSlot", result }); return result; },
  getSignaturesForAddress: async (address, options) => { const result = await rpc.getSignaturesForAddress(address, options); retain({ method: "getSignaturesForAddress", address, options, result }); return result; },
  getTransaction: async signature => { const result = await rpc.getTransaction(signature); retain({ method: "getTransaction", signature, result }); return result; },
};
const journal = await AsyncEventJournal.open({ path: `${directory}/ingestion.wal` }, metrics);
const committed: string[] = [], pipeline = new EventIngestion({ journal, metrics, enrich: async () => [], strategy: async event => { committed.push(event.signature); } });
let result: unknown, issue: string | undefined;
try {
  const rows = await reader.getSignaturesForAddress(program.address, { limit: 10 });
  const row = rows.filter(r => r.err === null).at(-1);
  if (!row) throw Error("No successful finalized anchor supplied");
  const anchor = { signature: row.signature, slot: row.slot };
  pipeline.recordGap(program.name, row.slot, row.slot, "controlled-real-history-probe", anchor);
  const options = { pageSize: 10, maxPages: 5, maxTransactions: 40, overlapSlots: 0, maxWindowSlots: 100, retries: 0, deadlineMs: 20000 };
  const first = await recoverGap(pipeline, reader, program.name, anchor, options);
  const once = [...committed];
  const second = first.status === "recovered" ? await recoverGap(pipeline, reader, program.name, anchor, options) : undefined;
  result = { anchor, options, first, second, decisionsAfterFirst: once.length, totalDecisions: committed.length, duplicateLogicalDecisions: committed.length - new Set(committed).size };
} catch (error) { issue = (error as Error).message; }
await pipeline.close();
await writeFile(`${directory}/evidence.json`, JSON.stringify({ generatedAt: new Date().toISOString(), provider: new URL(endpoint).host, program, result, issue, captured, journal: journal.status(), telemetry: metrics.report(), liveTrading: false, scope: "Controlled current finalized-history scan of a another program and optional overlap replay, with original transaction bytes. Not an observed WebSocket outage, not independent complete history, not a creation or market eligibility proof, and not recovery of the older Pump gap. Strategy callback counts are inspection only; no paper engine or wallet is attached." }, null, 2) + "\n");
console.log(JSON.stringify({ directory, result, issue }));
