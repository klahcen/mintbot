import { loadHostHealth } from '../src/research/host-health.js';
import { acquireResearchOwner } from '../src/research/owner.js';
import { createCoverageEpoch } from '../src/research/epochs.js';
import { researchPrograms } from '../src/research/candidates.js';
import { VERIFIED_PROGRAMS } from '../src/chain.js';
import { assertResearchNotStopped } from '../src/research/stop-control.js';
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
const healthPath=option('--host-health-evidence',process.env.RESEARCH_HOST_HEALTH_PATH??'');
if(process.env.RESEARCH_REQUIRE_HOST_HEALTH==='true'&&!healthPath)throw Error('Clock-stability preflight required');
const hostHealth=healthPath?await loadHostHealth(healthPath,seconds):undefined;
const output = option("--output", process.env.RESEARCH_OUTPUT_DIR ?? `docs/phase11/mainnet-${Date.now()}`);
assertResearchNotStopped(process.env.RESEARCH_STOP_PATH);
const venues=researchPrograms(option('--venues','pump,pumpswap,raydium-cpmm,meteora-dlmm'),VERIFIED_PROGRAMS);
const historyPaths=option('--history-evidence','docs/phase11/coverage-history.json').split(',');
await mkdir(dirname(output), { recursive: true });
await mkdir(output); // An existing directory is evidence, never a restart target.
const compiled = import.meta.url.endsWith(".js");
const roots = compiled ? ["dist/src", "dist/scripts/phase9-mainnet.js", "dist/scripts/phase11-mainnet.js", "config"] : ["src", "scripts/phase9-mainnet.ts", "scripts/phase11-mainnet.ts", "config"];
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
const epoch = await createCoverageEpoch(join(output,'coverage-epoch.json'),venues,historyPaths);
const manifest = {
  schemaVersion: 1, capturedAt: new Date().toISOString(), capturedMonoMs: performance.now(),
  node: process.version, pid: process.pid, runtime: compiled ? "compiled-node" : "tsx-source",
  entrypoint: "phase11-mainnet", engine: "phase9-mainnet shared research pipeline",
  supervisor: "MonitorSupervisor", seconds, maxCandidates: candidates, hashes, hostHealth,
  legacyServerChanged: false, coverageEpoch: epoch, liveTrading: false,
  scope: "Exact runtime modules copied before import; finite single run. Stop does not reset lifetime budgets. Restart requires a fresh directory; old WAL and coverage stay retained."
};
const file = await open(join(output, "runtime-manifest.json"), "wx", 0o600);
try { await file.writeFile(JSON.stringify(manifest, null, 2) + "\n"); await file.sync(); } finally { await file.close(); }
const directory = await open(output, "r"); try { await directory.sync(); } finally { await directory.close(); }
process.argv = [process.argv[0]!, process.argv[1]!, "--run", "--seconds", String(seconds), "--max-candidates", String(candidates), "--output", output, "--venues", venues.join(","), "--coverage-epoch", join(output,"coverage-epoch.json")];
const releaseOwner=await acquireResearchOwner(option('--owner-lock',process.env.RESEARCH_OWNER_PATH??join(dirname(output),'research-decision-owner.lock')));
try{await import("./phase9-mainnet.js");}finally{await releaseOwner();}
