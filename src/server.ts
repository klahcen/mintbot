import { requestResearchStop } from './research/stop-control.js';
import { readResearchStatus } from "./research/status.js";
import { marketPolicy } from "./market/policy.js";
import type { createMonitoringService } from "./monitor-service.js";
import Fastify from "fastify";
import { readFile, access, readdir, mkdir } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { MarketRpc } from "./market/rpc.js";
import { MarketService } from "./market/service.js";
import { RealMarketPaper, initializeMarketLedger } from "./market/paper.js";
import { acquireFileLease } from "./file-lease.js";
import { z } from "zod";
import { StrategySchema } from "./model.js";
import { initial, load } from "./store.js";
import { Engine, alert, syntheticLaunch } from "./engine.js";
import { authorized } from "./wallet.js";
import { telemetry, notify } from "./telemetry.js";
import { Pool } from "pg";
import { Connection } from "@solana/web3.js";
import {
  VERIFIED_PROGRAMS,
  scanMint,
  inspectTransaction,
  type PumpLaunch,
} from "./chain.js";
const token = process.env.API_TOKEN ?? "";
if (token.length < 32)
  throw Error("Set API_TOKEN to at least 32 random characters");
if ((process.env.MODE ?? "paper") !== "paper")
  throw Error(
    "Live mode unavailable: audited protocol adapters and signer authorization required",
  );
const strategy = StrategySchema.parse(
  JSON.parse(await readFile(resolve("config/strategy.json"), "utf8")),
);
const balance = Number(process.env.INITIAL_BALANCE_SOL ?? 10);
if (!Number.isFinite(balance) || balance <= 0)
  throw Error("Invalid initial balance");
const store = await load(
  process.env.STATE_PATH ?? "data/state.json",
  initial(strategy, balance),
);
const engine = new Engine(store);
if(process.env.RESEARCH_STOP_PATH && ((process.env.MONITOR_PROGRAMS??'').trim() || process.env.REAL_MARKET_PAPER==='true'))throw Error('Research sidecar topology requires legacy monitor and server market decisions disabled');
const metrics = telemetry;
if (
  process.env.REAL_MARKET_PAPER &&
  !["true", "false"].includes(process.env.REAL_MARKET_PAPER)
)
  throw Error("REAL_MARKET_PAPER must be true or false");
let market: MarketService | undefined;
let releaseMarketLease: (() => Promise<void>) | undefined;
if (process.env.REAL_MARKET_PAPER === "true") {
  if (!process.env.SOLANA_RPC_URL)
    throw Error("Real-market paper requires SOLANA_RPC_URL");
  const marketPath = resolve(
    process.env.MARKET_PAPER_STATE_PATH ?? "data/market-paper-state.json",
  );
  const protectedPaths = [
    process.env.STATE_PATH ?? "data/state.json",
    process.env.INGESTION_JOURNAL_PATH ?? "data/server-ingestion.wal",
    "data/observations.jsonl",
  ];
  if (
    protectedPaths.some((p) =>
      [resolve(p), resolve(p) + ".tmp", resolve(p) + ".lock"].includes(
        marketPath,
      ),
    )
  )
    throw Error("Market ledger path overlaps existing storage");
  await mkdir(dirname(marketPath), { recursive: true });
  releaseMarketLease = await acquireFileLease(marketPath + ".writer.lock");
  const marketStore = await load(
    marketPath,
    initializeMarketLedger(initial(strategy, balance)),
    metrics,
    true,
  );
  initializeMarketLedger(marketStore.state);
  market = new MarketService(
    new RealMarketPaper(marketStore, metrics, marketPolicy(process.env.MARKET_RESEARCH_POLICY), () => {
      throw Error("Legacy server execution blocked: independent provider agreement, reviewed coverage epoch and unsigned simulation gates require the research pipeline");
    }),
    new MarketRpc(process.env.SOLANA_RPC_URL, metrics),
    metrics,
  );
}
const db = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis:2000, statement_timeout:2000, query_timeout:2000 })
  : undefined;
const connection = process.env.SOLANA_RPC_URL
  ? new Connection(process.env.SOLANA_RPC_URL, "confirmed")
  : undefined;
const discoveries: PumpLaunch[] = [];
let monitoring: Awaited<ReturnType<typeof createMonitoringService>> | undefined;
let healthFlushed = 0;
let flushingHealth = false;
const app = Fastify({
  logger: { redact: ["req.headers.authorization", "req.headers.cookie"] },
  bodyLimit: 32768,
  disableRequestLogging: process.env.CLOUD_DEPLOYMENT === "true",
});
// A disconnected idle client is an availability signal; never leak transport details.
db?.on("error", () => app.log.warn("Database connection unavailable"));
let replaySequence = Math.max(
  0,
  ...store.state.seen
    .filter((id) => /^synthetic-\d+$/.test(id))
    .map((id) => Number(id.slice(10))),
);
app.addHook("onSend", async (_req, reply, payload) => {
  reply
    .header("x-content-type-options", "nosniff")
    .header("x-frame-options", "DENY")
    .header("referrer-policy", "no-referrer")
    .header(
      "content-security-policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  return payload;
});
app.addHook("onRequest", async (req, reply) => {
  if (!req.routeOptions.url?.startsWith("/api/")) return;
  reply.header("cache-control", "no-store");
  if (!authorized(req.headers.authorization, token))
    return reply.code(401).send({ error: "Unauthorized" });
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host)
        return reply.code(403).send({ error: "Origin rejected" });
    } catch {
      return reply.code(403).send({ error: "Origin rejected" });
    }
  }
});
app.setErrorHandler((err, req, reply) => {
  const message=process.env.CLOUD_DEPLOYMENT === "true" ? "Request failed" : err instanceof Error ? err.message : "Request failed";
  req.log.warn(
    { message },
    "request rejected",
  );
  reply
    .code(400)
    .send({ error: message });
});
app.get("/health", async () => ({ ok: true, mode: "paper" }));
// Authenticated readiness; liveness remains independent of database outages.
app.get("/api/ops/health", async (_req, reply) => {
  let database = "not-configured";
  if (db) {
    try { await db.query("SELECT 1"); database="healthy"; }
    catch { database="failed"; }
  }
  const research=await readResearchStatus(process.env.RESEARCH_STATUS_PATH);
  let stopFence=false;
  if(process.env.RESEARCH_STOP_PATH)try{await access(process.env.RESEARCH_STOP_PATH);stopFence=true;}catch(e){stopFence=(e as NodeJS.ErrnoException).code!=="ENOENT";}
  if(database!=="healthy")reply.code(503);
  return {ok:database==="healthy", mode:"paper", fundedExecution:"disabled", database, stopFence, research};
});
app.get("/api/state", async () => ({
  ...store.state,
  latencies: metrics.snapshot(),
  telemetry: metrics.report(),
  discoveries,
  ingestion: monitoring?.snapshot() ?? { status: "not-configured" },
  marketPaper: market
    ? {
        mode: "real-market-paper",
        executionStatus: "blocked-monitoring",
        blockers: ["Legacy server lacks independent provider, reviewed coverage epoch and unsigned simulation gates; use the research pipeline"],
        running: market.paper.store.state.running,
        positions: market.paper.store.state.positions.length,
      }
    : { status: "disabled" },
}));
app.get(
  "/api/market-paper/state",
  async () => market ? { ...market.snapshot(), executionStatus: "blocked-monitoring",
    blockers: ["Legacy server execution disabled; independent provider, coverage epoch and unsigned simulation gates require the research pipeline"] }
    : { status: "disabled", liveTrading: false },
);
app.post("/api/market-paper/control", async (req) => {
  if (!market) throw Error("Real-market paper disabled");
  const { action } = z
    .object({ action: z.enum(["start", "stop", "kill", "reset"]) })
    .strict()
    .parse(req.body);
  return market.paper.store.transaction((s) => {
    if (action === "start") {
      if (
        s.killed ||
        store.state.killed ||
        s.failures >= s.strategies[0].maxFailures
      )
        throw Error("Kill switch or circuit breaker active");
      // Start monitoring controls only; the commit fence continues to block every fill.
      s.running = true;
    }
    if (action === "stop") s.running = false;
    if (action === "kill") {
      s.running = false;
      s.killed = true;
    }
    if (action === "reset") {
      if (s.running) throw Error("Stop before reset");
      if (store.state.killed) throw Error("Reset global kill switch first");
      s.killed = false;
      s.failures = 0;
    }
    return { running: s.running, killed: s.killed, executionStatus: "blocked-monitoring",
      blockers: ["Independent provider, coverage epoch and simulation evidence require the research pipeline"] };
  });
});
app.post("/api/market-paper/sell/:id", async (req) => {
  if (!market) throw Error("Real-market paper disabled");
  const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
  return market.exit(id);
});
app.get("/api/research/status", async () => readResearchStatus(process.env.RESEARCH_STATUS_PATH));
app.get("/api/metrics", async () => metrics.report());
app.get(
  "/api/ingestion",
  async () => monitoring?.snapshot() ?? { status: "not-configured" },
);
app.post("/api/ingestion/recover", async (req) => {
  const { program } = z
    .object({
      program: z
        .enum(["pump", "pumpswap", "raydium-cpmm", "meteora-dlmm"])
        .optional(),
    })
    .strict()
    .parse(req.body ?? {});
  if (!monitoring) throw Error("Monitoring not configured");
  monitoring.recover(program);
  return { accepted: true };
});
app.get("/api/chain/mints/:mint", async (req) => {
  if (!connection) throw Error("Read-only RPC not configured");
  const { mint } = req.params as {
    mint: string;
  };
  return scanMint(connection, mint);
});
app.get("/api/chain/transactions/:signature", async (req) => {
  if (!connection) throw Error("Read-only RPC not configured");
  const { signature } = req.params as {
    signature: string;
  };
  return inspectTransaction(connection, signature);
});
app.post("/api/control", async (req) => {
  const { action } = z
    .object({ action: z.enum(["start", "stop", "kill", "reset"]) })
    .strict()
    .parse(req.body);
  if (market && (action === "kill" || action === "stop"))
    await market.paper.store.transaction((s) => {
      s.running = false;
      if (action === "kill") s.killed = true;
    });
  const result = await store.transaction((s) => {
    if (action === "reset") {
      if (s.running) throw Error("Stop before resetting circuit breaker");
      s.killed = false;
      s.failures = 0;
    } else if (action === "kill") {
      s.pendingLaunches = [];
      s.killed = true;
      s.running = false;
    } else if (action === "start") {
      if (s.killed) throw Error("Reset kill switch first");
      if (s.failures >= s.strategies[0].maxFailures)
        throw Error("Failure circuit breaker active");
      s.running = true;
    } else {
      s.running = false;
      s.pendingLaunches = [];
    }
    alert(s, `Operator ${action}; paper mode`);
    return { running: s.running, killed: s.killed };
  });
  const researchStop = process.env.RESEARCH_STOP_PATH && (action === "stop" || action === "kill") ? await requestResearchStop(process.env.RESEARCH_STOP_PATH,action) : undefined;
  return {...result, ...(researchStop ? {researchStop} : {})};
});
app.post("/api/strategies", async (req) => {
  const c = StrategySchema.parse(req.body);
  if (market)
    await market.paper.store.transaction((s) => {
      if (s.running || store.state.running)
        throw Error("Stop both paper modes before changing settings");
      s.strategies = [c];
    });
  return store.transaction((s) => {
    if (s.running) throw Error("Stop trading before changing settings");
    if (market?.paper.store.state.running)
      throw Error("Stop real-market paper before changing settings");
    s.strategies = [c];
    return c;
  });
});
app.post("/api/replay", async () => {
  const begin = performance.now();
  const launch = syntheticLaunch(++replaySequence);
  const result = await engine.ingest(launch);
  metrics.observe("synthetic_event_to_decision_ms", performance.now() - begin);
  let auditPersisted = true;
  if (db) {
    try {
      await db.query(
        "INSERT INTO events (id, kind, payload) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING",
        [launch.id, "synthetic-launch", launch],
      );
    } catch {
      auditPersisted = false;
      app.log.error(
        "PostgreSQL event audit failed; local paper result committed",
      );
    }
  }
  return { ...result, auditPersisted };
});
app.post("/api/positions/:id/exit", async (req) => {
  const { id } = req.params as {
    id: string;
  };
  const { fraction } = z
    .object({ fraction: z.number().positive().max(1).default(1) })
    .strict()
    .parse(req.body ?? {});
  return engine.sell(id, fraction);
});
app.post("/api/paper/mark", async (req) => {
  const v = z
    .object({
      mint: z.string(),
      priceSol: z.number().positive(),
      liquiditySol: z.number().nonnegative(),
    })
    .strict()
    .parse(req.body);
  if (
    !store.state.positions.some(
      (p) => p.mint === v.mint && p.source === "synthetic",
    )
  )
    throw Error("Manual marks limited to synthetic fixtures");
  await engine.mark(v.mint, v.priceSol, v.liquiditySol);
  return { ok: true };
});
const publicRoot = resolve("frontend/dist");
try {
  await access(publicRoot);
  const types: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  };
  // Register only build files discovered at startup, never translate an incoming path to a filesystem path.
  for (const file of await readdir(publicRoot, { recursive: true })) {
    const type = types[extname(file)];
    if (!type || file.split("/").some((part) => part.startsWith("."))) continue;
    const bytes = await readFile(resolve(publicRoot, file));
    app.get("/" + file, async (_req, reply) => reply.type(type).send(bytes));
  }
  const index = await readFile(resolve(publicRoot, "index.html"));
  app.get("/", async (_req, reply) =>
    reply.type("text/html; charset=utf-8").send(index),
  );
  app.setNotFoundHandler(async (req, reply) =>
    req.url.startsWith("/api/")
      ? reply.code(404).send({ error: "Not found" })
      : reply.type("text/html; charset=utf-8").send(index),
  );
} catch (error) {
  app.log.info("Frontend build missing; run npm --prefix frontend run build");
}
let ticking = false;
const strategyTimer = setInterval(async () => {
  if (ticking) return;
  ticking = true;
  try {
    await engine.tick();
  } catch {
    app.log.warn("Paper timer failed; inspect current evidence and state");
  } finally {
    ticking = false;
  }
}, 1000);
strategyTimer.unref();
const marketTimer = setInterval(() => {
  void market
    ?.poll()
    .catch(() =>
      app.log.warn("Real-market paper refresh failed; position retained"),
    );
}, 1000);
marketTimer.unref();
// Send only server-generated, non-sensitive alert messages. Serial delivery, bounded backlog.
let notified = store.state.alerts[0]?.id;
let sending = false;
const timer = setInterval(async () => {
  if (sending) return;
  sending = true;
  try {
    const alerts = store.state.alerts;
    const end = notified ? alerts.findIndex((a) => a.id === notified) : -1;
    const pending = (
      end < 0 ? alerts.slice(0, 5) : alerts.slice(0, end)
    ).reverse();
    for (const a of pending) await notify(`[PAPER] ${a.message}`);
    notified = alerts[0]?.id;
  } catch {
    app.log.warn("Notification delivery failed");
  } finally {
    sending = false;
  }
}, 5000);
timer.unref();
async function flushHealth() {
  if (!monitoring || flushingHealth) return;
  const snapshot = monitoring.snapshot();
  const delta = snapshot.receipts - healthFlushed;
  const health = monitoring.health();
  if (!delta && store.state.rpc.status === health) return;
  flushingHealth = true;
  try {
    await store.paperTransaction((s) => {
      s.metrics.observations = (s.metrics.observations ?? 0) + delta;
      s.metrics.latestSlot = Math.max(
        s.metrics.latestSlot ?? 0,
        snapshot.latestSlot,
      );
      s.rpc.status = health;
    });
    healthFlushed = snapshot.receipts;
  } finally {
    flushingHealth = false;
  }
}
const healthTimer = setInterval(() => {
  void flushHealth().catch(() =>
    app.log.warn("Ingestion health snapshot deferred"),
  );
}, 250);
healthTimer.unref();
const close = async () => {
  clearInterval(timer);
  clearInterval(strategyTimer);
  clearInterval(healthTimer);
  clearInterval(marketTimer);
  await monitoring?.close();
  await market?.close();
  await releaseMarketLease?.();
  await flushHealth();
  await app.close();
  await db?.end();
  process.exit(0);
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3001),
});
const selectedNames = (process.env.MONITOR_PROGRAMS ?? "")
  .split(",")
  .filter(Boolean);
if (selectedNames.length) {
  if (!process.env.SOLANA_WS_URL)
    throw Error("MONITOR_PROGRAMS requires SOLANA_WS_URL");
  const programs = selectedNames.map((name) => {
    const p = VERIFIED_PROGRAMS.find((p) => p.name === name);
    if (!p) throw Error(`Unverified program: ${name}`);
    return p;
  });
  const { createMonitoringService } = await import("./monitor-service.js");
  monitoring = await createMonitoringService({
    programs,
    websocketUrls: [
      process.env.SOLANA_WS_URL,
      process.env.SOLANA_SECONDARY_WS_URL,
    ].filter((v): v is string => !!v),
    rpcUrl: process.env.SOLANA_RPC_URL,
    journal: {
      path: process.env.INGESTION_JOURNAL_PATH ?? "data/server-ingestion.wal",
    },
    rawPath: "data/observations.jsonl",
    metrics,
    finalityWaitMs: market?.paper.policy.name === "finalized-paper-research" ? 50000 : 12000,
    prepareCreationObservation: market
      ? (event) => market!.observe(event, "confirmed", "configured-websocket-provider (receipt not attributed across failover)")
      : undefined,
    evaluateVerifiedLaunch: market
      ? (launch) => market!.evaluate(launch)
      : undefined,
    onDiscovery: (launch) => {
      discoveries.unshift(launch);
      discoveries.splice(200);
    },
    audit: db
      ? async (event) => {
          await db.query(
            "INSERT INTO events(id,kind,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING",
            [
              `${event.program}:${event.signature}`,
              "program-observation",
              event,
            ],
          );
        }
      : undefined,
  });
  monitoring.start();
}
