/** Record source revisions and deployment headers; never activates new variants. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { MarketRpc } from "../src/market/rpc.js";
import { VERIFIED_PROGRAMS } from "../src/chain.js";
import { publicEvidence } from "../src/market/types.js";
if (!process.argv.includes("--run")) throw Error("Explicit --run required");
const output = process.argv.includes("--output-dir") ? process.argv[process.argv.indexOf("--output-dir")+1]! : "docs/phase9";
const directory = `${output}/protocol-sources`;
await mkdir(directory, { recursive: true });
const sources = [
  { repo: "pump-fun/pump-public-docs", files: ["README.md", "idl/pump.json", "idl/pump_amm.json"] },
  { repo: "raydium-io/raydium-cp-swap", files: ["programs/cp-swap/src/states/pool.rs", "programs/cp-swap/src/instructions/swap_base_input.rs"] },
  { repo: "MeteoraAg/dlmm-sdk", files: ["idls/dlmm.json"] },
];
async function bounded(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "Mintbot-read-only-protocol-review" } });
  if (!response.ok) throw Error(`Source HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 4 * 1024 * 1024) throw Error("Source size bound");
  return bytes;
}
const evidence: any[] = [];
for (const source of sources) {
  const row: any = { repository: `https://github.com/${source.repo}`, enabled: false, files: [] };
  try {
    const commits = JSON.parse((await bounded(`https://api.github.com/repos/${source.repo}/commits?per_page=1`)).toString());
    row.commit = commits[0].sha;
    for (const path of source.files) {
      const url = `https://raw.githubusercontent.com/${source.repo}/${row.commit}/${path}`;
      try {
        const bytes = await bounded(url), local = `${directory}/${source.repo.replaceAll("/", "-")}-${path.replaceAll("/", "-")}`;
        await writeFile(local, bytes);
        row.files.push({ path, url, local, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      } catch (error) { row.files.push({ path, url, issue: (error as Error).message }); }
    }
  } catch (error) { row.issue = (error as Error).message; }
  evidence.push(row);
}
const rpc = new MarketRpc(process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com");
const deployments = [];
for (const program of VERIFIED_PROGRAMS) {
  try { deployments.push({ ...program, provider: rpc.provider, evidence: await rpc.deployment(program.address, 0) }); }
  catch (error) { deployments.push({ ...program, provider: rpc.provider, issue: (error as Error).message }); }
}
const pins = JSON.parse(await readFile("src/market/deployment-pins.json", "utf8"));
await writeFile(`${output}/protocol-review.json`, JSON.stringify(publicEvidence({ generatedAt: new Date().toISOString(), sources: evidence, deployments, retainedDeploymentPins: pins, newVariantsEnabled: [], liveTrading: false, scope: "Current source revision and finalized loader header evidence only; no proof of ELF equivalence, new quotes, wire compatibility or positive simulation for unsupported variants." }), null, 2) + "\n");
