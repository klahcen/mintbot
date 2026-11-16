import test from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
test(
  "authenticated HTTP paper lifecycle, rejection, persistence and restart",
  { timeout: 20000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "mintbot-test-"));
    const token = randomBytes(32).toString("hex");
    const port = 32000 + Math.floor(Math.random() * 20000);
    const url = `http://127.0.0.1:${port}`;
    let child: ChildProcess | undefined;
    let output = "";
    const start = async () => {
      child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          API_TOKEN: token,
          PORT: String(port),
          HOST: "127.0.0.1",
          STATE_PATH: join(dir, "state.json"),
          MODE: "paper",
          DATABASE_URL: "",
          MONITOR_PROGRAMS: "",
          TELEGRAM_BOT_TOKEN: "",
          TELEGRAM_CHAT_ID: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout?.on("data", (b) => {
        output += String(b);
      });
      child.stderr?.on("data", (b) => {
        output += String(b);
      });
      for (let i = 0; i < 100; i++) {
        try {
          const r = await fetch(url + "/health");
          if (r.ok) return;
        } catch {}
        if (child.exitCode !== null)
          throw Error("Server exited before ready: " + output);
        await new Promise((r) => setTimeout(r, 50));
      }
      throw Error("Server startup timeout");
    };
    const stop = async () => {
      if (child && child.exitCode === null) {
        const exit = new Promise<void>((resolve) =>
          child!.once("exit", () => resolve()),
        );
        child.kill("SIGTERM");
        await exit;
      }
    };
    const request = async (
      path: string,
      body?: unknown,
      headers: Record<string, string> = {},
    ) =>
      fetch(url + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    try {
      await start();
      assert.equal((await fetch(url + "/api/state")).status, 401);
      assert.equal((await fetch(url + "/api/metrics")).status, 401);
      assert.equal((await fetch(url + "/%61pi/state")).status, 401);
      const cross = await request(
        "/api/control",
        { action: "start" },
        { Origin: "https://attacker.example" },
      );
      assert.equal(cross.status, 403);
      const bad = await request("/api/strategies", {});
      assert.equal(bad.status, 400);
      const stopped = (await (await request("/api/replay", {})).json()) as {
        reasons: string[];
      };
      assert.ok(stopped.reasons.includes("Trading disabled"));
      assert.equal(
        (await request("/api/control", { action: "start" })).status,
        200,
      );
      const replay = (await (await request("/api/replay", {})).json()) as {
        positionId: string;
      };
      assert.ok(replay.positionId);
      let state = (await (await request("/api/state")).json()) as any;
      assert.equal(state.positions.length, 1);
      await request("/api/paper/mark", {
        mint: state.positions[0].mint,
        priceSol: 0.0002,
        liquiditySol: 100,
      });
      state = (await (await request("/api/state")).json()) as any;
      assert.equal(state.positions.length, 0);
      const measured = (await (await request("/api/metrics")).json()) as any;
      assert.ok(measured.histograms.ingestion_ms.count >= 2);
      assert.equal(measured.gauges["store.queue_depth"].current, 0);
      assert.ok(measured.counters["paper.buy_attempts"] >= 1);
      assert.ok(state.realizedPnlSol > 0);
      await request("/api/control", { action: "kill" });
      assert.equal(
        (await request("/api/control", { action: "start" })).status,
        400,
      );
      await stop();
      await start();
      state = (await (await request("/api/state")).json()) as any;
      assert.equal(state.running, false);
      assert.equal(state.killed, true);
      assert.equal(state.trades.length, 2);
      await request("/api/control", { action: "reset" });
      await request("/api/control", { action: "start" });
      const next = (await (await request("/api/replay", {})).json()) as {
        positionId: string;
      };
      assert.ok(next.positionId);
      assert.ok(!output.includes(token), "API secret leaked to logs");
    } finally {
      await stop();
      await rm(dir, { recursive: true, force: true });
    }
  },
);

// The instrumentation phase must never enable the disconnected execution primitives.
test("live mode remains rejected before serving requests", async () => {
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      API_TOKEN: randomBytes(32).toString("hex"),
      MODE: "live",
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let error = "";
  child.stderr?.on("data", (chunk) => {
    error += String(chunk);
  });
  const code = await new Promise<number | null>((resolve) =>
    child.once("exit", resolve),
  );
  assert.equal(code, 1);
  assert.match(error, /Live mode unavailable/);
});
