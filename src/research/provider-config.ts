import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import type { ResearchProviderConfig } from './providers.js';

// Never include Zod issues, URL parser input, file contents or OS errors in failures.
const endpoint = z.string().max(8192).refine(value => {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
});
const schema = z.array(z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/), endpoint,
  operator: z.object({name:z.string().trim().min(1).max(128), attribution:z.string().max(2048).refine(value => {
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
  })}).strict().optional(),
}).strict()).min(2).max(3);
export function validateResearchProviders(value: unknown, primary?: string, secondary?: string): ResearchProviderConfig[] {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Error('Invalid research provider configuration');
  const rows = parsed.data;
  if (new Set(rows.map(p=>p.id)).size !== rows.length || new Set(rows.map(p=>p.endpoint)).size !== rows.length)
    throw Error('Research providers require unique identities and endpoints');
  if ((primary !== undefined && rows[0].endpoint !== primary) || (secondary !== undefined && rows[1].endpoint !== secondary))
    throw Error('Research provider endpoint mapping mismatch');
  return rows;
}
export async function loadResearchProviders(env: NodeJS.ProcessEnv = process.env): Promise<ResearchProviderConfig[]> {
  const primary = env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';
  const secondary = env.SOLANA_SECONDARY_RPC_URL ?? 'https://solana-rpc.publicnode.com';
  if (!env.RESEARCH_PROVIDERS_PATH) return validateResearchProviders([{id:'primary',endpoint:primary},{id:'secondary',endpoint:secondary}],primary,secondary);
  let value: unknown;
  try {
    const bytes = await readFile(env.RESEARCH_PROVIDERS_PATH);
    if (bytes.length > 65536) throw Error();
    value = JSON.parse(bytes.toString('utf8'));
  } catch { throw Error('Research provider file unavailable or invalid JSON'); }
  return validateResearchProviders(value,primary,secondary);
}
/** Transport failures are untrusted: retain only numeric protocol status, never remote text. */
export function safeResearchIssue(error: unknown): string {
  const e = error as { httpStatus?:unknown; rpcCode?:unknown; code?:unknown } | null;
  if (Number.isInteger(e?.httpStatus) && Number(e?.httpStatus)>=100 && Number(e?.httpStatus)<=599) return `Provider HTTP ${e!.httpStatus}`;
  const code=e?.rpcCode ?? e?.code;
  return Number.isSafeInteger(code) ? `Provider RPC ${code}` : 'Research provider unavailable or inconsistent evidence';
}
