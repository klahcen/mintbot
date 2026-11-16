import { z } from "zod";
import { telemetry, type Telemetry } from "./telemetry.js";
import { mkdir, readFile, rename, writeFile, open } from "node:fs/promises";
import { dirname } from "node:path";
import {
  StateSchema,
  SEEN_LIMIT,
  createStateSchema,
  LaunchSchema,
  TradeSchema,
  AlertSchema,
  MarketReviewSchema,
  type State,
  type Strategy,
} from "./model.js";
export function initial(strategy: Strategy, balanceSol = 10): State {
  return {
    version: 1,
    mode: "paper",
    running: false,
    killed: false,
    balanceSol,
    day: new Date().toISOString().slice(0, 10),
    dailySpendSol: 0,
    failures: 0,
    strategies: [strategy],
    launches: [],
    positions: [],
    trades: [],
    alerts: [],
    seen: [],
    pendingLaunches: [],
    metrics: {},
    rpc: { status: "not-configured" },
    realizedPnlSol: 0,
  };
}
function freezeDeep(value: unknown, seen = new WeakSet<object>()): void {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const child of Object.values(value)) freezeDeep(child, seen);
  if (!Object.isFrozen(value)) Object.freeze(value);
}
function plainData(value: unknown, visiting = new WeakSet<object>()): boolean {
  if (value === null || typeof value !== "object")
    return typeof value !== "function";
  if (visiting.has(value)) return false;
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null)
    return false;
  visiting.add(value);
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value),
  ))
    if (
      descriptor.get ||
      descriptor.set ||
      !plainData(descriptor.value, visiting)
    )
      return false;
  visiting.delete(value);
  return true;
}
function immutableRows<T>(
  schema: z.ZodType<T>,
  shared: WeakSet<object>,
): z.ZodType<T> {
  const valid = new WeakSet<object>();
  return z.custom<T>((value) => {
    if (!value || typeof value !== "object") return false;
    if (valid.has(value)) return true;
    if (!schema.safeParse(value).success) return false;
    if (plainData(value)) {
      freezeDeep(value);
      valid.add(value);
      shared.add(value);
    }
    return true;
  });
}
export class Store {
  private persistenceUncertain = false;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private readonly sharedRows = new WeakSet<object>();
  private readonly fastSchema = createStateSchema({
    // Equivalent dense string-array constraint without per-element Zod allocation in the trusted hot path.
    seen: z.custom<string[]>((value) => {
      if (!Array.isArray(value) || value.length > SEEN_LIMIT) return false;
      for (let i = 0; i < value.length; i++) if (typeof value[i] !== "string") return false;
      return true;
    }),
    launch: immutableRows(LaunchSchema, this.sharedRows),
    trade: immutableRows(TradeSchema, this.sharedRows),
    alert: immutableRows(AlertSchema, this.sharedRows),
    review: immutableRows(MarketReviewSchema, this.sharedRows),
  });
  private history<T extends object>(rows: T[]): T[] {
    return rows.map((row) =>
      this.sharedRows.has(row) ? row : structuredClone(row),
    );
  }
  constructor(
    public state: State,
    private path?: string,
    public readonly metrics: Telemetry = telemetry,
    private readonly capacity = 1024,
    private readonly durable = false,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      throw Error("Invalid Store queue capacity");
    StateSchema.parse(state);
    this.fastSchema.parse(state);
  }
  transaction<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
    return this.commit(fn, false);
  }
  /** Trusted engine mutations: histories share validated frozen rows; active balances/positions are isolated. */
  paperTransaction<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
    return this.commit(fn, true);
  }
  private async commit<T>(
    fn: (s: State) => T | Promise<T>,
    paper: boolean,
  ): Promise<T> {
    if (this.pending >= this.capacity) {
      this.metrics.increment("store.rejected");
      throw Error("Store backlog capacity exceeded");
    }
    this.pending++;
    const enqueued = this.metrics.now();
    this.metrics.adjustGauge("store.queue_depth", 1);
    const end = this.metrics.start("store.transaction_ms");
    const op = this.tail.then(async () => {
      this.metrics.adjustGauge("store.queue_depth", -1);
      this.metrics.adjustGauge("store.in_flight", 1);
      this.metrics.observe(
        "store.queue_wait_ms",
        this.metrics.now() - enqueued,
      );
      let published = false;
      try {
        if (this.persistenceUncertain)
          throw Error(
            "Durable Store publication uncertain; restart and inspect persisted state",
          );
        const next = this.metrics.measure("store.clone_ms", () =>
          paper
            ? {
                ...this.state,
                ...(this.state.marketLedger
                  ? { marketLedger: { ...this.state.marketLedger } }
                  : {}),
                ...(this.state.marketReviews
                  ? { marketReviews: this.history(this.state.marketReviews) }
                  : {}),
                ...(this.state.marketLifecycle
                  ? { marketLifecycle: structuredClone(this.state.marketLifecycle) } : {}),
                positions: structuredClone(this.state.positions),
                strategies: structuredClone(this.state.strategies),
                launches: this.history(this.state.launches),
                trades: this.history(this.state.trades),
                alerts: this.history(this.state.alerts),
                seen: [...this.state.seen],
                pendingLaunches: this.history(this.state.pendingLaunches),
                metrics: { ...this.state.metrics },
                rpc: { ...this.state.rpc },
              }
            : structuredClone(this.state),
        );
        const result = await fn(next);
        this.metrics.measure("store.validation_ms", () =>
          (paper ? this.fastSchema : StateSchema).parse(next),
        );
        const path = this.path;
        if (path) {
          await this.metrics.measureAsync("store.persistence_ms", async () => {
            await mkdir(dirname(path), { recursive: true });
            await writeFile(path + ".tmp", JSON.stringify(next), {
              mode: 0o600,
            });
            if (this.durable) {
              const file = await open(path + ".tmp", "r");
              try {
                await file.sync();
              } finally {
                await file.close();
              }
            }
            await rename(path + ".tmp", path);
            published = true;
            if (this.durable) {
              const directory = await open(dirname(path), "r");
              try {
                await directory.sync();
              } finally {
                await directory.close();
              }
            }
          });
        }
        if (!paper) this.fastSchema.parse(next);
        this.state = next;
        this.metrics.increment("store.committed");
        return result;
      } catch (error) {
        if (this.durable && published) this.persistenceUncertain = true;
        this.metrics.increment("store.errors");
        throw error;
      } finally {
        this.pending--;
        this.metrics.adjustGauge("store.in_flight", -1);
        end();
      }
    });
    this.tail = op.catch(() => {});
    return op;
  }
}
export async function load(
  path: string,
  fallback: State,
  metrics: Telemetry = telemetry,
  durable = false,
) {
  try {
    const s = StateSchema.parse(JSON.parse(await readFile(path, "utf8")));
    s.running = false;
    s.pendingLaunches = [];
    return new Store(s, path, metrics, 1024, durable);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT")
      return new Store(fallback, path, metrics, 1024, durable);
    throw e;
  }
}
