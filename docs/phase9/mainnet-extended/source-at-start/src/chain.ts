import { telemetry, type Telemetry } from "./telemetry.js";
import {
  PublicKey,
  ComputeBudgetProgram,
  type Connection,
  type ParsedInstruction,
  type PartiallyDecodedInstruction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
  getExtensionTypes,
  ExtensionType,
} from "@solana/spl-token";
import bs58 from "bs58";
import WebSocket from "ws";
export interface ProgramDefinition {
  name: string;
  address: string;
  source: string;
  cluster: "mainnet-beta";
}
export const VERIFIED_PROGRAMS: readonly ProgramDefinition[] = [
  {
    name: "pump",
    address: "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P",
    source:
      "https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_PROGRAM_README.md",
    cluster: "mainnet-beta",
  },
  {
    name: "pumpswap",
    address: "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
    source:
      "https://github.com/pump-fun/pump-public-docs/blob/main/docs/PUMP_SWAP_README.md",
    cluster: "mainnet-beta",
  },
  {
    name: "raydium-cpmm",
    address: "CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C",
    source:
      "https://github.com/raydium-io/raydium-docs-v1/blob/main/reference/program-addresses.mdx",
    cluster: "mainnet-beta",
  },
  {
    name: "meteora-dlmm",
    address: "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo",
    source:
      "https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/index.mdx",
    cluster: "mainnet-beta",
  },
];
export function validatePrograms(programs: readonly ProgramDefinition[]): void {
  const addresses = new Set<string>();
  for (const program of programs) {
    new PublicKey(program.address);
    if (
      !program.name ||
      !program.source.startsWith("https://") ||
      addresses.has(program.address)
    )
      throw new Error("Invalid or duplicate program registry entry");
    addresses.add(program.address);
  }
}
export interface ProgramObservation {
  program: string;
  signature: string;
  slot: number;
  logs: string[];
  failed: boolean;
  observedAt: number;
  /** Process-local, non-enumerable receipt clock; never compare across restarts. */
  receivedAtMonoMs?: number;
}
export interface MonitorScheduler {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}
export interface MonitorOptions {
  deduplicate?: boolean;
  maxMessageBytes?: number;
  heartbeatMs?: number;
  onDisconnect?: (context: { latestSlot: number }) => void;
  onReady?: (context: { latestSlot: number; reconnected: boolean }) => void;
  telemetry?: Telemetry;
  scheduler?: MonitorScheduler;
  maxReconnects?: number;
  reconnectBaseMs?: number;
  dedupeLimit?: number;
  onError?: (error: Error) => void;
}
export interface SocketLike {
  on(event: string, listener: (...args: any[]) => void): unknown;
  send(data: string): unknown;
  close(): unknown;
  ping?(): unknown;
}
/** Public logs are observations, never proof that a token launch occurred. SDK-independent reconnect budget. */
export class SolanaMonitor {
  private socket: SocketLike | undefined;
  private timer: unknown;
  private heartbeatTimer: unknown;
  private recoveryStarted: number | undefined;
  private get metrics() {
    return this.options.telemetry ?? telemetry;
  }
  private get scheduler(): MonitorScheduler {
    return (
      this.options.scheduler ?? {
        schedule: (fn, ms) => setTimeout(fn, ms),
        cancel: (handle) =>
          clearTimeout(handle as ReturnType<typeof setTimeout>),
      }
    );
  }
  private stopped = true;
  private reconnects = 0;
  private generation = 0;
  private readonly seen = new Set<string>();
  private readonly subscriptions = new Map<number, ProgramDefinition>();
  public latestSlot = 0;
  constructor(
    private readonly endpoint: string,
    private readonly programs: readonly ProgramDefinition[],
    private readonly onObservation: (event: ProgramObservation) => void,
    private readonly options: MonitorOptions = {},
    private readonly createSocket: (url: string) => SocketLike = (url) =>
      new WebSocket(url, {
        maxPayload: this.options.maxMessageBytes ?? 262144,
        handshakeTimeout: 10000,
      }),
  ) {
    validatePrograms(programs);
    if (!/^wss?:\/\//.test(endpoint))
      throw new Error("Expected WebSocket RPC endpoint");
    for (const value of [
      options.maxReconnects ?? 5,
      options.reconnectBaseMs ?? 250,
      options.dedupeLimit ?? 10000,
      options.maxMessageBytes ?? 262144,
      options.heartbeatMs ?? 15000,
    ])
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("Invalid monitor bounds");
    if ((options.dedupeLimit ?? 10000) < 1)
      throw new Error("Dedupe limit must be positive");
  }
  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.reconnects = 0;
    this.recoveryStarted = undefined;
    this.connect();
  }
  stop(): void {
    this.stopped = true;
    this.generation++;
    this.recoveryStarted = undefined;
    if (this.timer !== undefined) this.scheduler.cancel(this.timer);
    if (this.heartbeatTimer !== undefined)
      this.scheduler.cancel(this.heartbeatTimer);
    this.socket?.close();
    this.socket = undefined;
  }
  private report(error: unknown): void {
    this.options.onError?.(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  private connect(): void {
    if (this.stopped) return;
    const generation = ++this.generation;
    this.subscriptions.clear();
    let closed = false;
    let readyNotified = false;
    let awaitingPong = false;
    const reconnect = (): void => {
      if (closed || this.stopped || generation !== this.generation) return;
      closed = true;
      if (this.heartbeatTimer !== undefined)
        this.scheduler.cancel(this.heartbeatTimer);
      this.metrics.increment("rpc.disconnects");
      try {
        this.options.onDisconnect?.({ latestSlot: this.latestSlot });
      } catch {
        this.metrics.increment("rpc.lifecycle_errors");
      }
      this.recoveryStarted ??= this.metrics.now();
      if (this.reconnects >= (this.options.maxReconnects ?? 5)) {
        this.stopped = true;
        this.metrics.increment("rpc.reconnect_exhausted");
        this.report(
          new Error("WebSocket reconnect budget exhausted; backfill required"),
        );
        return;
      }
      const delay = Math.min(
        30000,
        (this.options.reconnectBaseMs ?? 250) * 2 ** this.reconnects++,
      );
      this.metrics.increment("rpc.reconnects");
      const reconnectBegin = this.metrics.now();
      this.timer = this.scheduler.schedule(() => {
        this.metrics.observe(
          "rpc.reconnect_wait_ms",
          this.metrics.now() - reconnectBegin,
        );
        this.connect();
      }, delay);
    };
    try {
      this.socket = this.createSocket(this.endpoint);
    } catch (error) {
      this.metrics.increment("rpc.errors");
      this.report(error);
      reconnect();
      return;
    }
    const socket = this.socket;
    const heartbeat = () => {
      if (closed || this.stopped || generation !== this.generation) return;
      try {
        if (awaitingPong) throw Error("RPC heartbeat timeout");
        awaitingPong = true;
        socket.ping?.();
        this.heartbeatTimer = this.scheduler.schedule(
          heartbeat,
          this.options.heartbeatMs ?? 15000,
        );
      } catch (error) {
        this.metrics.increment("rpc.errors");
        this.report(error);
        socket.close();
        reconnect();
      }
    };
    socket.on("pong", () => {
      if (!closed && generation === this.generation) awaitingPong = false;
    });
    socket.on("open", () => {
      if (closed || this.stopped || generation !== this.generation) return;
      try {
        if (socket.ping)
          this.heartbeatTimer = this.scheduler.schedule(
            heartbeat,
            this.options.heartbeatMs ?? 15000,
          );
        this.programs.forEach((program, i) => {
          this.metrics.increment("rpc.subscription_requests");
          socket.send(
            JSON.stringify({
              jsonrpc: "2.0",
              id: i + 1,
              method: "logsSubscribe",
              params: [
                { mentions: [program.address] },
                { commitment: "confirmed" },
              ],
            }),
          );
        });
      } catch (error) {
        this.metrics.increment("rpc.errors");
        this.report(error);
        socket.close();
        reconnect();
      }
    });
    socket.on("message", (raw: unknown) => {
      if (closed || this.stopped || generation !== this.generation) return;
      const receivedAtMonoMs = this.metrics.now();
      this.metrics.increment("rpc.messages");
      const endIngestion = this.metrics.start("monitor.ingestion_ms");
      try {
        if (
          Buffer.byteLength(String(raw)) >
          (this.options.maxMessageBytes ?? 262144)
        )
          throw Error("RPC message bound exceeded");
        const message = this.metrics.measure("monitor.json_decoding_ms", () =>
          JSON.parse(String(raw)),
        ) as {
          id?: number;
          result?: number;
          error?: unknown;
          method?: string;
          params?: {
            subscription: number;
            result: {
              context: {
                slot: number;
              };
              value: {
                signature: string;
                logs: string[];
                err: unknown;
              };
            };
          };
        };
        if (message.error) {
          this.metrics.increment("rpc.errors");
          this.report(new Error("RPC subscription rejected"));
          socket.close();
          reconnect();
          return;
        }
        if (message.id !== undefined && typeof message.result === "number") {
          const program = this.programs[message.id - 1];
          if (program) this.subscriptions.set(message.result, program);
          if (
            !readyNotified &&
            this.subscriptions.size === this.programs.length
          ) {
            readyNotified = true;
            try {
              this.options.onReady?.({
                latestSlot: this.latestSlot,
                reconnected: this.reconnects > 0,
              });
            } catch {
              this.metrics.increment("rpc.lifecycle_errors");
            }
          }
          if (
            this.recoveryStarted !== undefined &&
            this.subscriptions.size === this.programs.length
          ) {
            this.metrics.observe(
              "rpc.recovery_ms",
              this.metrics.now() - this.recoveryStarted,
            );
            this.metrics.increment("rpc.reconnect_succeeded");
            this.recoveryStarted = undefined;
          }
          return;
        }
        if (message.method !== "logsNotification" || !message.params) return;
        const program = this.subscriptions.get(message.params.subscription);
        if (!program) return;
        const { context, value } = message.params.result;
        if (
          !Number.isSafeInteger(context.slot) ||
          context.slot < 0 ||
          typeof value.signature !== "string" ||
          !Array.isArray(value.logs) ||
          !value.logs.every((log) => typeof log === "string")
        )
          throw new Error("Malformed logs notification");
        this.metrics.increment("observations.received");
        const duplicate = this.metrics.measure(
          "monitor.deduplication_ms",
          () => {
            if (this.options.deduplicate === false) return false;
            const key = `${program.address}:${value.signature}`;
            if (this.seen.has(key)) return true;
            this.seen.add(key);
            if (this.seen.size > (this.options.dedupeLimit ?? 10000)) {
              this.seen.delete(this.seen.values().next().value!);
              this.metrics.increment("monitor.dedupe_evictions");
            }
            return false;
          },
        );
        if (duplicate) {
          this.metrics.increment("observations.duplicates");
          return;
        }
        this.latestSlot = Math.max(this.latestSlot, context.slot);
        const event: ProgramObservation = {
          program: program.name,
          signature: value.signature,
          slot: context.slot,
          logs: value.logs,
          failed: value.err !== null,
          observedAt: Date.now(),
        };
        Object.defineProperty(event, "receivedAtMonoMs", {
          value: receivedAtMonoMs,
          enumerable: false,
        });
        try {
          this.onObservation(event);
          this.metrics.increment("observations.delivered");
        } catch (error) {
          this.metrics.increment("observations.handler_errors");
          throw error;
        }
      } catch (error) {
        this.metrics.increment("monitor.message_errors");
        this.report(error);
      } finally {
        endIngestion();
      }
    });
    socket.on("error", (error: unknown) => {
      if (closed || this.stopped || generation !== this.generation) return;
      this.metrics.increment("rpc.errors");
      this.report(error);
      socket.close();
      reconnect();
    });
    socket.on("close", reconnect);
  }
}
export class UnsupportedProtocolError extends Error {
  constructor(protocol: string) {
    super(
      `Verified launch decoder is not installed for ${protocol}; observation cannot authorize trading`,
    );
    this.name = "UnsupportedProtocolError";
  }
}
export const PUMP_CREATE_IDL_SOURCE =
  "https://github.com/pump-fun/pump-public-docs/blob/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22/idl/pump.json";
export interface PumpLaunch {
  protocol: "pump";
  signature: string;
  slot: number;
  mint: string;
  bondingCurve: string;
  creator: string;
  user: string;
  name: string;
  symbol: string;
  uri: string;
  timestamp: string;
  tokenProgram: string;
  quoteMint: string;
  virtualTokenReserves: string;
  virtualSolReserves: string;
  realTokenReserves: string;
  tokenTotalSupply: string;
  virtualQuoteReserves: string;
  creatorFeeBps: string;
  isMayhemMode: boolean;
  isCashbackEnabled: boolean;
  isHolderReward: boolean;
  depth: number;
}
const PUMP_CREATE_DISCRIMINATOR = Buffer.from([
  27, 114, 169, 77, 222, 235, 99, 118,
]);
const PUMP_PROGRAM = new PublicKey(VERIFIED_PROGRAMS[0]!.address);
const PUMP_ADDRESS = PUMP_PROGRAM.toBase58();
const LEGACY_TOKEN_ADDRESS = TOKEN_PROGRAM_ID.toBase58();
const TOKEN_2022_ADDRESS = TOKEN_2022_PROGRAM_ID.toBase58();
const curveCache = new Map<string, PublicKey>();
export interface DecodeOptions {
  pdaCache?: boolean;
}
function expectedPumpCurve(
  mint: string,
  metrics: Telemetry,
  options: DecodeOptions,
): PublicKey {
  if (options.pdaCache !== false) {
    const cached = curveCache.get(mint);
    if (cached) {
      curveCache.delete(mint);
      curveCache.set(mint, cached);
      metrics.increment("decoding.pda_cache_hits");
      return cached;
    }
  }
  metrics.increment("decoding.pda_cache_misses");
  const result = PublicKey.findProgramAddressSync(
    [Buffer.from("bonding-curve"), new PublicKey(mint).toBuffer()],
    PUMP_PROGRAM,
  )[0];
  if (options.pdaCache !== false) {
    curveCache.set(mint, result);
    if (curveCache.size > 512) {
      curveCache.delete(curveCache.keys().next().value!);
      metrics.increment("decoding.pda_cache_evictions");
    }
  }
  return result;
}
/** Exact pinned CreateEvent schema only; unknown older/newer layouts fail instead of guessing field offsets. */
export function decodeLaunch(
  observation: ProgramObservation,
  metrics: Telemetry = telemetry,
  options: DecodeOptions = {},
): PumpLaunch[] {
  return metrics.measure("decoding_ms", () => {
    try {
      const launches = decodeLaunchImpl(observation, metrics, options);
      metrics.increment("decoding.completed");
      metrics.increment("decoding.launches", launches.length);
      return launches;
    } catch (error) {
      metrics.increment("decoding.errors");
      throw error;
    }
  });
}
function decodeLaunchImpl(
  observation: ProgramObservation,
  metrics: Telemetry,
  options: DecodeOptions,
): PumpLaunch[] {
  if (observation.program !== "pump")
    throw new UnsupportedProtocolError(observation.program);
  if (observation.failed)
    throw new Error("Failed transaction cannot create a launch");
  const stack: {
    program: string;
    launchStart: number;
  }[] = [];
  const launches: PumpLaunch[] = [];
  for (const log of observation.logs) {
    const invoke = /^Program ([1-9A-HJ-NP-Za-km-z]+) invoke \[(\d+)\]$/.exec(
      log,
    );
    if (invoke) {
      if (Number(invoke[2]) !== stack.length + 1)
        throw new Error(
          "Incomplete invocation stack; fetch full transaction logs",
        );
      stack.push({ program: invoke[1]!, launchStart: launches.length });
      continue;
    }
    const end = /^Program ([1-9A-HJ-NP-Za-km-z]+) (?:success|failed:.*)$/.exec(
      log,
    );
    if (end) {
      const frame = stack.pop();
      if (frame?.program !== end[1])
        throw new Error("Mismatched invocation stack");
      if (log !== `Program ${end[1]} success`)
        launches.splice(frame.launchStart);
      continue;
    }
    if (
      !log.startsWith("Program data: ") ||
      stack.at(-1)?.program !== PUMP_ADDRESS
    )
      continue;
    const encoded = log.slice(14);
    if (
      encoded.length > 24000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        encoded,
      )
    )
      throw new Error("Malformed program data");
    const bytes = Buffer.from(encoded, "base64");
    if (!bytes.subarray(0, 8).equals(PUMP_CREATE_DISCRIMINATOR)) continue;
    let offset = 8;
    const take = (size: number): Buffer => {
      if (offset + size > bytes.length)
        throw new Error("Unsupported or truncated Pump CreateEvent layout");
      const result = bytes.subarray(offset, offset + size);
      offset += size;
      return result;
    };
    const string = (): string => {
      const length = take(4).readUInt32LE();
      if (length > 4096) throw new Error("Pump event string exceeds bound");
      return new TextDecoder("utf-8", { fatal: true }).decode(take(length));
    };
    const pubkey = (): string => new PublicKey(take(32)).toBase58();
    const u64 = (): string => take(8).readBigUInt64LE().toString();
    const bool = (): boolean => {
      const value = take(1)[0];
      if (value !== 0 && value !== 1) throw new Error("Invalid Borsh boolean");
      return value === 1;
    };
    const name = string(),
      symbol = string(),
      uri = string();
    const mint = pubkey(),
      bondingCurve = pubkey(),
      user = pubkey(),
      creator = pubkey();
    const timestamp = take(8).readBigInt64LE().toString();
    const virtualTokenReserves = u64(),
      virtualSolReserves = u64(),
      realTokenReserves = u64(),
      tokenTotalSupply = u64();
    const tokenProgram = pubkey(),
      isMayhemMode = bool(),
      isCashbackEnabled = bool(),
      quoteMint = pubkey();
    const virtualQuoteReserves = u64(),
      creatorFeeBps = u64(),
      isHolderReward = bool(),
      depth = take(1)[0]!;
    if (offset !== bytes.length)
      throw new Error("Unsupported Pump CreateEvent trailing fields");
    const expectedCurve = expectedPumpCurve(mint, metrics, options);
    if (!expectedCurve.equals(new PublicKey(bondingCurve)))
      throw new Error("Pump event bonding curve PDA mismatch");
    if (
      tokenProgram !== LEGACY_TOKEN_ADDRESS &&
      tokenProgram !== TOKEN_2022_ADDRESS
    )
      throw new Error("Unsupported Pump token program");
    launches.push({
      protocol: "pump",
      signature: observation.signature,
      slot: observation.slot,
      name,
      symbol,
      uri,
      mint,
      bondingCurve,
      user,
      creator,
      timestamp,
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      tokenTotalSupply,
      tokenProgram,
      isMayhemMode,
      isCashbackEnabled,
      quoteMint,
      virtualQuoteReserves,
      creatorFeeBps,
      isHolderReward,
      depth,
    });
  }
  if (stack.length)
    throw new Error(
      "Truncated invocation logs; cannot validate launch attribution",
    );
  return launches;
}
export function decodeComputeBudget(data: Uint8Array): {
  kind: string;
  value: string;
} {
  const bytes = Buffer.from(data);
  if (bytes[0] === 2 && bytes.length === 5)
    return { kind: "computeUnitLimit", value: String(bytes.readUInt32LE(1)) };
  if (bytes[0] === 3 && bytes.length === 9)
    return {
      kind: "microLamportsPerComputeUnit",
      value: String(bytes.readBigUInt64LE(1)),
    };
  if (bytes[0] === 1 && bytes.length === 5)
    return { kind: "heapFrameBytes", value: String(bytes.readUInt32LE(1)) };
  if (bytes[0] === 4 && bytes.length === 5)
    return {
      kind: "loadedAccountsDataSizeLimit",
      value: String(bytes.readUInt32LE(1)),
    };
  throw new Error("Unsupported or malformed compute-budget instruction");
}
/** Handles legacy/v0 only. Unknown newer formats fail at RPC instead of silently ignoring resource configuration. */
export async function inspectTransaction(
  connection: Pick<Connection, "getParsedTransaction">,
  signature: string,
  metrics: Telemetry = telemetry,
) {
  const tx = await metrics.rpc("getParsedTransaction", () =>
    connection.getParsedTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    }),
  );
  if (!tx) throw new Error("Finalized transaction unavailable");
  const inventory: {
    program: string;
    inner: boolean;
    parsedType?: string;
    compute?: ReturnType<typeof decodeComputeBudget>;
  }[] = [];
  const add = (
    ix: ParsedInstruction | PartiallyDecodedInstruction,
    inner: boolean,
  ): void => {
    const entry: (typeof inventory)[number] = {
      program: ix.programId.toBase58(),
      inner,
    };
    if ("parsed" in ix && typeof ix.parsed === "object" && ix.parsed !== null)
      entry.parsedType = String(
        (
          ix.parsed as {
            type?: unknown;
          }
        ).type ?? "unknown",
      );
    if (ix.programId.equals(ComputeBudgetProgram.programId) && "data" in ix)
      entry.compute = decodeComputeBudget(bs58.decode(ix.data));
    inventory.push(entry);
  };
  tx.transaction.message.instructions.forEach((ix) => add(ix, false));
  tx.meta?.innerInstructions?.forEach((group) =>
    group.instructions.forEach((ix) => add(ix, true)),
  );
  return {
    signature,
    slot: tx.slot,
    version: tx.version,
    blockTime: tx.blockTime,
    outcome: tx.meta
      ? tx.meta.err === null
        ? "succeeded"
        : "failed"
      : "unknown",
    feeLamports: tx.meta?.fee,
    computeUnitsConsumed: tx.meta?.computeUnitsConsumed,
    inventory,
    programs: [...new Set(inventory.map((ix) => ix.program))],
    tokenBalancesBefore: tx.meta?.preTokenBalances ?? [],
    tokenBalancesAfter: tx.meta?.postTokenBalances ?? [],
  };
}
export interface MintScan {
  mint: string;
  slot: number;
  tokenProgram: string;
  supply: string;
  decimals: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: string[];
  largestTokenAccountBps: number | null;
  signals: string[];
  unknown: string[];
}
export async function scanMint(
  connection: Pick<
    Connection,
    "getAccountInfoAndContext" | "getTokenLargestAccounts"
  >,
  mintAddress: string,
  metrics: Telemetry = telemetry,
): Promise<MintScan> {
  const address = new PublicKey(mintAddress);
  const account = await metrics.rpc("getAccountInfoAndContext", () =>
    connection.getAccountInfoAndContext(address, "confirmed"),
  );
  if (!account.value) throw new Error("Mint not found");
  const owner = account.value.owner;
  if (!owner.equals(TOKEN_PROGRAM_ID) && !owner.equals(TOKEN_2022_PROGRAM_ID))
    throw new Error("Unsupported mint account owner");
  const mint = unpackMint(address, account.value, owner);
  if (!mint.isInitialized) throw new Error("Mint is not initialized");
  const extensions = getExtensionTypes(mint.tlvData).map(
    (type) => ExtensionType[type] ?? `Unknown(${type})`,
  );
  const unknown = [
    "liquidity availability and concentration",
    "creator history and suspicious wallet activity",
    "sell simulation and current route restrictions",
    "beneficial holder concentration (token accounts are not wallet owners)",
    "extension configuration values require protocol-specific evaluation",
  ];
  let largestTokenAccountBps: number | null = null;
  try {
    const largest = await metrics.rpc("getTokenLargestAccounts", () =>
      connection.getTokenLargestAccounts(address, "confirmed"),
    );
    if (mint.supply > 0n && largest.value.length)
      largestTokenAccountBps = Number(
        (BigInt(largest.value[0]!.amount) * 10000n) / mint.supply,
      );
    unknown.push(
      "mint and largest-account snapshots may differ in slot; pool vaults can dominate concentration",
    );
  } catch {
    unknown.push("largest token accounts RPC unavailable");
  }
  const signals = [
    ...(mint.mintAuthority ? ["mint-authority-active"] : []),
    ...(mint.freezeAuthority ? ["freeze-authority-active"] : []),
    ...extensions.map((extension) => `extension:${extension}`),
  ];
  return {
    mint: mintAddress,
    slot: account.context.slot,
    tokenProgram: owner.toBase58(),
    supply: mint.supply.toString(),
    decimals: mint.decimals,
    mintAuthority: mint.mintAuthority?.toBase58() ?? null,
    freezeAuthority: mint.freezeAuthority?.toBase58() ?? null,
    extensions,
    largestTokenAccountBps,
    signals,
    unknown,
  };
}
