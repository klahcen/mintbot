import { Telemetry } from "./telemetry.js";
import type { Connection, Transaction } from "@solana/web3.js";
export type ExecutionRecord = {
  id: string;
  signature?: string;
  status:
    | "prepared"
    | "submitted"
    | "confirmed"
    | "failed"
    | "unresolved"
    | "expired-unobserved";
  error?: string;
};
export interface ExecutionJournal {
  get(id: string): Promise<ExecutionRecord | undefined>;
  save(record: ExecutionRecord): Promise<void>;
}
// Not wired to live trading. A persistent journal and exclusive single-writer owner are mandatory.
export class RpcExecutor {
  private active = new Map<string, Promise<ExecutionRecord>>();
  constructor(
    private connection: Connection,
    private journal: ExecutionJournal,
    public readonly metrics: Telemetry = new Telemetry(),
  ) {}
  execute(
    id: string,
    tx: Transaction,
    lastValidBlockHeight: number,
  ): Promise<ExecutionRecord> {
    const current = this.active.get(id);
    if (current) return current;
    const pending = this.run(id, tx, lastValidBlockHeight).finally(() =>
      this.active.delete(id),
    );
    this.active.set(id, pending);
    return pending;
  }
  private async run(
    id: string,
    tx: Transaction,
    lastValidBlockHeight: number,
  ): Promise<ExecutionRecord> {
    const prior = await this.journal.get(id);
    if (prior) return prior;
    const record: ExecutionRecord = { id, status: "prepared" };
    const bs58 = await import("bs58");
    if (!tx.signature) throw Error("Unsigned transaction");
    record.signature = bs58.default.encode(tx.signature);
    await this.journal.save(record);
    try {
      const simulationBegin = this.metrics.now();
      const simulation = await this.metrics.rpc("simulateTransaction", () =>
        this.connection.simulateTransaction(tx),
      );
      this.metrics.observe(
        "simulation_ms",
        this.metrics.now() - simulationBegin,
      );
      if (simulation.value.err) {
        record.status = "failed";
        record.error = "Preflight simulation failed";
        await this.journal.save(record);
        return record;
      }
      record.status = "submitted";
      await this.journal.save(record);
      const submissionBegin = this.metrics.now();
      await this.metrics.rpc("sendRawTransaction", () =>
        this.connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 2,
        }),
      );
      this.metrics.observe(
        "submission_ms",
        this.metrics.now() - submissionBegin,
      );
    } catch {
      record.status = "unresolved";
      record.error =
        "Submission outcome unknown; reconcile by original signature";
      await this.journal.save(record);
      return record;
    }
    return this.reconcile(record, lastValidBlockHeight);
  }
  async reconcile(
    record: ExecutionRecord,
    lastValidBlockHeight: number,
  ): Promise<ExecutionRecord> {
    if (!record.signature) throw Error("Missing signature");
    const signature = record.signature;
    const confirmationBegin = this.metrics.now();
    for (let n = 0; n < 20; n++) {
      try {
        const result = await this.metrics.rpc("getSignatureStatuses", () =>
          this.connection.getSignatureStatuses([signature], {
            searchTransactionHistory: true,
          }),
        );
        const s = result.value[0];
        if (s?.err) {
          record.status = "failed";
          break;
        }
        if (
          s?.confirmationStatus === "confirmed" ||
          s?.confirmationStatus === "finalized"
        ) {
          record.status = "confirmed";
          break;
        }
        if (
          (await this.metrics.rpc("getBlockHeight", () =>
            this.connection.getBlockHeight("confirmed"),
          )) > lastValidBlockHeight
        ) {
          record.status = "expired-unobserved";
          break;
        }
      } catch {
        record.status = "unresolved";
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    this.metrics.observe(
      "reconciliation_ms",
      this.metrics.now() - confirmationBegin,
    );
    if (record.status === "submitted") record.status = "unresolved";
    await this.journal.save(record);
    return record;
  }
}
