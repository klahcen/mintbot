import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMonitoringService } from "../src/monitor-service.js";
import { VERIFIED_PROGRAMS, SolanaMonitor } from "../src/chain.js";
import { HttpRecoveryRpc } from "../src/backfill.js";
import { pumpLogs } from "../scripts/benchmark-fixtures.js";
import { FakeSocket, ManualScheduler, open } from "./helpers/fakes.js";
import { Telemetry } from "../src/telemetry.js";
const waitFor = async (check: () => boolean) => {
  for (let n = 0; n < 200; n++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw Error("Mock service did not settle");
};
test("overlapping providers commit one discovery and initial secondary subscription creates no false gap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-overlap2-"));
  const ws = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => ws.once("listening", resolve));
  const program = VERIFIED_PROGRAMS[0]!;
  const notification = JSON.stringify({
    method: "logsNotification",
    params: {
      subscription: 44,
      result: {
        context: { slot: 1000 },
        value: {
          signature: "shared",
          err: null,
          logs: pumpLogs(program.address),
        },
      },
    },
  });
  let connections = 0;
  ws.on("connection", (socket) => {
    const index = connections++;
    socket.on("message", (raw) => {
      const request = JSON.parse(String(raw));
      setTimeout(
        () => {
          socket.send(JSON.stringify({ id: request.id, result: 44 }));
          socket.send(notification);
        },
        index === 0 ? 0 : 100,
      );
    });
  });
  let discoveries = 0;
  const metrics = new Telemetry();
  const path = join(dir, "raw.jsonl");
  const service = await createMonitoringService({
    programs: [program],
    websocketUrls: [
      `ws://127.0.0.1:${(ws.address() as { port: number }).port}`,
      `ws://127.0.0.1:${(ws.address() as { port: number }).port}`,
    ],
    journal: { path: join(dir, "work.wal") },
    rawPath: path,
    metrics,
    onDiscovery: () => {
      discoveries++;
    },
  });
  try {
    service.start();
    await waitFor(() =>
      service.snapshot().providers.every((p) => p.subscribed),
    );
    await service.pipeline.drain();
    assert.equal(discoveries, 1);
    assert.equal(service.snapshot().receipts, 1);
    assert.equal(service.snapshot().gaps.length, 0);
    assert.equal((await readFile(path, "utf8")).trim().split("\n").length, 1);
    assert.equal(metrics.report().counters["ingest.duplicates"], 1);
  } finally {
    await service.close();
    for (const socket of ws.clients) socket.terminate();
    await new Promise<void>((resolve) => ws.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("runtime service reconnects via WebSocket and performs real HTTP-format read-only backfill", async () => {
  const dir = await mkdtemp(join(tmpdir(), "mintbot-service2-"));
  const program = VERIFIED_PROGRAMS[0]!;
  const logs = pumpLogs(program.address);
  const signatures = [
    { signature: "missed", slot: 1010, err: null },
    { signature: "anchor", slot: 1000, err: null },
    { signature: "boundary", slot: 967, err: null },
  ];
  const methods: string[] = [];
  const http = createServer(async (req, res) => {
    let body = "";
    for await (const part of req) body += part;
    const call = JSON.parse(body);
    methods.push(call.method);
    let result: unknown;
    if (call.method === "getSlot") result = 1020;
    else if (call.method === "getSignaturesForAddress")
      result = call.params[1].before ? [] : signatures;
    else if (call.method === "getTransaction") {
      const row = signatures.find((r) => r.signature === call.params[0])!;
      result = {
        slot: row.slot,
        meta: { err: null, logMessages: logs },
        transaction: {
          signatures: [row.signature],
          message: { accountKeys: [program.address] },
        },
      };
    } else throw Error("Unexpected method");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ jsonrpc: "2.0", id: call.id, result }));
  });
  await new Promise<void>((resolve) => http.listen(0, "127.0.0.1", resolve));
  const port = (http.address() as { port: number }).port;
  const ws = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => ws.once("listening", resolve));
  let connections = 0;
  let latest: import("ws").WebSocket | undefined;
  ws.on("connection", (socket) => {
    connections++;
    latest = socket;
    socket.on("message", (raw) => {
      const request = JSON.parse(String(raw));
      socket.send(JSON.stringify({ id: request.id, result: 44 }));
    });
  });
  const wsPort = (ws.address() as { port: number }).port;
  const found: string[] = [];
  let service: Awaited<ReturnType<typeof createMonitoringService>> | undefined;
  try {
    service = await createMonitoringService({
      programs: [program],
      websocketUrls: [`ws://127.0.0.1:${wsPort}`],
      rpcUrl: `http://127.0.0.1:${port}`,
      journal: { path: join(dir, "work.wal") },
      rawPath: join(dir, "observations.jsonl"),
      onDiscovery: (l) => found.push(l.signature),
    });
    service.start();
    await waitFor(() => service!.snapshot().providers[0]!.subscribed);
    latest!.send(
      JSON.stringify({
        method: "logsNotification",
        params: {
          subscription: 44,
          result: {
            context: { slot: 1000 },
            value: { signature: "anchor", err: null, logs },
          },
        },
      }),
    );
    await waitFor(() => found.includes("anchor"));
    latest!.close();
    await waitFor(() => connections >= 2);
    await waitFor(() =>
      service!.snapshot().gaps.some((g) => g.status === "recovered"),
    );
    assert.deepEqual(found.sort(), ["anchor", "missed"]);
    assert.ok(methods.includes("getSignaturesForAddress"));
    assert.ok(methods.includes("getTransaction"));
    assert.ok(
      methods.every((method) =>
        ["getSlot", "getSignaturesForAddress", "getTransaction"].includes(
          method,
        ),
      ),
    );
  } finally {
    await service?.close();
    for (const socket of ws.clients) socket.terminate();
    await new Promise<void>((resolve) => ws.close(() => resolve()));
    http.closeAllConnections();
    await new Promise<void>((resolve) => http.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
test("HTTP recovery has abortable lifetime and bounded response memory", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/large") {
      res.end("x".repeat(10000));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    await assert.rejects(
      new HttpRecoveryRpc(`http://127.0.0.1:${port}/hang`, 20).getSlot(),
    );
    await assert.rejects(
      new HttpRecoveryRpc(
        `http://127.0.0.1:${port}/large`,
        1000,
        100,
      ).getSlot(),
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
test("silent socket loss is detected by monotonic scheduled heartbeat and creates an explicit reconnect", () => {
  const clock = new ManualScheduler();
  const metrics = new Telemetry({ clock: clock.now });
  const socket = new FakeSocket() as FakeSocket & { ping: () => void };
  let pings = 0;
  socket.ping = () => {
    pings++;
  };
  let disconnects = 0;
  const monitor = new SolanaMonitor(
    "ws://fixture.invalid",
    [VERIFIED_PROGRAMS[0]!],
    () => {},
    {
      telemetry: metrics,
      scheduler: clock,
      heartbeatMs: 10,
      maxReconnects: 0,
      onDisconnect: () => {
        disconnects++;
      },
    },
    () => socket,
  );
  monitor.start();
  open(socket);
  clock.advance(10);
  assert.equal(pings, 1);
  clock.advance(10);
  assert.equal(disconnects, 1);
  assert.equal(metrics.report().counters["rpc.errors"], 1);
  monitor.stop();
  assert.equal(clock.pending, 0);
});
