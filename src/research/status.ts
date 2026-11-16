/** Bounded public projection only. This endpoint is observation, never execution authority. */
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import { z } from "zod";
const text = z.string().max(500).transform(value => value
  .replace(/https?:\/\/[^\s]+|wss?:\/\/[^\s]+/gi, "[endpoint redacted]")
  .replace(/(?:bearer|password|secret|api[_-]?key|access[_-]?token)\s*[:= ]\s*[^\s,;]+/gi, "[credential redacted]"));
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const timestamp = count.max(8640000000000000);
const amount = z.string().regex(/^-?\d+(?:\.\d+)?$/).max(80);
const status = z.enum(["verified", "unknown", "stale", "failed", "rejected", "eligible", "healthy", "quarantined", "unavailable", "passed", "blocked"]);
const list = <T extends z.ZodType>(schema: T, max = 100) => z.array(schema).max(max).default([]);
export const ResearchSnapshotSchema = z.object({
  schemaVersion: z.literal(1), generatedAt: timestamp,
  scope: text,
  runStatus: z.enum(["running", "stopped", "failed"]).optional(),
  notifications: count.default(0), verifiedCreations: count.default(0),
  launches: list(z.object({ identity:text, protocol:text, slot:count, verification:status,
    market:status, decision:status, reasons:list(text,20), buySimulation:status.default("unknown"), sellSimulation:status.default("unknown") })),
  paper: z.object({ positions:count, trades:count, realizedPnlSol:amount,
    unrealizedPnlSol:amount.optional(), positionsDetail:list(z.object({mint:text,protocol:text,quantityAtoms:amount,markStatus:status,markAt:timestamp.optional(),pnlSol:amount.optional()}),50) }).optional(),
  providers: list(z.object({identity:text,status,finalizedSlot:count.optional(),errors:count,rateLimits:count}),8),
  wal: z.object({ status, bytes:count.optional(), queueDepth:count.optional(), backlogAgeMs:z.number().nonnegative().optional(), recoveryGaps:count.optional(), detail:text.optional() }).optional(),
  intents:list(z.object({id:text,state:text,updatedAt:timestamp.optional()}),100),
  latencies:list(z.object({name:text,count,p50:z.number().nonnegative(),p95:z.number().nonnegative(),p99:z.number().nonnegative()}),80),
  readiness:list(z.object({name:text,status,detail:text}),30),
});
export type ResearchSnapshot = z.infer<typeof ResearchSnapshotSchema>;
export function projectResearchStatus(input: unknown, now = Date.now()) {
  const parsed = ResearchSnapshotSchema.safeParse(input);
  if (!parsed.success || parsed.data.generatedAt > now + 5000)
    return {status:"unavailable" as const, reason:"Invalid research snapshot", liveTrading:false as const};
  const ageMs=Math.max(0,now-parsed.data.generatedAt);
  const paper=parsed.data.paper;
  if(paper){
    for(const position of paper.positionsDetail){
      if(position.markStatus==="verified" && (position.markAt===undefined || now<position.markAt || now-position.markAt>1500)){
        position.markStatus="stale";delete position.pnlSol;
      }
    }
    if(paper.positionsDetail.length!==paper.positions || paper.positionsDetail.some(p=>p.markStatus!=="verified"))delete paper.unrealizedPnlSol;
  }
  return {status:ageMs>30000 ? "stale" as const : "available" as const, ageMs,
    liveTrading:false as const, fundedExecution:"disabled" as const, evidence:parsed.data};
}
export async function readResearchStatus(path: string | undefined, now=Date.now()) {
  if (!path) return {status:"unavailable" as const, reason:"Research snapshot not configured",liveTrading:false as const};
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    file=await open(path,constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const info=await file.stat();
    if (!info.isFile() || info.size>1024*1024) throw Error("Invalid snapshot");
    const bytes=Buffer.alloc(1024*1024+1);
    const {bytesRead}=await file.read(bytes,0,bytes.length,0);
    if (bytesRead>1024*1024) throw Error("Snapshot limit");
    return projectResearchStatus(JSON.parse(bytes.subarray(0,bytesRead).toString("utf8")),now);
  } catch {
    return {status:"unavailable" as const,reason:"Research snapshot unavailable or invalid",liveTrading:false as const};
  } finally { await file?.close(); }
}
