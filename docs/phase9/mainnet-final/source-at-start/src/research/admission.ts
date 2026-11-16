import { BoundedStage } from "../stages.js";
import { EventIngestion } from "../ingestion.js";
import type { ProgramObservation } from "../chain.js";
import { Telemetry } from "../telemetry.js";

/** Bound socket bursts before they can flood synchronous gap metadata writes.
 * Await flush even for refusals: their gap records also need durable backpressure.
 */
export class ResearchAdmission {
  private stage: BoundedStage;
  private bytes = 0;
  constructor(private pipeline: EventIngestion, metrics: Telemetry,
    readonly capacity = 128, readonly maxBytes = 4 * 1024 * 1024) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 16 * 1024 * 1024)
      throw Error("Research admission byte bound");
    this.stage = new BoundedStage("research.admission", capacity, Math.min(8, capacity), metrics);
  }
  get pending() { return this.stage.pending; }
  get pendingBytes() { return this.bytes; }
  offer(event: ProgramObservation) {
    const bytes = Buffer.byteLength(JSON.stringify(event));
    if (this.bytes + bytes > this.maxBytes) return undefined;
    const task = this.stage.trySubmit(async () => {
      try {
        const result = await this.pipeline.acceptDurable(event);
        await this.pipeline.journal.flush();
        const fatal = this.pipeline.status().fatal;
        if (fatal) throw Error(fatal);
        return result;
      } finally { this.bytes -= bytes; }
    }, event.receivedAtMonoMs);
    if (task) this.bytes += bytes;
    return task;
  }
  close() { this.stage.close(); }
  async drain() { await this.stage.drain(); }
}
