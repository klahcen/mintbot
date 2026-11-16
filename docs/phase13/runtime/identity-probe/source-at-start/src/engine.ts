import { type Telemetry } from "./telemetry.js";
import { randomUUID } from "node:crypto";
import { LaunchSchema, type Alert, type Launch, type State } from "./model.js";
import { assess, decision, exitReason } from "./risk.js";
import { Store } from "./store.js";

export const PAPER_FEE_SOL = 0.00001;
export function alert(
  state: State,
  message: string,
  level: Alert["level"] = "info",
) {
  state.alerts.unshift({ id: randomUUID(), at: Date.now(), level, message });
  state.alerts = state.alerts.slice(0, 200);
}

export class Engine {
  constructor(
    public store: Store,
    public readonly metrics: Telemetry = store.metrics,
  ) {}

  async ingest(input: Launch) {
    this.metrics.increment("ingestion.received");
    const end = this.metrics.start("ingestion_ms");
    try {
      const result = await this.ingestImpl(input);
      this.metrics.increment("ingestion.completed");
      if ("positionId" in result)
        this.metrics.increment("ingestion.buys_committed");
      return result;
    } catch (error) {
      this.metrics.increment("ingestion.errors");
      throw error;
    } finally {
      end();
    }
  }
  private async ingestImpl(input: Launch) {
    if (this.store.state.marketLedger)
      throw Error("Synthetic ingestion cannot use a real-market ledger");
    const launch = this.metrics.measure("ingestion.validation_ms", () =>
      LaunchSchema.parse(input),
    );
    let pendingDropped = 0;
    const result = await this.store.paperTransaction((state) => {
      const duplicate = this.metrics.measure("engine.deduplication_ms", () => {
        if (state.seen.includes(launch.id)) return true;
        state.seen.push(launch.id);
        state.seen = state.seen.slice(-10000);
        return false;
      });
      if (duplicate) {
        this.metrics.increment("engine.duplicates");
        return { duplicate: true };
      }
      const risk = assess(launch, this.metrics);
      launch.riskScore = risk.score;
      launch.reasons = risk.reasons;
      state.launches.unshift(launch);
      state.launches = state.launches.slice(0, 200);
      const result = this.consider(state, launch);
      if (
        result.reasons &&
        result.reasons.length === 1 &&
        result.reasons[0] === "Entry delay"
      ) {
        state.pendingLaunches.push(launch);
        pendingDropped = Math.max(0, state.pendingLaunches.length - 200);
        state.pendingLaunches = state.pendingLaunches.slice(-200);
      }
      return result;
    });
    if (pendingDropped)
      this.metrics.increment("strategy.pending_dropped", pendingDropped);
    return result;
  }

  private consider(
    state: State,
    launch: Launch,
  ):
    | { reasons: string[]; positionId?: undefined }
    | { positionId: string; reasons?: undefined } {
    const day = new Date().toISOString().slice(0, 10);
    if (state.day !== day) {
      state.day = day;
      state.dailySpendSol = 0;
    }
    const config = state.strategies[0];
    const reasons = decision(launch, state, config, Date.now(), this.metrics);
    this.metrics.increment("strategy.decisions");
    if (reasons.length) {
      this.metrics.increment("strategy.rejected");
      state.metrics.rejected = (state.metrics.rejected ?? 0) + 1;
      return { reasons };
    }
    this.metrics.increment("strategy.allowed");
    return this.metrics.measure("paper_execution_ms", () => {
      this.metrics.increment("paper.buy_attempts");
      const price = launch.priceSol * (1 + config.maxSlippageBps / 20000);
      const quantity = config.tradeSol / price;
      const id = randomUUID();
      state.positions.push({
        id,
        mint: launch.mint,
        symbol: launch.symbol,
        quantity,
        entryPriceSol: price,
        priceSol: launch.priceSol,
        priceAt: launch.priceAt,
        highPriceSol: price,
        costSol: config.tradeSol + PAPER_FEE_SOL,
        openedAt: Date.now(),
        liquiditySol: launch.liquiditySol,
        initialLiquiditySol: launch.liquiditySol,
        source: launch.source,
      });
      state.balanceSol -= config.tradeSol + PAPER_FEE_SOL;
      state.dailySpendSol += config.tradeSol + PAPER_FEE_SOL;
      state.trades.unshift({
        id: randomUUID(),
        positionId: id,
        symbol: launch.symbol,
        side: "buy",
        amountSol: config.tradeSol,
        quantity,
        feeSol: PAPER_FEE_SOL,
        slippageSol: config.tradeSol - quantity * launch.priceSol,
        pnlSol: 0,
        status: "paper-filled",
        at: Date.now(),
        reason: "strategy",
        source: launch.source,
      });
      state.trades = state.trades.slice(0, 1000);
      alert(
        state,
        `Paper buy ${launch.symbol}: ${config.tradeSol} SOL; synthetic fee/slippage model`,
      );
      return { positionId: id };
    });
  }

  /** Timer rechecks delayed entries and exits; it never manufactures fresh market evidence. */
  async tick() {
    if (
      !this.store.state.running ||
      this.store.state.killed ||
      (!this.store.state.pendingLaunches.length &&
        !this.store.state.positions.length)
    )
      return;
    await this.store.paperTransaction((state) => {
      if (
        !state.running ||
        state.killed ||
        state.failures >= state.strategies[0].maxFailures
      )
        return;
      const waiting: Launch[] = [];
      for (const launch of state.pendingLaunches) {
        if (Date.now() - launch.detectedAt < state.strategies[0].delayMs) {
          waiting.push(launch);
          continue;
        }
        const result = this.consider(state, launch);
        if (result.reasons)
          alert(
            state,
            `Delayed ${launch.symbol} rejected: ${result.reasons.join(", ")}`,
            "warning",
          );
      }
      state.pendingLaunches = waiting;
      this.evaluateExits(state);
    });
  }

  private evaluateExits(state: State) {
    if (!state.running || state.killed) return;
    for (const position of [...state.positions]) {
      if (position.market) continue;
      if (state.failures >= state.strategies[0].maxFailures) break;
      const reason = exitReason(
        position,
        state.strategies[0],
        Date.now(),
        this.metrics,
      );
      if (!reason) continue;
      if (reason === "liquidity-drop")
        alert(state, `Liquidity drop: ${position.symbol}`, "warning");
      try {
        this.sellInState(state, position.id, 1, reason);
      } catch {
        state.failures++;
        alert(
          state,
          `Paper ${reason} failed: ${position.symbol}; position retained`,
          "error",
        );
        if (state.failures >= state.strategies[0].maxFailures) {
          state.running = false;
          state.pendingLaunches = [];
        }
      }
    }
  }

  async mark(
    mint: string,
    priceSol: number,
    liquiditySol: number,
    at = Date.now(),
  ) {
    if (
      !Number.isFinite(priceSol) ||
      priceSol <= 0 ||
      !Number.isFinite(liquiditySol) ||
      liquiditySol < 0 ||
      !Number.isFinite(at) ||
      at < 0 ||
      at > Date.now()
    )
      throw Error("Invalid market update");
    await this.store.paperTransaction((state) => {
      for (const position of state.positions.filter((p) => p.mint === mint)) {
        if (position.market)
          throw Error(
            "Real-market positions require validated account-state quotes",
          );
        if (at < position.priceAt) continue;
        position.priceSol = priceSol;
        position.priceAt = at;
        position.liquiditySol = liquiditySol;
        position.highPriceSol = Math.max(position.highPriceSol, priceSol);
      }
      this.evaluateExits(state);
    });
  }

  async sell(id: string, fraction = 1, reason = "manual") {
    return this.store.paperTransaction((state) =>
      this.sellInState(state, id, fraction, reason),
    );
  }

  private sellInState(
    state: State,
    id: string,
    fraction: number,
    reason: string,
  ) {
    return this.metrics.measure("paper_execution_ms", () =>
      this.sellInStateImpl(state, id, fraction, reason),
    );
  }
  private sellInStateImpl(
    state: State,
    id: string,
    fraction: number,
    reason: string,
  ) {
    this.metrics.increment("paper.sell_attempts");
    if (!Number.isFinite(fraction) || fraction <= 0 || fraction > 1)
      throw Error("Invalid fraction");
    if (state.killed) throw Error("Kill switch active");
    const position = state.positions.find((p) => p.id === id);
    if (!position) throw Error("Position missing or already closed");
    if (position.market)
      throw Error("Real-market positions require validated sell quotes");
    const config = state.strategies[0];
    if (
      position.priceAt > Date.now() ||
      Date.now() - position.priceAt > config.maxPriceAgeMs
    )
      throw Error("Stale price; refresh before exit");
    if (position.liquiditySol <= 0) {
      state.failures++;
      alert(state, "Sell blocked: no liquidity", "error");
      if (state.failures >= config.maxFailures) {
        state.running = false;
        state.pendingLaunches = [];
        alert(
          state,
          "Failure circuit breaker stopped paper automation",
          "error",
        );
      }
      return { failed: true };
    }
    const quantity = position.quantity * fraction;
    const gross = quantity * position.priceSol;
    const slippageSol = (gross * config.maxSlippageBps) / 20000;
    const proceeds = gross - slippageSol - PAPER_FEE_SOL;
    if (proceeds < 0) throw Error("Fees exceed proceeds");
    const cost = position.costSol * fraction;
    const pnlSol = proceeds - cost;
    state.balanceSol += proceeds;
    state.realizedPnlSol += pnlSol;
    position.quantity -= quantity;
    position.costSol -= cost;
    if (fraction === 1)
      state.positions = state.positions.filter((p) => p.id !== id);
    state.trades.unshift({
      id: randomUUID(),
      positionId: id,
      symbol: position.symbol,
      side: "sell",
      amountSol: proceeds,
      quantity,
      feeSol: PAPER_FEE_SOL,
      slippageSol,
      pnlSol,
      status: "paper-filled",
      at: Date.now(),
      reason,
      source: position.source,
    });
    state.trades = state.trades.slice(0, 1000);
    alert(
      state,
      `Paper ${reason}: ${position.symbol}; net P&L ${pnlSol.toFixed(6)} SOL`,
    );
    return { pnlSol };
  }
}

export function syntheticLaunch(index = 0): Launch {
  const now = Date.now();
  return {
    id: `synthetic-${index}`,
    mint: `synthetic-mint-${index}`,
    symbol: `SIM${index}`,
    platform: ["Pump.fun", "PumpSwap", "Raydium", "Meteora"][index % 4],
    kind: "launch",
    creator: "paper-fixture",
    priceSol: 0.0001,
    priceAt: now,
    detectedAt: now,
    liquiditySol: 100,
    marketCapSol: 1000,
    volumeSol: 25,
    momentumBps: 200,
    mintAuthority: false,
    freezeAuthority: false,
    restricted: false,
    topHolderPct: 5,
    sellSimulation: true,
    source: "synthetic",
  };
}
