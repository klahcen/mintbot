import { telemetry, type Telemetry } from "./telemetry.js";
interface Task {
  run: () => Promise<unknown> | unknown;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  priority: number;
  received: number;
  enqueued: number;
}
/** Fixed total admission and worker count. Yields between batches so receipts/timers are not starved. */
export class BoundedStage {
  private readonly waiting: Task[] = [];
  private active = 0;
  private closed = false;
  private scheduled = false;
  private batch = 0;
  private priorityRun = 0;
  private priorityQueued = 0;
  private idle: Promise<void> = Promise.resolve();
  private resolveIdle: () => void = () => {};
  constructor(
    readonly name: string,
    readonly capacity = 128,
    readonly concurrency = 1,
    private metrics: Telemetry = telemetry,
  ) {
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      !Number.isSafeInteger(concurrency) ||
      concurrency < 1 ||
      concurrency > capacity
    )
      throw Error("Invalid stage bounds");
  }
  get pending() {
    return this.waiting.length + this.active;
  }
  trySubmit<T>(
    run: () => Promise<T> | T,
    received = this.metrics.now(),
    priority: 0 | 1 | 2 = 0,
  ): Promise<T> | undefined {
    this.metrics.increment(`${this.name}.offered`);
    if (this.closed || this.pending >= this.capacity) {
      this.metrics.increment(`${this.name}.backpressure`);
      return undefined;
    }
    if (this.pending === 0)
      this.idle = new Promise((resolve) => (this.resolveIdle = resolve));
    if (priority > 0) this.priorityQueued++;
    this.metrics.increment(`${this.name}.admitted`);
    this.metrics.adjustGauge(`${this.name}.pending`, 1);
    this.metrics.adjustGauge(`${this.name}.queue_depth`, 1);
    const result = new Promise<T>((resolve, reject) =>
      this.waiting.push({
        run,
        priority,
        resolve: resolve as (v: unknown) => void,
        reject,
        received,
        enqueued: this.metrics.now(),
      }),
    );
    this.schedule();
    return result;
  }
  private schedule() {
    if (
      this.scheduled ||
      !this.waiting.length ||
      this.active >= this.concurrency
    )
      return;
    this.scheduled = true;
    const run = () => {
      this.scheduled = false;
      this.pump();
    };
    if (++this.batch % 32 === 0) setImmediate(run);
    else queueMicrotask(run);
  }
  private pump() {
    while (this.active < this.concurrency && this.waiting.length) {
      // Priority affects queued tasks only; every ninth dispatch serves the oldest to bound starvation.
      let index = 0;
      if (this.priorityRun++ < 8 && this.priorityQueued > 0) {
        for (let i = 1; i < this.waiting.length; i++)
          if (this.waiting[i].priority > this.waiting[index].priority) index = i;
      } else this.priorityRun = 0;
      const task = this.waiting.splice(index, 1)[0];
      if (task.priority > 0) this.priorityQueued--;
      this.active++;
      this.metrics.adjustGauge(`${this.name}.queue_depth`, -1);
      this.metrics.adjustGauge(`${this.name}.in_flight`, 1);
      this.metrics.observe(
        `${this.name}.queue_wait_ms`,
        this.metrics.now() - task.enqueued,
      );
      const end = this.metrics.start(`${this.name}.processing_ms`);
      Promise.resolve()
        .then(task.run)
        .then(
          (value) => {
            this.metrics.increment(`${this.name}.completed`);
            task.resolve(value);
          },
          (error) => {
            this.metrics.increment(`${this.name}.errors`);
            task.reject(error);
          },
        )
        .finally(() => {
          end();
          this.metrics.observe(
            `${this.name}.end_to_end_ms`,
            this.metrics.now() - task.received,
          );
          this.active--;
          this.metrics.adjustGauge(`${this.name}.in_flight`, -1);
          this.metrics.adjustGauge(`${this.name}.pending`, -1);
          if (this.pending === 0) this.resolveIdle();
          this.schedule();
        });
    }
  }
  async drain() {
    await this.idle;
  }
  close() {
    this.closed = true;
  }
}
