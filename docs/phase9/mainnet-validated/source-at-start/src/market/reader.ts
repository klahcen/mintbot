import { performance } from "node:perf_hooks";
import { BoundedStage } from "../stages.js";
import { telemetry, type Telemetry } from "../telemetry.js";
import type { MarketBatch, MarketReader } from "./types.js";
/** Bounded, provider-local exact-key cache. Hits retain ORIGINAL clocks, slot and commitment.
 * No caching of holder membership, fees, failures, deployment claims or quotes. */
export function coalescingReader(source: MarketReader, metrics: Telemetry = telemetry,
  ttlMs = 200): MarketReader {
  if (!Number.isFinite(ttlMs) || ttlMs < 0 || ttlMs > 250) throw Error("Account cache TTL bound");
  const cache = new Map<string, MarketBatch>();
  const pending = new Map<string, Promise<MarketBatch>>();
  const stage = new BoundedStage("market.accounts", 32, 4, metrics);
  return {
    provider: source.provider,
    largest: source.largest.bind(source),
    ...(source.holders ? { holders: source.holders.bind(source) } : {}),
    ...(source.fees ? { fees: source.fees.bind(source) } : {}),
    ...(source.deployment ? { deployment: source.deployment.bind(source) } : {}),
    async accounts(keys, minimumSlot, options) {
      if (!keys.length || keys.length > 32 || new Set(keys).size !== keys.length ||
          !Number.isSafeInteger(minimumSlot) || minimumSlot < 0) throw Error("Account cache request bound");
      const key = [...keys].sort().join(":");
      const hit = cache.get(key);
      const now = performance.now();
      if (!options?.fresh && hit && hit.provider === source.provider && hit.commitment === "finalized" &&
          hit.contextSlot >= minimumSlot && now >= hit.retrievedMono && now - hit.retrievedMono <= ttlMs &&
          Date.now() >= hit.retrievedAt && Date.now() - hit.retrievedAt <= ttlMs) {
        metrics.increment("market.accounts.cache_hit");
        return structuredClone(hit);
      }
      const flightKey = `${key}:${minimumSlot}`;
      let op = pending.get(flightKey);
      if (op) metrics.increment("market.accounts.coalesced");
      else {
        op = stage.trySubmit(async () => {
          const batch = await source.accounts(keys, minimumSlot, options);
          if (batch.provider !== source.provider || batch.commitment !== "finalized" ||
              !Number.isSafeInteger(batch.contextSlot) || batch.contextSlot < minimumSlot)
            throw Error("Inconsistent cached provider evidence");
          const old = cache.get(key);
          if (!old || old.contextSlot <= batch.contextSlot) {
            cache.delete(key);
            cache.set(key, structuredClone(batch));
            if (cache.size > 64) cache.delete(cache.keys().next().value!);
          }
          return batch;
        });
        if (!op) throw Error("Market account backlog capacity");
        pending.set(flightKey, op);
        void op.finally(() => pending.delete(flightKey)).catch(() => undefined);
      }
      return structuredClone(await op);
    },
  };
}
