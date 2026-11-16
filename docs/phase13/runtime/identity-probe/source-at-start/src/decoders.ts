import {
  decodeVerifiedTransaction,
  requiredLaunchAccounts,
  PROTOCOL_REVISIONS,
  VERIFIED_INSTRUCTIONS,
  type ParsedChainTransaction,
  type AccountEvidence,
} from "./verified-decoders.js";
import {
  decodeLaunch,
  PUMP_CREATE_IDL_SOURCE,
  VERIFIED_PROGRAMS,
  type ProgramObservation,
  type PumpLaunch,
} from "./chain.js";
import { telemetry, type Telemetry } from "./telemetry.js";
export interface LaunchDecoder {
  program: string;
  address: string;
  source: string;
  decode(observation: ProgramObservation, metrics: Telemetry): PumpLaunch[];
}
/** A common boundary, not a claim that different protocols share event layouts. */
export class DecoderRegistry {
  private readonly adapters = new Map<string, LaunchDecoder>();
  constructor(
    adapters: LaunchDecoder[] = [
      {
        program: "pump",
        address: VERIFIED_PROGRAMS[0]!.address,
        source: PUMP_CREATE_IDL_SOURCE,
        decode: decodeLaunch,
      },
    ],
  ) {
    for (const adapter of adapters) {
      if (
        this.adapters.has(adapter.program) ||
        !VERIFIED_PROGRAMS.some(
          (p) => p.name === adapter.program && p.address === adapter.address,
        ) ||
        !adapter.source.startsWith("https://")
      )
        throw Error("Invalid or duplicate decoder registration");
      this.adapters.set(adapter.program, adapter);
    }
  }
  decode(observation: ProgramObservation, metrics: Telemetry = telemetry) {
    const adapter = this.adapters.get(observation.program);
    if (!adapter) return { supported: false, launches: [] as PumpLaunch[] };
    if (observation.failed)
      return { supported: true, launches: [] as PumpLaunch[] };
    return { supported: true, launches: adapter.decode(observation, metrics) };
  }
  decodeTransaction(
    program: string,
    tx: ParsedChainTransaction,
    evidence: AccountEvidence,
    metrics: Telemetry = telemetry,
  ) {
    try {
      const result = metrics.measure("protocol.verified_decode_ms", () =>
        decodeVerifiedTransaction(program, tx, evidence),
      );
      metrics.increment("protocol.verified_launches", result.length);
      return result;
    } catch (e) {
      metrics.increment("protocol.unknown_or_invalid_layout");
      throw e;
    }
  }
  requiredAccounts(program: string, tx: ParsedChainTransaction) {
    return requiredLaunchAccounts(program, tx);
  }
  coverage() {
    return VERIFIED_PROGRAMS.map((p) => ({
      program: p.name,
      address: p.address,
      verifiedDecoder: this.adapters.has(p.name),
      verifiedTransactionDecoder: true,
      transactionVersions: ["legacy", 0, 1],
      layoutRevision: PROTOCOL_REVISIONS[p.name],
      verifiedInstructions: VERIFIED_INSTRUCTIONS[p.name],
      verificationRequires:
        "successful finalized transaction, attributed instruction/event and compatible account snapshot",
      source: this.adapters.get(p.name)?.source ?? null,
    }));
  }
}
