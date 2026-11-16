import { createHash } from 'node:crypto';
import bs58 from 'bs58';

/** A transaction signature is canonical base58 encoding of exactly 64 nonzero bytes. */
export function transactionIdentityIssue(signature: unknown): string | undefined {
  if (typeof signature !== 'string' || signature.length < 64 || signature.length > 88)
    return 'invalid-transaction-signature';
  try {
    const bytes = bs58.decode(signature);
    if (bytes.length !== 64 || bs58.encode(bytes) !== signature) return 'invalid-transaction-signature';
    if (bytes.every(byte => byte === 0)) return 'unverifiable-zero-signature';
  } catch { return 'invalid-transaction-signature'; }
  return undefined;
}

/** Run only after JSON.parse succeeds. Detect ambiguous keys, including escaped spellings. */
export function hasDuplicateJsonKeys(text: string): boolean {
  const stack: { object: boolean; key: boolean; keys: Set<string> }[] = [];
  const tokens = /"(?:\\.|[^"\\])*"|[{}\[\],:]|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  for (const token of text.matchAll(tokens)) {
    const value = token[0];
    if (value === '{' || value === '[') {
      stack.push({ object: value === '{', key: value === '{', keys: new Set() });
    } else if (value === '}' || value === ']') stack.pop();
    else {
      const frame = stack.at(-1);
      if (value === ',') { if (frame?.object) frame.key = true; }
      else if (value.startsWith('"') && frame?.object && frame.key) {
        const key: string = JSON.parse(value);
        if (frame.keys.has(key)) return true;
        frame.keys.add(key); frame.key = false;
      }
    }
  }
  return false;
}

export interface WireIdentityTrace {
  stage: 'wire-to-observation';
  at: number; receivedMonoMs: number; connection: number; sequence: number;
  providerHost: string; outcome: string; program?: string; subscription?: number;
  slot?: number; extractedSignature?: string; observationSignature?: string;
  originalSha256: string; originalBytes: number; sanitizedBase64: string;
  byteExact: boolean; sanitizedBytes: number;
  captureTruncated: boolean;
}

/** Incoming public envelopes only; never requests, endpoint paths, headers or credentials. */
export function wireIdentityTrace(
  raw: Buffer, fields: Omit<WireIdentityTrace, 'stage' | 'originalSha256' | 'originalBytes' |
    'sanitizedBase64' | 'byteExact' | 'sanitizedBytes' | 'captureTruncated'>,
): WireIdentityTrace {
  const text = raw.toString('utf8');
  let sanitized = text
    .replace(/(?:https?|wss?):\/\/[^\s"\\]+/gi, '[url-redacted]')
    .replace(/("(?:authorization|api[_-]?key|password|access[_-]?token)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"[credential-redacted]"');
  // Decode escaped key names before deciding whether an otherwise exact envelope is safe to retain.
  try {
    let changed = false;
    const parsed: unknown = JSON.parse(text, (key, value: unknown) => {
      if (/^(authorization|api[_-]?key|password|access[_-]?token)$/i.test(key)) {
        changed = true; return '[credential-redacted]';
      }
      if (typeof value === 'string' && /(?:https?|wss?):\/\//i.test(value)) {
        changed = true; return value.replace(/(?:https?|wss?):\/\/\S+/gi, '[url-redacted]');
      }
      return value;
    });
    if (changed) sanitized = JSON.stringify(parsed);
  } catch { /* Malformed JSON retains only the regex-sanitized bounded diagnostic. */ }
  const allBytes = Buffer.from(sanitized), bytes = allBytes.subarray(0, 128 * 1024);
  return { stage: 'wire-to-observation', ...fields,
    originalSha256: createHash('sha256').update(raw).digest('hex'), originalBytes: raw.length,
    sanitizedBase64: bytes.toString('base64'), sanitizedBytes: bytes.length,
    captureTruncated: allBytes.length > bytes.length, byteExact: bytes.equals(raw) };
}
