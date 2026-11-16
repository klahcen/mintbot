import { validateResearchProviders } from "./provider-config.js";
import { createHash } from "node:crypto";

export const MAINNET_GENESIS = "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";
export interface ResearchProviderConfig {
  id: string;
  endpoint: string;
  operator?: { name: string; attribution: string };
}
export interface ProviderObservation {
  provider: string; host: string; operator?: string; observedAt: number;
  genesis?: string; finalizedSlot?: number;
  transaction?: { slot: number; confirmationStatus: string | null; err: unknown } | null;
  state?: { slot: number; digest: string; missingAccounts: number };
  error?: string;
}
export type ProviderTransport = (config: ResearchProviderConfig, method: string, params: unknown[]) => Promise<any>;
export interface ProviderAssessment {
  status: "verified" | "unknown" | "failed";
  eligible: boolean; reasons: string[]; observations: ProviderObservation[];
  independence: "attributed-distinct-operators" | "unknown";
  quarantined: string[]; gaps: { provider: string; from: number; to: number; reason: string }[];
  liveAuthorized: false;
}
/** Research-only comparisons. Attributed operator identity is configuration evidence, not a cryptographic proof. */
export class ProviderConsistency {
  private quarantines = new Map<string, string>();
  private lastSlots = new Map<string, number>();
  private resolutionEntries: { provider: string; reviewer: string; reason: string; at: number }[] = [];
  readonly providers: readonly ResearchProviderConfig[];
  get resolutions() {return this.resolutionEntries.map(r=>({...r}));}
  constructor(providers: readonly ResearchProviderConfig[], private transport: ProviderTransport = boundedProviderRead) {
    validateResearchProviders(providers);
    this.providers=Object.freeze(providers.map(p=>Object.freeze({...p,operator:p.operator?Object.freeze({...p.operator}):undefined})));
    if (providers.length < 2 || providers.length > 3 || new Set(providers.map(p => p.id)).size !== providers.length)
      throw Error("Two or three unique providers required");
    for (const p of providers) {
      const url = new URL(p.endpoint);
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(p.id) || url.username || url.password || !["https:", "http:"].includes(url.protocol))
        throw Error("Invalid provider identity or transport");
      if (p.operator && (!p.operator.name.trim() || !/^https:\/\//.test(p.operator.attribution))) throw Error("Operator attribution required");
    }
  }
  quarantine(provider: string, reason: string) {
    if (!this.providers.some(p => p.id === provider) || !reason || reason.length > 1000) throw Error("Invalid quarantine");
    this.quarantines.set(provider, reason);
  }
  resolve(provider: string, reviewer: string, reason: string) {
    if (!this.quarantines.has(provider) || !reviewer.trim() || !reason.trim() || reviewer.length > 128 || reason.length > 1000)
      throw Error("Manual discrepancy identity and reason required");
    if(this.resolutionEntries.length>=1000)throw Error("Research resolution journal bound; export and start a reviewed session");
    this.resolutionEntries.push({provider, reviewer, reason, at: Date.now()}); this.quarantines.delete(provider);
    // A manual resolution clears quarantine only. The next observation must independently pass every check.
  }
  async readAvailable(method: "getGenesisHash" | "getSlot" | "getSignatureStatuses" | "getMultipleAccounts", params: unknown[], maximumAttempts = 2) {
    if(!["getGenesisHash","getSlot","getSignatureStatuses","getMultipleAccounts"].includes(method) || !Number.isInteger(maximumAttempts) || maximumAttempts<1 || maximumAttempts>this.providers.length || Buffer.byteLength(JSON.stringify(params))>65536)throw Error("Read-only failover bounds");
    const failures:string[]=[];let attempts=0;
    for(const p of this.providers) {
      if(this.quarantines.has(p.id))continue;if(attempts++>=maximumAttempts)break;
      try{return {provider:p.id,result:await this.transport(p,method,params),attempts,failures,agreement:"unknown" as const,eligible:false as const,liveAuthorized:false as const};}
      catch{failures.push(p.id);}
    }
    throw Error(`Bounded read-only failover unavailable after ${Math.min(attempts,maximumAttempts)} attempts`);
  }
  async inspect(input: {signature?: string; accounts?: string[]; minimumSlot?: number; maximumSlotLag?: number} = {}): Promise<ProviderAssessment> {
    const accounts = input.accounts ?? [], minimum = input.minimumSlot ?? 0, lag = input.maximumSlotLag ?? 32;
    if (!Number.isSafeInteger(minimum) || minimum < 0 || !Number.isSafeInteger(lag) || lag < 0 || lag > 512 || accounts.length > 32 || new Set(accounts).size !== accounts.length || accounts.some(a => !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) || (input.signature && !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(input.signature))) throw Error("Provider comparison bounds");
    const reasons: string[] = [], gaps: ProviderAssessment["gaps"] = [];
    const observations = await Promise.all(this.providers.map(async p => {
      const o: ProviderObservation = {provider:p.id, host:new URL(p.endpoint).host, operator:p.operator?.name, observedAt:Date.now()};
      if (this.quarantines.has(p.id)) return {...o,error:"Provider quarantined; manual review required"};
      try {
        const values = await Promise.all([
          this.transport(p,"getGenesisHash",[]), this.transport(p,"getSlot",[{commitment:"finalized"}]),
          input.signature ? this.transport(p,"getSignatureStatuses",[[input.signature],{searchTransactionHistory:true}]) : null,
          accounts.length ? this.transport(p,"getMultipleAccounts",[accounts,{encoding:"base64",commitment:"finalized",minContextSlot:minimum}]) : null,
        ]);
        o.genesis = values[0]; o.finalizedSlot = values[1];
        if(o.genesis !== MAINNET_GENESIS) {this.quarantine(p.id,"Unexpected genesis hash");throw Error("Wrong chain identity");}
        if(!Number.isSafeInteger(o.finalizedSlot) || o.finalizedSlot! < minimum) throw Error("Finalized slot unavailable or behind required event");
        const previous = this.lastSlots.get(p.id);
        if(previous !== undefined && o.finalizedSlot! < previous) {this.quarantine(p.id,"Finalized slot regressed");throw Error("Finalized slot regression");}
        if(previous !== undefined && o.finalizedSlot! > previous + 1) gaps.push({provider:p.id,from:previous+1,to:o.finalizedSlot!-1,reason:"Unobserved slot interval between bounded polls; not proof of lost events"});
        this.lastSlots.set(p.id,o.finalizedSlot!);
        if(input.signature) {
          const s = values[2]; if(!Array.isArray(s?.value) || s.value.length !== 1 || !Number.isSafeInteger(s.context?.slot) || s.context.slot<minimum) throw Error("Invalid transaction status evidence");
          const v=s.value[0]; if(v && (!Number.isSafeInteger(v.slot) || v.slot<0 || v.slot>s.context.slot || !("err" in v) || !["processed","confirmed","finalized",null].includes(v.confirmationStatus))) throw Error("Invalid transaction status evidence");
          o.transaction=v ? {slot:v.slot,confirmationStatus:v.confirmationStatus,err:v.err} : null;
        }
        if(accounts.length) {
          const s=values[3]; if(!Number.isSafeInteger(s?.context?.slot) || s.context.slot<minimum || !Array.isArray(s.value) || s.value.length!==accounts.length || s.value.some((a:any)=>a!==null && (!a || typeof a.owner!=="string" || !Number.isSafeInteger(a.lamports) || a.lamports<0 || typeof a.executable!=="boolean" || !Array.isArray(a.data) || a.data[1]!=="base64" || typeof a.data[0]!=="string"))) throw Error("Invalid account context evidence");
          // JSON RPC field order is irrelevant; canonicalization prevents false conflicts.
          o.state={slot:s.context.slot,digest:createHash("sha256").update(canonical(s.value)).digest("hex"),missingAccounts:s.value.filter((a:unknown)=>a===null).length};
        }
      } catch(e) {const message=e instanceof Error?e.message:"";o.error=/^Provider (?:HTTP \d{3}|RPC -?\d+)$/.test(message)?message:"Read-only provider unavailable or inconsistent evidence";}
      return o;
    }));
    const good=observations.filter(o=>!o.error), ops=this.providers.map(p=>p.operator?.name.trim().toLowerCase());
    const independent=ops.every(Boolean) && new Set(ops).size===ops.length && new Set(this.providers.map(p=>new URL(p.endpoint).origin)).size===this.providers.length;
    let conflict=false;
    if(good.some(o=>o.state?.missingAccounts))reasons.push("Requested account missing; market completeness unknown");
    if(good.some(o=>o.transaction?.confirmationStatus==="finalized" && o.transaction.err!==null)){reasons.push("Observed transaction failed on chain");conflict=true;}
    for(let i=0;i<good.length;i++) for(let j=i+1;j<good.length;j++) {
      const a=good[i],b=good[j];
      if(Math.abs(a.finalizedSlot!-b.finalizedSlot!)>lag) reasons.push("Finalized provider slot lag exceeds bound");
      if(a.state && b.state) {
        if(a.state.slot!==b.state.slot) reasons.push("Account banks differ; state agreement unknown");
        else if(a.state.digest!==b.state.digest) {reasons.push("Conflicting account state at identical finalized bank");conflict=true;this.quarantine(a.provider,"Same-bank state conflict");this.quarantine(b.provider,"Same-bank state conflict");}
      }
      if(input.signature) {
        const x=a.transaction,y=b.transaction;
        if(!x || !y || x.confirmationStatus!=="finalized" || y.confirmationStatus!=="finalized") reasons.push("Transaction finalization agreement unknown");
        else if(x.slot!==y.slot || canonical(x.err)!==canonical(y.err)) {reasons.push("Conflicting finalized transaction status");conflict=true;this.quarantine(a.provider,"Finalized transaction conflict");this.quarantine(b.provider,"Finalized transaction conflict");}
      }
    }
    if(good.length!==this.providers.length) reasons.push("Provider failure or quarantine; failover cannot establish independent agreement");
    if(!independent) reasons.push("Independent provider operation lacks distinct source attribution");
    const status=conflict ? "failed" : reasons.length ? "unknown" : "verified";
    return {status,eligible:status==="verified",reasons:[...new Set(reasons)],observations,independence:independent?"attributed-distinct-operators":"unknown",quarantined:[...this.quarantines.keys()],gaps,liveAuthorized:false};
  }
}
function canonical(value: any): string {return JSON.stringify(value,(_k,v)=>v && typeof v==="object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v);}
/** No retries and at most four allowlisted reads per provider per inspection. No signing or transaction submission method exists. */
export async function boundedProviderRead(config: ResearchProviderConfig, method: string, params: unknown[]) {
  if(!["getGenesisHash","getSlot","getSignatureStatuses","getMultipleAccounts"].includes(method)) throw Error("Read-only provider method denied");
  const r=await fetch(config.endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),signal:AbortSignal.timeout(5000),redirect:"error"});
  if(!r.ok || !r.body) {await r.body?.cancel();throw Error(`Provider HTTP ${r.status}`);}
  const reader=r.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try {for(;;){const n=await reader.read();if(n.done)break;length+=n.value.length;if(length>4*1024*1024){await reader.cancel();throw Error("Provider response bound");}chunks.push(n.value);}} finally{reader.releaseLock();}
  const b=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(b.id!==1)throw Error("Invalid provider RPC response");if(Number.isSafeInteger(b.error?.code))throw Error(`Provider RPC ${b.error.code}`);if(b.error || !("result" in b))throw Error("Invalid provider RPC response");return b.result;
}
