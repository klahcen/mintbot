import { performance } from "node:perf_hooks";
export type MonotonicClock = () => number;
export interface HistogramSnapshot {
  count: number;
  samples: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}
interface Series {
  values: number[];
  cursor: number;
  count: number;
}
/** Bounded rolling samples; count includes all observations, quantiles describe retained samples. */
export class Histograms {
  private readonly values = new Map<string, Series>();
  constructor(
    private readonly sampleLimit = 10000,
    protected readonly enabled = true,
  ) {
    if (!Number.isSafeInteger(sampleLimit) || sampleLimit < 1)
      throw Error("Invalid histogram sample limit");
  }
  observe(name: string, ms: number) {
    if (!this.enabled || !Number.isFinite(ms) || ms < 0) return;
    const series = this.values.get(name) ?? { values: [], cursor: 0, count: 0 };
    series.count++;
    if (series.values.length < this.sampleLimit) series.values.push(ms);
    else {
      series.values[series.cursor] = ms;
      series.cursor = (series.cursor + 1) % this.sampleLimit;
    }
    this.values.set(name, series);
  }
  snapshot(): Record<string, HistogramSnapshot> {
    return Object.fromEntries(
      [...this.values].map(([name, s]) => {
        const a = [...s.values].sort((a, b) => a - b);
        // Preserve the original floor((n-1)*p) percentile convention.
        return [
          name,
          {
            count: s.count,
            samples: a.length,
            p50: a[Math.floor((a.length - 1) * 0.5)]!,
            p95: a[Math.floor((a.length - 1) * 0.95)]!,
            p99: a[Math.floor((a.length - 1) * 0.99)]!,
            max: a[a.length - 1]!,
          },
        ];
      }),
    );
  }
}
export interface TelemetryOptions {
  clock?: MonotonicClock;
  sampleLimit?: number;
  enabled?: boolean;
}
/** A process-local monotonic clock. Never subtract chain/block timestamps or persisted timestamps. */
export class Telemetry extends Histograms {
  private readonly clock: MonotonicClock;
  private readonly started: number;
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<
    string,
    { current: number; peak: number }
  >();
  constructor(options: TelemetryOptions = {}) {
    super(options.sampleLimit ?? 10000, options.enabled ?? true);
    this.clock = options.clock ?? (() => performance.now());
    this.started = this.clock();
  }
  now() {
    return this.clock();
  }
  increment(name: string, amount = 1) {
    if (this.enabled && Number.isFinite(amount) && amount >= 0)
      this.counters.set(name, (this.counters.get(name) ?? 0) + amount);
  }
  adjustGauge(name: string, delta: number) {
    if (!this.enabled) return;
    const prior = this.gauges.get(name) ?? { current: 0, peak: 0 };
    const current = prior.current + delta;
    if (!Number.isFinite(current) || current < 0)
      throw Error("Invalid metric gauge transition");
    this.gauges.set(name, { current, peak: Math.max(prior.peak, current) });
  }
  start(name: string) {
    const begin = this.now();
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.observe(name, this.now() - begin);
    };
  }
  measure<T>(name: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const end = this.start(name);
    try {
      return fn();
    } finally {
      end();
    }
  }
  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    const end = this.start(name);
    try {
      return await fn();
    } finally {
      end();
    }
  }
  async rpc<T>(method: string, fn: () => Promise<T>): Promise<T> {
    this.increment("rpc.calls");
    try {
      return await this.measureAsync(`rpc.${method}_ms`, fn);
    } catch (error) {
      this.increment("rpc.errors");
      throw error;
    }
  }
  report() {
    return {
      uptimeMs: Math.max(0, this.now() - this.started),
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(
        [...this.gauges].map(([k, v]) => [k, { ...v }]),
      ),
      histograms: this.snapshot(),
    };
  }
}
export const telemetry = new Telemetry();

export async function notify(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN,
    chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: message.slice(0, 1000) }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw Error("Telegram notification failed");
}
