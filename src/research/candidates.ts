import type { ProgramObservation } from '../chain.js';
import { transactionIdentityIssue } from './wire-identity.js';
/** A sampling hint only. Finalized instruction, event attribution and accounts remain mandatory. */
const hints: Readonly<Record<string, readonly string[]>> = {
 pump: ['Create', 'CreateV2'], pumpswap: ['CreatePool'],
 'raydium-cpmm': ['Initialize', 'InitializeWithPermission'],
 'meteora-dlmm': ['InitializeLbPair', 'InitializeLbPair2', 'InitializePermissionLbPair', 'InitializeCustomizablePermissionlessLbPair', 'InitializeCustomizablePermissionlessLbPair2'],
};
export function creationHint(event: Pick<ProgramObservation, 'program' | 'failed' | 'logs'>): boolean {
 return !event.failed && (hints[event.program] ?? []).some(name => event.logs.includes(`Program log: Instruction: ${name}`));
}
export function researchPrograms(value: string, allowed: readonly {name:string}[]): string[] {
 const names=value.split(',');
 if(!names.length||names.length>4||new Set(names).size!==names.length||names.some(n=>!allowed.some(p=>p.name===n)))throw Error('Research venue selection invalid');
 return names;
}

/** Invalid signatures cannot supply finalized identity; never invent or substitute one. */
export function researchIdentityIssue(event:Pick<ProgramObservation,'signature'>):string|undefined {
 return transactionIdentityIssue(event.signature);
}
