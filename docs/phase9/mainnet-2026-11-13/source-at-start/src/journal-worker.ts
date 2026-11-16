import { parentPort, workerData } from "node:worker_threads";
import { performance } from "node:perf_hooks";
import { statfsSync } from "node:fs";
import { dirname } from "node:path";
import { EventJournal } from "./event-journal.js";
const port = parentPort!;
const journal = new EventJournal({
  ...workerData.journal,
  durable: false,
  checksummed: true,
  checkpointDurable: true,
});
let batches = 0,
  records = 0;
const stats = () => {
  const fs = statfsSync(dirname(workerData.journal.path));
  return {
    walBytes: journal.status().walBytes,
    truncatedTailBytes: journal.status().truncatedTailBytes,
    diskAvailableBytes: fs.bavail * fs.bsize,
    batches,
    records,
  };
};
try {
  journal.syncDurable();
  port.postMessage({
    ready: true,
    snapshot: journal.snapshotRecord(),
    stats: stats(),
  });
} catch (e) {
  journal.close();
  throw e;
}
port.on(
  "message",
  (message: {
    batch: number;
    records?: unknown[];
    compact?: boolean;
    close?: boolean;
  }) => {
    try {
      const fault = workerData.testFault;
      if (fault && batches >= fault.afterBatches && fault.point === "write")
        throw Object.assign(Error("Injected persistence failure"), {
          code: fault.code,
        });
      const t = performance.now();
      for (const record of message.records ?? []) {
        journal.persistRecord(record);
        records++;
      }
      if (message.compact) journal.compact();
      const appendMs = performance.now() - t;
      if (fault && batches >= fault.afterBatches && fault.point === "sync")
        throw Object.assign(Error("Injected sync failure"), {
          code: fault.code,
        });
      const s = performance.now();
      journal.syncDurable();
      const syncMs = performance.now() - s;
      batches++;
      const state = stats();
      if (message.close) journal.close();
      port.postMessage({
        batch: message.batch,
        stats: state,
        appendMs,
        syncMs,
      });
      if (workerData.journal.testDuplicateAcks)
        port.postMessage({
          batch: message.batch,
          stats: state,
          appendMs,
          syncMs,
        });
      if (message.close) port.close();
    } catch (e) {
      try {
        journal.close();
      } catch {}
      port.postMessage({
        fatal: true,
        code: (e as NodeJS.ErrnoException).code ?? "JOURNAL_FAILURE",
      });
      port.close();
    }
  },
);
