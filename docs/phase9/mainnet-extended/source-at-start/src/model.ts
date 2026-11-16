import { z } from "zod";
import { LifecycleSchema, type Lifecycle } from "./market/lifecycle.js";
import type { EventFreshness } from "./freshness.js";
export const FreshnessSchema = z
  .object({
    origin: z.enum(["live", "history", "restart"]),
    receiptAt: z.number().finite().nonnegative(),
    eventSlot: z.number().int().nonnegative().safe(),
    chainHeadSlot: z.number().int().nonnegative().safe().nullable(),
    eventTimeMs: z.number().finite().nonnegative().optional(),
  })
  .strict();
const nonnegative = z.number().finite().nonnegative();
export const StrategySchema = z
  .object({
    name: z.string().min(1).max(80),
    kind: z.enum(["launch", "pool", "momentum", "delayed"]),
    enabled: z.boolean(),
    tradeSol: nonnegative.positive(),
    maxTradeSol: nonnegative.positive(),
    maxDailySpendSol: nonnegative.positive(),
    maxPositions: z.number().int().min(1).max(100),
    maxSlippageBps: z.number().int().min(0).max(2000),
    reserveSol: nonnegative,
    maxRiskScore: nonnegative.max(100),
    maxFailures: z.number().int().positive(),
    minLiquiditySol: nonnegative,
    minMarketCapSol: nonnegative,
    maxMarketCapSol: nonnegative,
    minVolumeSol: nonnegative,
    minMomentumBps: z.number().finite(),
    delayMs: nonnegative,
    maxPriceAgeMs: nonnegative.positive(),
    takeProfitBps: nonnegative.positive(),
    stopLossBps: nonnegative.positive().max(10000),
    trailingStopBps: nonnegative.max(10000),
    maxHoldMs: nonnegative.positive(),
    freshness: z
      .object({
        maxReceiptAgeMs: nonnegative.positive(),
        maxSlotLag: z.number().int().nonnegative(),
        allowHistorical: z.boolean().default(false),
        maxEventAgeMs: nonnegative.positive().optional(),
      })
      .strict()
      .optional(),
    creatorAllowlist: z.array(z.string()),
    creatorBlocklist: z.array(z.string()),
  })
  .strict();
export type Strategy = z.infer<typeof StrategySchema>;
export interface Launch {
  id: string;
  mint: string;
  symbol: string;
  platform: string;
  kind: "launch" | "pool";
  creator: string;
  priceSol: number;
  priceAt: number;
  detectedAt: number;
  freshness?: EventFreshness;
  liquiditySol: number;
  marketCapSol: number;
  volumeSol: number;
  momentumBps: number;
  mintAuthority: boolean | null;
  freezeAuthority: boolean | null;
  restricted: boolean | null;
  topHolderPct: number | null;
  sellSimulation: boolean | null;
  source: "synthetic" | "verified";
  riskScore?: number;
  reasons?: string[];
}
export interface Position {
  market?: MarketPosition;
  id: string;
  mint: string;
  symbol: string;
  quantity: number;
  entryPriceSol: number;
  priceSol: number;
  priceAt: number;
  highPriceSol: number;
  costSol: number;
  openedAt: number;
  liquiditySol: number;
  initialLiquiditySol: number;
  source: string;
}
export interface Trade {
  market?: {
    inputAtoms: string;
    outputAtoms: string;
    networkLamports: string;
    poolFee: string;
    poolFeeAsset: string;
    outputFeeAtoms?: string;
    outputFeeMint?: string;
    stateDigest: string;
    slot: number;
    provider: string;
  };
  id: string;
  positionId: string;
  symbol: string;
  side: "buy" | "sell";
  amountSol: number;
  quantity: number;
  feeSol: number;
  slippageSol: number;
  pnlSol: number;
  status: "paper-filled";
  at: number;
  reason: string;
  source: string;
}
export interface Alert {
  id: string;
  at: number;
  level: "info" | "warning" | "error";
  message: string;
}
export interface State {
  marketLifecycle?: Lifecycle[];
  marketReviews?: {
    id: string;
    at: number;
    reasons: string[];
    evidence: Record<string, unknown>;
  }[];
  marketLedger?: {
    balanceLamports: string;
    dailySpendLamports: string;
    realizedPnlLamports: string;
    day: string;
  };
  version: 1;
  mode: "paper";
  running: boolean;
  killed: boolean;
  balanceSol: number;
  day: string;
  dailySpendSol: number;
  failures: number;
  strategies: Strategy[];
  launches: Launch[];
  positions: Position[];
  trades: Trade[];
  alerts: Alert[];
  seen: string[];
  pendingLaunches: Launch[];
  metrics: Record<string, number>;
  rpc: {
    status: string;
  };
  realizedPnlSol: number;
}
const timestamp = z.number().finite().nonnegative();
const integerString = z.string().regex(/^(0|[1-9]\d{0,77})$/);
export const MarketPositionSchema = z
  .object({
    venue: z.string(),
    launch: z.string().max(8192),
    atoms: integerString,
    decimals: z.number().int().min(0).max(18),
    costLamports: integerString,
    stateDigest: z.string(),
    entryNetworkLamports: integerString,
  })
  .strict();
export type MarketPosition = z.infer<typeof MarketPositionSchema>;
export const LaunchSchema = z
  .object({
    id: z.string().min(1),
    mint: z.string().min(1),
    symbol: z.string().min(1),
    platform: z.string(),
    kind: z.enum(["launch", "pool"]),
    creator: z.string(),
    priceSol: nonnegative.positive(),
    priceAt: timestamp,
    detectedAt: timestamp,
    freshness: FreshnessSchema.optional(),
    liquiditySol: nonnegative,
    marketCapSol: nonnegative,
    volumeSol: nonnegative,
    momentumBps: z.number().finite(),
    mintAuthority: z.boolean().nullable(),
    freezeAuthority: z.boolean().nullable(),
    restricted: z.boolean().nullable(),
    topHolderPct: nonnegative.max(100).nullable(),
    sellSimulation: z.boolean().nullable(),
    source: z.enum(["synthetic", "verified"]),
    riskScore: nonnegative.max(100).optional(),
    reasons: z.array(z.string()).optional(),
  })
  .strict();
export const PositionSchema = z
  .object({
    market: MarketPositionSchema.optional(),
    id: z.string(),
    mint: z.string(),
    symbol: z.string(),
    quantity: nonnegative.positive(),
    entryPriceSol: nonnegative.positive(),
    priceSol: nonnegative.positive(),
    priceAt: timestamp,
    highPriceSol: nonnegative.positive(),
    costSol: nonnegative,
    openedAt: timestamp,
    liquiditySol: nonnegative,
    initialLiquiditySol: nonnegative,
    source: z.string(),
  })
  .strict();
export const TradeSchema = z
  .object({
    market: z
      .object({
        inputAtoms: integerString,
        outputAtoms: integerString,
        networkLamports: integerString,
        poolFee: integerString,
        poolFeeAsset: z.string(),
        outputFeeAtoms: integerString.optional(),
        outputFeeMint: z.string().optional(),
        stateDigest: z.string(),
        slot: z.number().int().nonnegative().safe(),
        provider: z.string(),
      })
      .strict()
      .optional(),
    id: z.string(),
    positionId: z.string(),
    symbol: z.string(),
    side: z.enum(["buy", "sell"]),
    amountSol: nonnegative,
    quantity: nonnegative,
    feeSol: nonnegative,
    slippageSol: nonnegative,
    pnlSol: z.number().finite(),
    status: z.literal("paper-filled"),
    at: timestamp,
    reason: z.string(),
    source: z.string(),
  })
  .strict();
export const AlertSchema = z.object({
  id: z.string(),
  at: timestamp,
  level: z.enum(["info", "warning", "error"]),
  message: z.string(),
});
export const MarketReviewSchema = z.object({
  id: z.string(), at: timestamp, reasons: z.array(z.string()),
  evidence: z.record(z.string(), z.unknown()),
}).strict();
export const SEEN_LIMIT = 10000;
/** Shared constraints for full validation and immutable-row cached validation. */
export function createStateSchema(
  rows: {
    launch?: z.ZodType<Launch>;
    trade?: z.ZodType<Trade>;
    alert?: z.ZodType<Alert>;
    review?: z.ZodType<NonNullable<State["marketReviews"]>[number]>;
    seen?: z.ZodType<string[]>;
  } = {},
) {
  return z
    .object({
      version: z.literal(1),
      marketLedger: z
        .object({
          balanceLamports: integerString,
          dailySpendLamports: integerString,
          realizedPnlLamports: z.string().regex(/^-?(0|[1-9]\d{0,77})$/),
          day: z.string(),
        })
        .strict()
        .optional(),
      marketLifecycle: z.array(LifecycleSchema).max(200).optional(),
      marketReviews: z.array(rows.review ?? MarketReviewSchema).max(200).optional(),
      mode: z.literal("paper"),
      running: z.boolean(),
      killed: z.boolean(),
      balanceSol: nonnegative,
      day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dailySpendSol: nonnegative,
      failures: z.number().int().nonnegative(),
      strategies: z.array(StrategySchema).length(1),
      launches: z.array(rows.launch ?? LaunchSchema).max(200),
      positions: z.array(PositionSchema).max(100),
      trades: z.array(rows.trade ?? TradeSchema).max(1000),
      alerts: z.array(rows.alert ?? AlertSchema).max(200),
      seen: rows.seen ?? z.array(z.string()).max(SEEN_LIMIT),
      pendingLaunches: z
        .array(rows.launch ?? LaunchSchema)
        .max(200)
        .default([]),
      metrics: z.record(z.string(), z.number().finite()),
      rpc: z.object({ status: z.string() }),
      realizedPnlSol: z.number().finite(),
    })
    .strict();
}
export const StateSchema = createStateSchema();
