import { RpcHealth } from "./rpc-health.js";
import { HttpRecoveryRpc } from "./backfill.js";
import {
  requiredLaunchAccounts,
  decodeVerifiedTransaction,
  type ParsedChainTransaction,
  type VerifiedLaunch,
  type AccountEvidence,
} from "./verified-decoders.js";
import { BoundedStage } from './stages.js';
import { Telemetry } from './telemetry.js';
export interface VerificationSchedule {
  minimumIntervalMs: number;
  deadlineMs: number;
  maximumAttempts: number;
  capacity: number;
  metrics?: Telemetry;
}
export class UnknownProtocolLayoutError extends Error {}
/** Native JSON RPC reader supports parsed legacy/v0/v1 without the legacy SDK's response validator. */
export class VerifiedReadRpc extends HttpRecoveryRpc {
  readonly health = new RpcHealth();
  private schedule?: BoundedStage;
  private nextReadMonoMs = 0;
  private metrics: Telemetry;
  constructor(private endpoint: string, private scheduling?: VerificationSchedule) {
    super(endpoint);
    this.metrics = scheduling?.metrics ?? new Telemetry();
    if (scheduling) {
      for (const [value, low, high] of [[scheduling.minimumIntervalMs, 0, 5000],
          [scheduling.deadlineMs, 1, 30000], [scheduling.maximumAttempts, 1, 3], [scheduling.capacity, 1, 64]])
        if (!Number.isSafeInteger(value) || value < low || value > high) throw Error('Verification scheduling bound');
      this.schedule = new BoundedStage('verification.rpc', scheduling.capacity, 1, this.metrics);
    }
  }
  private async read(method: string, params: unknown[]) {
    if (!this.schedule || !this.scheduling) return this.readOnce(method, params, 5000);
    const began = this.metrics.now(), deadline = began + this.scheduling.deadlineMs;
    const task = this.schedule.trySubmit(async () => {
      for (let attempt = 0; attempt < this.scheduling!.maximumAttempts; attempt++) {
        const wait = Math.max(0, this.nextReadMonoMs - this.metrics.now());
        if (this.metrics.now() + wait >= deadline) throw Error('Verification scheduling deadline exceeded');
        if (wait) await new Promise(resolve => setTimeout(resolve, wait));
        this.nextReadMonoMs = this.metrics.now() + this.scheduling!.minimumIntervalMs;
        try {
          return await this.readOnce(method, params, Math.max(1, Math.min(5000, deadline - this.metrics.now())));
        } catch (error) {
          const detail = error as { httpStatus?: number; retryAfterMs?: number };
          if (detail.httpStatus !== 429) throw error;
          this.metrics.increment('verification.http_429');
          const delay = Math.max(this.scheduling!.minimumIntervalMs, detail.retryAfterMs ?? 1000);
          this.nextReadMonoMs = Math.max(this.nextReadMonoMs, this.metrics.now() + delay);
          if (attempt + 1 >= this.scheduling!.maximumAttempts || this.nextReadMonoMs >= deadline) throw error;
          this.metrics.increment('verification.bounded_retries');
        }
      }
      throw Error('Verification retry budget exhausted');
    }, began, method === 'getTransaction' && (params[1] as {commitment?:string})?.commitment === 'finalized' ? 1 : 0);
    if (!task) throw Error('Verification scheduling capacity exceeded');
    return task;
  }
  private async readOnce(method: string, params: unknown[], timeoutMs: number) {
    try {
      const result = await this.transportRead(method, params, timeoutMs);
      this.health.success();
      return result;
    } catch (error) {
      this.health.failure(error as {httpStatus?:number;rpcCode?:number});
      throw error;
    }
  }
  private async transportRead(method: string, params: unknown[], timeoutMs: number) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const header = response.headers.get('retry-after');
      const parsed = header === null ? undefined : /^\d+(?:\.\d+)?$/.test(header)
        ? Number(header) * 1000 : Date.parse(header) - Date.now();
      throw Object.assign(Error(`Read-only verification HTTP ${response.status}`), {
        httpStatus: response.status,
        retryAfterMs: parsed !== undefined && Number.isFinite(parsed) ? Math.max(0, parsed) : undefined,
      });
    }
    const reader = response.body!.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 4 * 1024 * 1024) {
          await reader.cancel();
          throw Error("Verification response size bound");
        }
        chunks.push(part.value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (body.error || body.id !== 1 || body.jsonrpc !== '2.0' || !Object.prototype.hasOwnProperty.call(body, 'result'))
      throw Object.assign(Error("Read-only verification RPC error or invalid response identity"), {
        rpcCode: Number.isInteger(body.error?.code) ? body.error.code : undefined,
      });
    return body.result;
  }
  /** Confirmed preparation only: exposes candidate keys, never a VerifiedLaunch or finalized account evidence. */
  async provisional(program: string, signature: string, expectedSlot: number) {
    const tx: ParsedChainTransaction | null = await this.read("getTransaction", [signature, {
      commitment: "confirmed", encoding: "jsonParsed", maxSupportedTransactionVersion: 1,
    }]);
    if (!tx) return null;
    if (tx.transaction.signatures[0] !== signature || tx.slot !== expectedSlot)
      throw new UnknownProtocolLayoutError("Provisional provider identity/slot conflict");
    return { signature, slot: tx.slot, commitment: "confirmed" as const,
      keys: requiredLaunchAccounts(program, tx), transaction: tx,
      provider: new URL(this.endpoint).host, observedAt: Date.now(),
      executionEligible: false as const };
  }
  async transaction(signature: string): Promise<ParsedChainTransaction | null> {
    const result = await this.read("getTransaction", [
      signature,
      {
        commitment: "finalized",
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 1,
      },
    ]);
    if (result && !["legacy", 0, 1].includes(result.version))
      throw new UnknownProtocolLayoutError("Unsupported transaction version");
    return result;
  }
  async accounts(keys: string[]): Promise<AccountEvidence> {
    if (keys.length > 32) throw Error("Verification account request bound");
    const r = await this.read("getMultipleAccounts", [
      keys,
      { commitment: "finalized", encoding: "base64" },
    ]);
    if (
      !r?.context ||
      !Array.isArray(r.value) ||
      r.value.length !== keys.length
    )
      throw Error("Missing account response");
    return {
      contextSlot: r.context.slot,
      commitment: "finalized",
      accounts: Object.fromEntries(keys.map((key, i) => [key, r.value[i]])),
    };
  }
  async verify(
    program: string,
    signature: string,
    expectedSlot?: number,
  ): Promise<VerifiedLaunch[] | null> {
    const tx = await this.transaction(signature);
    if (!tx) return null;
    if (tx.version === 1)
      throw new UnknownProtocolLayoutError("Version 1 creation execution blocked: signed-wire/config/account equivalence validation unavailable");
    if (tx.transaction.signatures[0] !== signature)
      throw Error("Verification signature mismatch");
    if (expectedSlot !== undefined && tx.slot !== expectedSlot)
      throw new UnknownProtocolLayoutError(
        "Fork or provider conflict: finalized slot differs from receipt",
      );
    let keys: string[];
    try {
      keys = requiredLaunchAccounts(program, tx);
    } catch (e) {
      throw new UnknownProtocolLayoutError(
        e instanceof Error ? e.message : "Invalid instruction",
      );
    }
    if (!keys.length) return [];
    const evidence = await this.accounts(keys);
    try {
      return decodeVerifiedTransaction(program, tx, evidence).map((launch) => ({
        ...launch,
        verifiedAt: Date.now(),
        ...(typeof tx.blockTime === "number"
          ? { blockTimeMs: tx.blockTime * 1000 }
          : {}),
        sourceProvider: new URL(this.endpoint).host,
        creationCommitment: "finalized" as const,
      }));
    } catch (e) {
      throw new UnknownProtocolLayoutError(
        e instanceof Error ? e.message : "Unknown layout",
      );
    }
  }
}
