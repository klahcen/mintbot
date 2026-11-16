import { z } from "zod";
import type { State } from "../model.js";
export const LifecycleSchema = z.object({
  id: z.string(), signature: z.string(), program: z.string(), slot: z.number().int().nonnegative().safe(),
  receiptAt: z.number().finite().nonnegative(),
  invalidated: z.boolean(),
  transitions: z.array(z.object({
    state: z.enum(["DETECTED", "PROVISIONAL", "VERIFIED", "ELIGIBLE", "PAPER_EXECUTED"]),
    commitment: z.enum(["processed", "confirmed", "finalized"]),
    at: z.number().finite().nonnegative(), ageMs: z.number().finite().nonnegative(),
    provider: z.string(), reason: z.string(),
  }).strict()).min(1).max(5),
  conflict: z.string().optional(),
}).strict();
export type Lifecycle = z.infer<typeof LifecycleSchema>;
type Step = Lifecycle["transitions"][number]["state"];
type Commitment = Lifecycle["transitions"][number]["commitment"];
const steps: Step[] = ["DETECTED", "PROVISIONAL", "VERIFIED", "ELIGIBLE", "PAPER_EXECUTED"];
const ranks = { processed: 0, confirmed: 1, finalized: 2 };
/** A notification is only provisional evidence. No transition creates protocol proof or eligibility. */
export function transition(s: State, subject: {
  id: string; signature: string; program: string; slot: number; receiptAt: number;
}, step: Step, commitment: Commitment, provider: string, reason: string, now = Date.now()) {
  s.marketLifecycle ??= [];
  let row = s.marketLifecycle.find(r => r.id === subject.id);
  if (!row) {
    if (step !== "DETECTED") throw Error("Lifecycle must start at detection");
    if (!Number.isFinite(subject.receiptAt) || subject.receiptAt > now) throw Error("Invalid observation time");
    row = { ...subject, invalidated: false, transitions: [] };
    s.marketLifecycle.unshift(row);
    s.marketLifecycle = s.marketLifecycle.slice(0, 200);
  }
  if (row.invalidated) throw Error("Observation invalidated; reconciliation required");
  const last = row.transitions.at(-1);
  if (row.slot !== subject.slot || row.signature !== subject.signature || row.program !== subject.program ||
      (last && ranks[commitment] < ranks[last.commitment])) {
    row.invalidated = true;
    row.conflict = "Rollback or provider identity/commitment conflict";
    return false;
  }
  if (last?.state === step) return true;
  const next = last ? steps.indexOf(last.state) + 1 : 0;
  if (steps.indexOf(step) !== next) throw Error("Nonsequential lifecycle transition");
  if (next >= 2 && commitment !== "finalized") throw Error("Finalized verification required");
  if (last && now < last.at) throw Error("Regressing lifecycle clock");
  row.transitions.push({ state: step, commitment, at: now, ageMs: now - row.receiptAt, provider, reason });
  return true;
}
/** Verified launches already have strict finalized instruction/account proof; missing receipt history is explicit. */
export function verifiedLifecycle(s: State, launch: {
  id: string; signature: string; program: string; slot: number;
  creationCommitment?: string; sourceProvider?: string; freshness?: { receiptAt: number };
}, now = Date.now()) {
  if (launch.creationCommitment !== "finalized") throw Error("Finalized creation verification unavailable");
  const subject = { id: launch.id, signature: launch.signature, program: launch.program,
    slot: launch.slot, receiptAt: launch.freshness?.receiptAt ?? now };
  const provider = launch.sourceProvider ?? "unknown";
  let row = s.marketLifecycle?.find(r => r.id === launch.id);
  if (!row) {
    const receipt = s.marketLifecycle?.find(r => r.id === `${launch.program}:${launch.signature}`);
    if (receipt) {
      if (receipt.invalidated || receipt.slot !== launch.slot) throw Error("Observation invalidated");
      row = { ...structuredClone(receipt), id: launch.id };
      s.marketLifecycle!.unshift(row);
      s.marketLifecycle = s.marketLifecycle!.slice(0, 200);
    }
  }
  if (!row) {
    transition(s, subject, "DETECTED", "finalized", provider, "First recorded after finalized verification; earlier commitments unobserved", now);
    transition(s, subject, "PROVISIONAL", "finalized", provider, "Receipt history unavailable; no earlier finality timing claimed", now);
    row = s.marketLifecycle!.find(r => r.id === launch.id)!;
  }
  if (row.transitions.length <= 2 && !transition(s, subject, "VERIFIED", "finalized", provider,
    "Strict protocol instruction, identity and account validation", now)) throw Error("Observation invalidated");
  if (row.invalidated || row.slot !== launch.slot || row.signature !== launch.signature) throw Error("Observation invalidated");
  return subject;
}
