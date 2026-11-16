/** Per-method availability observations are diagnostic, never independent agreement. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { boundedProviderRead, MAINNET_GENESIS } from "../src/research/providers.js";
const previous = JSON.parse(await readFile("docs/phase8/mainnet/evidence.json", "utf8"));
const launch = previous.ledger.marketReviews[0].evidence.launch;
if (!process.argv.includes("--run")) throw Error("Explicit --run required");
const configs = [
  { id: "solana-public", endpoint: "https://api.mainnet-beta.solana.com" },
  { id: "publicnode", endpoint: "https://solana-rpc.publicnode.com" },
];
const observations = await Promise.all(configs.map(async config => {
  const calls: any[] = [];
  for (const [method, params] of [
    ["getGenesisHash", []],
    ["getSlot", [{ commitment: "finalized" }]],
    ["getSignatureStatuses", [[launch.signature], { searchTransactionHistory: true }]],
    ["getMultipleAccounts", [[launch.address, launch.mints[0]], { commitment: "finalized", encoding: "base64", minContextSlot: launch.slot }]],
  ] as const) {
    const start = performance.now();
    try {
      const result = await boundedProviderRead(config, method, [...params]);
      calls.push({ method, result, observedAt: Date.now(), elapsedMs: performance.now() - start });
    } catch (error) { calls.push({ method, issue: (error as Error).message, observedAt: Date.now(), elapsedMs: performance.now() - start }); }
  }
  return { provider: config.id, host: new URL(config.endpoint).host, calls };
}));
const banks = observations.map(o => o.calls.find(c => c.method === "getMultipleAccounts")?.result);
const identicalBank = !!banks[0]?.context && banks.every(b => b?.context?.slot === banks[0].context.slot);
await writeFile((process.argv.includes("--output") ? process.argv[process.argv.indexOf("--output")+1]! : "docs/phase9/provider-method-evidence.json"), JSON.stringify({ generatedAt: new Date().toISOString(), observations, retainedLaunch: launch, expectedGenesis: MAINNET_GENESIS, exactBank: identicalBank ? banks[0].context.slot : "unknown", exactBytesEqual: identicalBank ? banks.every(b => JSON.stringify(b.value) === JSON.stringify(banks[0].value)) : "unknown", accountDigests: banks.map(b => b?.value ? createHash("sha256").update(JSON.stringify(b.value)).digest("hex") : null), independence: "unknown", eligible: false, liveTrading: false, scope: "Diagnostic current per-method results for one historical identity; differing state banks cannot certify agreement. Service brands do not establish independent operators, recovery completeness, or authorization." }, null, 2) + "\n");
