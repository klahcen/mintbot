/** Explicitly bounded real-time mainnet observation. Dedicated fsynced paper ledger; no signing/submission. */
import { mkdir, writeFile, access } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { SolanaMonitor, VERIFIED_PROGRAMS, type ProgramObservation } from "../src/chain.js";
import { AsyncEventJournal } from "../src/async-journal.js";
import { EventIngestion } from "../src/ingestion.js";
import { VerifiedReadRpc } from "../src/verified-rpc.js";
import { MarketRpc } from "../src/market/rpc.js";
import { MarketService } from "../src/market/service.js";
import { RealMarketPaper, initializeMarketLedger } from "../src/market/paper.js";
import { marketPolicy } from "../src/market/policy.js";
import { initial, Store, load } from "../src/store.js";
import { StrategySchema } from "../src/model.js";
import { readFile } from "node:fs/promises";
import { Telemetry } from "../src/telemetry.js";
import { publicEvidence, type MarketBatch } from "../src/market/types.js";
import type { AccountEvidence, ParsedChainTransaction, VerifiedLaunch } from "../src/verified-decoders.js";
const args = process.argv.slice(2);
if (!args.includes("--run")) throw Error("Use --run for bounded read-only network experiment");
const opt = (n: string, d: string) => args.includes(n) ? args[args.indexOf(n)+1]! : d;
const seconds = Number(opt("--seconds", "90")), maxCandidates = Number(opt("--max-candidates", "6"));
if (!Number.isInteger(seconds) || seconds < 15 || seconds > 180 || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 12) throw Error("Experiment bound");
const output = opt("--output", "docs/phase5/mainnet");
await mkdir(output, {recursive: true});
try { await access(`${output}/ledger.json`); throw Error("Use a new experiment directory; existing ledger preserved"); }
catch(e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
const endpoint = process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const ws = process.env.SOLANA_WS_URL ?? "wss://api.mainnet-beta.solana.com";
const metrics = new Telemetry(), startedAt = Date.now(), startMono = performance.now();
const captured: unknown[] = [], rows: any[] = [];
class CaptureVerifier extends VerifiedReadRpc {
  override async transaction(signature: string): Promise<ParsedChainTransaction | null> {
    const result = await super.transaction(signature);
    if (result) captured.push({method:"getTransaction", commitment:"finalized", observedAt:Date.now(), signature,result});
    return result;
  }
  override async accounts(keys: string[]): Promise<AccountEvidence> {
    const result = await super.accounts(keys); captured.push({method:"getMultipleAccounts",keys,result,observedAt:Date.now()}); return result;
  }
}
class CaptureMarket extends MarketRpc {
  override async accounts(keys: string[], slot: number): Promise<MarketBatch> {
    const result = await super.accounts(keys,slot); captured.push({method:"market.getMultipleAccounts",keys,result}); return result;
  }
  override async holders(mint:string,program:string,slot:number) {
    const addresses = await super.holders(mint,program,slot);
    captured.push({method:"market.getProgramAccounts",mint,program,minimumSlot:slot,addresses,observedAt:Date.now()}); return addresses;
  }
}
const strategy = StrategySchema.parse(JSON.parse(await readFile("config/strategy.json","utf8")));
// Original strategy safety/capital settings preserved. Only entry age policy is explicitly selected below.
const state = initializeMarketLedger(initial(strategy));
state.running = true;
const store = new Store(state, `${output}/ledger.json`, metrics, 64, true);
await store.paperTransaction(() => undefined);
const paper = new RealMarketPaper(store, metrics, marketPolicy("finalized-paper-research"));
const market = new MarketService(paper, new CaptureMarket(endpoint,metrics),metrics);
const verifier = new CaptureVerifier(endpoint);
const journal = await AsyncEventJournal.open({path:`${output}/ingestion.wal`},metrics);
let head = 0, notifications = 0, refused = 0;
const pipeline = new EventIngestion({ journal, metrics, capacity:8,enrichmentConcurrency:2,maxAttempts:1,
  enrich: async (event,_launches,freshness,timing) => {
    const row = rows.find(r => r.event.signature === event.signature)!;
    await market.observe(event,"confirmed",new URL(ws).host);
    try {
      const provisional = await metrics.measureAsync("phase5.confirmed_preparation_ms",()=>verifier.provisional(event.program,event.signature,event.slot));
      if (provisional) { captured.push({method:"confirmedPreparation",...provisional}); row.confirmedPreparationAgeMs=Date.now()-event.observedAt; }
    } catch(e) { row.preparationIssue=(e as Error).message; }
    const deadline = Math.min(startedAt + seconds*1000+45000,event.observedAt+50000);
    do {
      try {
        const launches = await metrics.measureAsync("market.transaction_verification_ms",()=>verifier.verify(event.program,event.signature,event.slot));
        row.finalityPolls++;
        if (launches !== null) {
          row.finalizedVerificationAgeMs=Date.now()-event.observedAt;
          row.verifiedLaunches=launches.length;
          return launches.map(l=>Object.defineProperty({...l,freshness:{...freshness, chainHeadSlot:head,
            ...(l.blockTimeMs !== undefined ? {eventTimeMs:l.blockTimeMs}: {})}},"receiptMonoMs",{value:timing.receiptMonoMs,enumerable:false}));
        }
      } catch(e) { row.verificationIssue=(e as Error).message; return []; }
      await new Promise(r=>setTimeout(r,2000));
    } while(Date.now()<deadline);
    row.verificationIssue="Finalized creation unavailable within bounded wait"; return [];
  },
  strategy:async (event,_launches,_identity,enrichment)=> {
    const row = rows.find(r=>r.event.signature===event.signature)!;
    for (const launch of enrichment as VerifiedLaunch[]) {
      row.decision = await market.evaluate(launch);
      row.decisionAgeMs=Date.now()-event.observedAt;
    }
  },
});
const monitor = new SolanaMonitor(ws,VERIFIED_PROGRAMS.filter(p=>p.name==="pump"),event=> {
  notifications++; head=Math.max(head,event.slot);pipeline.setChainHead(head);
  if (rows.length>=maxCandidates || event.failed || !event.logs.some(l=>/^Program log: Instruction: CreateV2$/.test(l)) ||
      rows.some(r=>r.event.signature===event.signature)) return;
  rows.push({event,finalityPolls:0,receiptCommitment:"confirmed",receivedMonoOffsetMs:performance.now()-startMono});
  void pipeline.acceptDurable(event).then(r=> { if(r.status!=="accepted" && r.status!=="deferred") refused++; }).catch(()=>refused++);
});
monitor.start();
await new Promise(r=>setTimeout(r,seconds*1000));
monitor.stop();
await pipeline.drain(60000);
await market.poll();
await store.paperTransaction(s=>{s.running=false;});
await market.close(); await pipeline.close();
const restarted = await load(`${output}/ledger.json`,initializeMarketLedger(initial(strategy)),metrics,true);
await writeFile(`${output}/evidence.json`,JSON.stringify(publicEvidence({startedAt,endedAt:Date.now(),seconds,
  maxCandidates,notifications,refused,provider:new URL(endpoint).host,policy:paper.policy,rows,captured,
  journal:journal.status(),telemetry:metrics.report(), ledger:store.state,
  restart:{running:restarted.state.running,positions:restarted.state.positions.length,trades:restarted.state.trades.length,
    seenRetained:JSON.stringify(restarted.state.seen)===JSON.stringify(store.state.seen)},
  liveTrading:false,scope:"Current confirmed WebSocket receipts; strict finalized creation verification; current finalized accounts. No invented fill or risk overrides. Public RPC errors and unsupported variants are retained."}),null,2)+"\n");
console.log(JSON.stringify({notifications,candidates:rows.length,trades:store.state.trades.length,reviews:store.state.marketReviews?.length}));
