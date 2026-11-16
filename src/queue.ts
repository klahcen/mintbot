import { telemetry, type Telemetry } from "./telemetry.js";
export type QueueResult<T> =
  | { accepted: true; value: T }
  | { accepted: false; reason: "capacity" | "closed" };
/** Serial FIFO with the existing monitor's total pending (waiting + active) admission bound. */
export class MeasuredQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private closed = false;
  constructor(
    private readonly capacity = 100,
    private readonly metrics: Telemetry = telemetry,
    private readonly name = "observations",
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw Error("Invalid queue capacity");
  }
  submit<T>(
    task: () => Promise<T> | T,
    receivedAt = this.metrics.now(),
  ): Promise<QueueResult<T>> {
    this.metrics.increment(`${this.name}.offered`);
    if (this.closed || this.pending >= this.capacity) {
      this.metrics.increment(`${this.name}.dropped`);
      return Promise.resolve({
        accepted: false,
        reason: this.closed ? "closed" : "capacity",
      });
    }
    this.pending++;
    this.metrics.increment(`${this.name}.admitted`);
    this.metrics.adjustGauge(`${this.name}.pending`, 1);
    this.metrics.adjustGauge(`${this.name}.queue_depth`, 1);
    const enqueued = this.metrics.now();
    const operation = this.tail.then(async () => {
      this.metrics.adjustGauge(`${this.name}.queue_depth`, -1);
      this.metrics.adjustGauge(`${this.name}.in_flight`, 1);
      this.metrics.observe(
        `${this.name}.queue_wait_ms`,
        this.metrics.now() - enqueued,
      );
      const end = this.metrics.start(`${this.name}.processing_ms`);
      try {
        const value = await task();
        this.metrics.increment(`${this.name}.completed`);
        return { accepted: true as const, value };
      } catch (error) {
        this.metrics.increment(`${this.name}.errors`);
        throw error;
      } finally {
        end();
        this.metrics.observe(
          `${this.name}.end_to_end_ms`,
          this.metrics.now() - receivedAt,
        );
        this.pending--;
        this.metrics.adjustGauge(`${this.name}.pending`, -1);
        this.metrics.adjustGauge(`${this.name}.in_flight`, -1);
      }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }
  async drain() {
    await this.tail;
  }
  close() {
    this.closed = true;
  }
}
