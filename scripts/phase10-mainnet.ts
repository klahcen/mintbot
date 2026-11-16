import { loadResearchProviders } from "../src/research/provider-config.js";
/** Explicit operational entrypoint for the existing read-only research pipeline. */
import { mkdir, open, readFile, readdir, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { performance } from "node:perf_hooks";

const args = process.argv.slice(2);
if (!args.includes("--run")) throw Error("Explicit --run required; no signing or submission exists");
if (process.env.MODE && process.env.MODE !== "paper") throw Error("Live mode unavailable");
const option = (key: string, fallback: string) => {
  const i = args.indexOf(key);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1]!.startsWith("--")) throw Error(`Missing ${key}`);
  return args[i + 1]!;
};
const seconds = Number(option("--seconds", "7200"));
const candidates = Number(option("--max-candidates", "120"));
if (!Number.isInteger(seconds) || seconds < 15 || seconds > 7200 || !Number.isInteger(candidates) || candidates < 1 || candidates > 240) throw Error("Research run bound");
await loadResearchProviders(); // Fail before snapshots, epochs, owner locks or ledgers are created.
const output = option("--output", process.env.RESEARCH_OUTPUT_DIR ?? `docs/phase10/mainnet-${Date.now()}`);
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // An existing directory is evidence, never a restart target.
const compiled = import.meta.url.endsWith(".js");
const roots = compiled ? ["dist/src", "dist/scripts/phase9-mainnet.js", "dist/scripts/phase10-mainnet.js", "config"] : ["src", "scripts/phase9-mainnet.ts", "scripts/phase10-mainnet.ts", "config"];
const files: string[] = [];
async function collect(path: string): Promise<void> {
  if (path.endsWith(".ts") || path.endsWith(".js")) { files.push(path); return; }
  for (const entry of await readdir(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw Error("Runtime snapshot cannot follow symlinks");
    if (entry.isDirectory()) await collect(join(path, entry.name));
    else if (entry.isFile()) files.push(join(path, entry.name));
  }
}
for (const root of roots) await collect(root);
files.push("package.json", "package-lock.json");
const hashes: Record<string, string> = {};
for (const path of files) {
  const bytes = await readFile(path);
  hashes[path] = createHash("sha256").update(bytes).digest("hex");
  const target = join(output, "source-at-start", path);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(path, target);
}
const manifest = {
  schemaVersion: 1, capturedAt: new Date().toISOString(), capturedMonoMs: performance.now(),
  node: process.version, pid: process.pid, runtime: compiled ? "compiled-node" : "tsx-source",
  entrypoint: "phase10-mainnet", engine: "phase9-mainnet shared research pipeline",
  supervisor: "MonitorSupervisor", seconds, maxCandidates: candidates, hashes,
  legacyServerChanged: false, liveTrading: false,
  scope: "Exact runtime modules copied before import; finite single run. Stop does not reset lifetime budgets. Restart requires a fresh directory; old WAL and coverage stay retained."
};
const file = await open(join(output, "runtime-manifest.json"), "wx", 0o600);
try { await file.writeFile(JSON.stringify(manifest, null, 2) + "\n"); await file.sync(); } finally { await file.close(); }
const directory = await open(output, "r"); try { await directory.sync(); } finally { await directory.close(); }
process.argv = [process.argv[0]!, process.argv[1]!, "--run", "--seconds", String(seconds), "--max-candidates", String(candidates), "--output", output, "--venues", option("--venues", "pump")];
await import("./phase9-mainnet.js");
