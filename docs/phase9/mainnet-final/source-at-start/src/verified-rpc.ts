import { HttpRecoveryRpc } from "./backfill.js";
import {
  requiredLaunchAccounts,
  decodeVerifiedTransaction,
  type ParsedChainTransaction,
  type VerifiedLaunch,
  type AccountEvidence,
} from "./verified-decoders.js";
export class UnknownProtocolLayoutError extends Error {}
/** Native JSON RPC reader supports parsed legacy/v0/v1 without the legacy SDK's response validator. */
export class VerifiedReadRpc extends HttpRecoveryRpc {
  constructor(private endpoint: string) {
    super(endpoint);
  }
  private async read(method: string, params: unknown[]) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Error(`Read-only verification HTTP ${response.status}`);
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
    if (body.error) throw Error("Read-only verification RPC error");
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
    return this.read("getTransaction", [
      signature,
      {
        commitment: "finalized",
        encoding: "jsonParsed",
        maxSupportedTransactionVersion: 1,
      },
    ]);
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
