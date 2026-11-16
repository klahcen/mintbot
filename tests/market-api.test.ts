import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
test(
  "Opt-in market HTTP controls isolate balances, require auth, and respect the global kill switch",
  { timeout: 20000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "mintbot-market-api-")),
      token = randomBytes(32).toString("hex"),
      port = 32000 + Math.floor(Math.random() * 20000),
      url = `http://127.0.0.1:${port}`;
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/server.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          API_TOKEN: token,
          MODE: "paper",
          REAL_MARKET_PAPER: "true",
          MARKET_PAPER_STATE_PATH: join(dir, "market.json"),
          STATE_PATH: join(dir, "synthetic.json"),
          HOST: "127.0.0.1",
          PORT: String(port),
          SOLANA_RPC_URL: "http://127.0.0.1:1",
          MONITOR_PROGRAMS: "",
          DATABASE_URL: "",
          TELEGRAM_BOT_TOKEN: "",
          TELEGRAM_CHAT_ID: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (b) => {
      output += b;
    });
    child.stderr.on("data", (b) => {
      output += b;
    });
    const request = (path: string, body?: unknown) =>
      fetch(url + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    try {
      let ready = false;
      for (let i = 0; i < 160; i++) {
        try {
          if ((await fetch(url + "/health")).ok) {
            ready = true;
            break;
          }
        } catch {}
        if (child.exitCode !== null) throw Error(output);
        await new Promise((r) => setTimeout(r, 50));
      }
      assert(ready, output);
      assert.equal((await fetch(url + "/api/market-paper/state")).status, 401);
      const state = (await (
        await request("/api/market-paper/state")
      ).json()) as any;
      assert.equal(state.liveTrading, false);
      assert.equal(state.state.running, false);
      assert.equal(state.state.marketLedger.balanceLamports, "10000000000");
      assert.equal(
        (await request("/api/market-paper/control", { action: "start" }))
          .status,
        200,
      );
      await request("/api/control", { action: "start" });
      await request("/api/replay", {});
      const m = (await (
        await request("/api/market-paper/state")
      ).json()) as any;
      assert.equal(m.state.marketLedger.balanceLamports, "10000000000");
      assert.equal(m.state.positions.length, 0);
      await request("/api/control", { action: "kill" });
      const killed = (await (
        await request("/api/market-paper/state")
      ).json()) as any;
      assert.equal(killed.state.killed, true);
      assert.equal(killed.state.running, false);
      assert.equal(
        (await request("/api/market-paper/control", { action: "start" }))
          .status,
        400,
      );
    } finally {
      if (child.exitCode === null) {
        const exit = new Promise<void>((r) => child.once("exit", () => r()));
        child.kill("SIGTERM");
        await exit;
      }
      await rm(dir, { recursive: true, force: true });
    }
  },
);
