import { RpcHealth } from "../rpc-health.js";
import { performance } from "node:perf_hooks";
import { Telemetry, telemetry } from "../telemetry.js";
import { PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import pins from "./deployment-pins.json" with { type: "json" };
import { verified, type Signal } from "./types.js";
import type { MarketReader, MarketBatch } from "./types.js";
/** Allowlisted read-only transport. Credentials never appear in evidence or errors. */
export class MarketRpc implements MarketReader {
  readonly provider: string;
  readonly health = new RpcHealth();
  constructor(
    private endpoint: string,
    private metrics: Telemetry = telemetry,
    private timeoutMs = 5000,
  ) {
    const url = new URL(endpoint);
    if (!["http:", "https:"].includes(url.protocol))
      throw Error("Invalid RPC transport");
    this.provider = url.host;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
      throw Error("RPC timeout bound");
  }
  private async read(
    method:
      | "getMultipleAccounts"
      | "getTokenLargestAccounts"
      | "getProgramAccounts"
      | "getLatestBlockhash"
      | "getRecentPrioritizationFees"
      | "getFeeForMessage"
      | "getMinimumBalanceForRentExemption",
    params: unknown[],
  ): Promise<any> {
    return this.metrics.rpc(`market.${method}`, async () => {
      let httpStatus: number | undefined, rpcCode: number | undefined;
      try {
        const r = await fetch(this.endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!r.ok || !r.body) {
          await r.body?.cancel();
          httpStatus = r.status;
          throw Error("Market RPC HTTP failure");
        }
        const reader = r.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          for (;;) {
            const p = await reader.read();
            if (p.done) break;
            size += p.value.length;
            if (size > 4 * 1024 * 1024) {
              await reader.cancel();
              throw Error("Market RPC byte bound");
            }
            chunks.push(p.value);
          }
        } finally {
          reader.releaseLock();
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (Number.isInteger(body.error?.code)) rpcCode = body.error.code;
        if (body.error || body.id !== 1 || !body.result)
          throw Error("Market RPC invalid response");
        this.health.success();
        return body.result;
      } catch {
        this.health.failure({ httpStatus, rpcCode });
        throw Object.assign(Error("Market read failed or timed out"), { httpStatus, rpcCode });
      }
    });
  }
  async accounts(keys: string[], minimumSlot: number): Promise<MarketBatch> {
    if (!keys.length || keys.length > 32 || new Set(keys).size !== keys.length)
      throw Error("Market account bound");
    const r = await this.read("getMultipleAccounts", [
      keys,
      {
        encoding: "base64",
        commitment: "finalized",
        minContextSlot: minimumSlot,
      },
    ]);
    if (
      !Number.isSafeInteger(r?.context?.slot) ||
      r.context.slot < minimumSlot ||
      !Array.isArray(r.value) ||
      r.value.length !== keys.length
    )
      throw Error("Inconsistent provider evidence");
    return {
      contextSlot: r.context.slot,
      commitment: "finalized",
      provider: this.provider,
      retrievedAt: Date.now(),
      retrievedMono: performance.now(),
      accounts: Object.fromEntries(keys.map((k, i) => [k, r.value[i]])),
    };
  }
  async largest(mint: string, minimumSlot: number) {
    const r = await this.read("getTokenLargestAccounts", [
      mint,
      { commitment: "finalized" },
    ]);
    if (
      !Number.isSafeInteger(r?.context?.slot) ||
      r.context.slot < minimumSlot ||
      !Array.isArray(r.value) ||
      r.value.length > 20 ||
      r.value.some((v: any) => !/^\d+$/.test(v.amount))
    )
      throw Error("Inconsistent holder evidence");
    return {
      slot: r.context.slot,
      amounts: r.value.map((v: any) => v.amount as string),
    };
  }
  async holders(
    mint: string,
    program: string,
    minimumSlot: number,
  ): Promise<string[]> {
    const r = await this.read("getProgramAccounts", [
      program,
      {
        commitment: "finalized",
        minContextSlot: minimumSlot,
        withContext: true,
        encoding: "base64",
        dataSlice: { offset: 0, length: 0 },
        filters: [{ memcmp: { offset: 0, bytes: mint } }],
      },
    ]);
    if (
      !Number.isSafeInteger(r?.context?.slot) ||
      r.context.slot < minimumSlot ||
      !Array.isArray(r.value) ||
      r.value.length > 20
    )
      throw Error("Complete holder enumeration unavailable or exceeds bound");
    return r.value.map((a: any) => a.pubkey);
  }
  async deployment(program: string, minimumSlot: number): Promise<Signal> {
    const pin = (
      pins as Record<string, { dataAddress: string; deploymentSlot: number }>
    )[program];
    if (!pin) throw Error("Unpinned deployment");
    const r = await this.read("getMultipleAccounts", [
      [program, pin.dataAddress],
      {
        commitment: "finalized",
        encoding: "base64",
        minContextSlot: minimumSlot,
        dataSlice: { offset: 0, length: 45 },
      },
    ]);
    if (
      !Number.isSafeInteger(r?.context?.slot) ||
      r.context.slot < minimumSlot ||
      !Array.isArray(r.value) ||
      r.value.length !== 2
    )
      throw Error("Missing deployment evidence");
    const [p, d] = r.value;
    const loader = "BPFLoaderUpgradeab1e11111111111111111111111";
    if (
      !p?.executable ||
      d?.executable ||
      p.owner !== loader ||
      d.owner !== loader ||
      p.data?.[1] !== "base64" ||
      d.data?.[1] !== "base64"
    )
      throw Error("Unsupported program loader");
    const pb = Buffer.from(p.data[0], "base64"),
      db = Buffer.from(d.data[0], "base64");
    if (
      pb.length !== 36 ||
      db.length !== 45 ||
      pb.readUInt32LE(0) !== 2 ||
      db.readUInt32LE(0) !== 3 ||
      new PublicKey(pb.subarray(4, 36)).toBase58() !== pin.dataAddress ||
      db.readBigUInt64LE(4) !== BigInt(pin.deploymentSlot)
    )
      throw Error("Unsupported upgraded program version");
    return { ...verified(
      {
        program,
        deploymentSlot: pin.deploymentSlot,
        programData: pin.dataAddress,
      },
      "Observed upgradeable-loader deployment slot equals reviewed pin; ELF hash/semantic equivalence not proven",
      r.context.slot,
    ), observedAt: Date.now(), provider: this.provider, commitment: "finalized" as const };
  }
  async fees(addresses: string[]) {
    const values = await Promise.allSettled([
      this.read("getLatestBlockhash", [{ commitment: "finalized" }]),
      this.read("getRecentPrioritizationFees", [addresses.slice(0, 16)]),
      this.read("getMinimumBalanceForRentExemption", [
        182,
        { commitment: "finalized" },
      ]),
    ]);
    if (values.some((v) => v.status === "rejected"))
      throw Error("Network fee evidence unavailable");
    const [block, priority, rent] = values.map(
      (v) => (v as PromiseFulfilledResult<any>).value,
    );
    if (
      !Array.isArray(priority) ||
      !priority.length ||
      priority.length > 150 ||
      !Number.isSafeInteger(rent) ||
      rent < 0 ||
      !block?.value?.blockhash
    )
      throw Error("Invalid fee evidence");
    const rates = priority
      .map((p: any) => p.prioritizationFee)
      .sort((a: number, b: number) => a - b);
    if (rates.some((v: any) => !Number.isSafeInteger(v) || v < 0))
      throw Error("Invalid priority fee sample");
    const computeUnitLimit = 200000;
    const rate = BigInt(rates[Math.floor((rates.length - 1) * 0.75)]);
    // Public-only representative signer address. The System Program cannot also be
    // the payer: a programIdIndex of zero makes getFeeForMessage reject the message.
    const representativePayer = new PublicKey(Buffer.alloc(32, 1));
    const message = new Transaction({
      recentBlockhash: block.value.blockhash,
      feePayer: representativePayer,
    })
      .add(
        SystemProgram.transfer({
          fromPubkey: representativePayer,
          toPubkey: new PublicKey(addresses[0]),
          lamports: 0,
        }),
      )
      .compileMessage();
    const base = await this.read("getFeeForMessage", [
      message.serialize().toString("base64"),
      { commitment: "finalized" },
    ]);
    if (!Number.isSafeInteger(base?.value) || base.value <= 0)
      throw Error("Fee calculator unavailable");
    return verified(
      {
        baseLamports: String(base.value),
        priorityLamports: (
          (rate * BigInt(computeUnitLimit) + 999999n) /
          1000000n
        ).toString(),
        rentLamports: String(rent),
        computeUnitLimit,
        observedAt: Date.now(),
      },
      "Read-only one-signature base-fee message; recent priority p75 at assumed 200k CU; conservative new 182-byte ATA rent. CU use and account creation not transaction-simulated.",
      base.context?.slot,
    );
  }
}
