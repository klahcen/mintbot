import type { Signal, MarketBatch,MarketState,MarketSubject,Quote } from "../market/types.js";
export interface ResearchAuthorization {
  strategyVersion: string; user: string; destinationOwner: string;
  minimumOutput: bigint; maximumInput: bigint; maximumRent: bigint; maximumPriorityFee: bigint;
  maximumNetworkFee: bigint; computeUnits: number; microLamports: bigint;
  expiresAt: number;
}
export interface BlockContext { blockhash: string; slot: number; lastValidBlockHeight: number; observedAt: number; }
export interface SwapPlan {
  venue: string; revision: string; instruction: string; program: string;
  input: bigint; minimumOutput: bigint; quote: Quote; state: MarketState<MarketSubject>;
  user: string; source: string; destination: string; inputMint: string; outputMint: string;
  inputProgram: string; outputProgram: string;
  roles: Record<string,string>; remaining: {address:string;writable:boolean}[];
  accountCreations: {address:string;mint:string;program:string;bytes:number;rent:string}[];
  rentLamports: bigint; block: BlockContext; authorization: ResearchAuthorization;
  instructions: {program:string;data:string;keys:{address:string;signer:boolean;writable:boolean}[]}[];
  unsignedBase64: string; messageDigest: string;
  serializationMs: number;
  evidenceDigest: string;
  deployments: Signal[];
}
export interface SimulationResult {
  kind: "unsigned-protocol-simulation"; provider: string; commitment: "finalized";
  contextSlot: number; observedAt: number; messageDigest: string;
  success: boolean; error: unknown; logs: string[]; unitsConsumed: number | null;
  accounts: unknown[] | null; preTokenBalances: unknown[] | null; postTokenBalances: unknown[] | null;
  preBalances: unknown[] | null; postBalances: unknown[] | null;
  fee: string | null; raw: Record<string,unknown>; signatureVerified: false; submitted: false;
}
export interface ConstructionEvidence { state: MarketState<MarketSubject>; quote: Quote; batch: MarketBatch; deployments: Signal[]; }
