# Automatic real-market paper trading — Phase 16

Delivery status: implementation and local regression validation; **live-market lifecycle acceptance remains externally blocked**. No current-chain entry, exit or profitable trade is claimed. No network experiment, funded action, signature or transaction submission was performed in this phase.

The existing `MarketService` already connects finalized verified creations to supported account-state adapters, entry decisions and automatic full-position sell polling. `SimulationGatedPaper` adds unsigned buy/sell simulation and independent-provider/coverage checks before entry. Phase 9's shared runner is used by the later research wrappers. Previous reports explicitly recorded zero eligible real-market entries/exits. Historical fixture quotes and unit safety overrides are not live evidence.

Changes:

- Default strategy: 0.10 SOL per entry, +9,000 bps take-profit, −500 bps stop-loss, five positions. Existing liquidity, reserves, daily spending, slippage, trailing-stop, liquidity-drop and holding-time controls remain. An additional hard maximum of five applies to real-market entries even if a mutable strategy raises its limit. Existing ledgers and their saved strategies are not rewritten.
- Automatic exits compare integer net proceeds against fee-inclusive cost for TP/SL. Validated full-position marks record quote/state/provider/slot, estimated exit fees, net proceeds, unrealized P&L and trigger in the durable paper transaction. Existing atomic fills record exact realized P&L. Account-state estimates remain estimates, not guaranteed executions.
- Exit validation requires finalized creation and state, stored pool identity, positive verified liquidity and an eligible quote variant. Expired deployment evidence is rejected. Quote validation also rejects non-finalized state, unsupported quote kinds and inverted quote lifetimes.
- Research exits now require the same configured provider agreement/coverage callback as entries. Quote expiration and the decision fence are rechecked after asynchronous agreement. Unknown coverage retains positions. No epoch or protocol is self-approved.
- The legacy server's market execution route is blocked, including entry and manual sell commits, because it lacks the research coverage, agreement and unsigned-simulation gates. Start/stop controls retain their monitoring contract; API status and control responses explain that execution remains blocked. The research pipeline remains the supported execution integration; the synthetic workspace remains separate.
- Native verification retains numeric JSON-RPC error codes, including −32015, without retry escalation or exposing provider response text. Legacy/v0 creation verification remains supported. Native readers explicitly request up to v1 for inspection; v1 creation execution is refused until signed-wire/config/account equivalence is validated. The SDK inspector intentionally retains its tested max-v0 contract. This is **partial version handling**, not a claim of complete v1 economic compatibility.
- Market and verification RPC readers expose bounded health counters, last success/failure, rate limits and numeric errors. Thirty-second-old success is stale; transport success never establishes provider independence or coverage. The research snapshot combines market/verification errors and displays transport health.
- Research P&L derives from fresh conservative exit marks, with exact signed decimal display. Entry cost is not displayed as a fresh liquidation price. Stale/missing marks suppress aggregate unrealized P&L, including when a newer snapshot wraps an older mark. Dashboard labels distinguish synthetic replay, recorded verified-market paper fills, blocked monitoring and disabled funded execution. The displayed strategy is explicitly the target; persisted strategies are preserved.

The existing store atomically saves positions and deduplication state and reloads with execution stopped. Existing restart/duplicate tests remain unchanged. Existing bounded review/trade windows and WAL retention policies remain in force; this phase does not replace historical audit storage.

## External blockers and next safe steps

The secret-free [configuration check](phase16/configuration-presence.json) finds primary/secondary HTTP URLs and primary WebSocket configuration. Secondary WebSocket and `RESEARCH_PROVIDERS_PATH` are absent. Presence alone proves neither authentication, quotas nor independent operating attribution. No credentials were copied into evidence.

1. Supply the missing provider configuration and independent attribution/capacity review described in `external-prerequisites.md`; validate finalized transaction and common-bank account agreement with those services.
2. Obtain an actual independent coverage-policy/epoch review. Existing epoch creation explicitly returns review `unmet`; creating a new run cannot authorize execution or erase gaps/quarantines.
3. Obtain and validate signed raw v1 fixtures and config/account reconstruction before enabling v1 creation execution. Preserve legacy/v0 regressions.
4. Revalidate current pinned deployments, supported venue variants, token authorities/extensions, holder concentration, real reserves and full-position executable quotes. Previously blocked Pump Global/deployment, PumpSwap orientation, Raydium capacity and Meteora fee/liquidity cases remain blocked unless separately reviewed evidence satisfies existing adapters.
5. Only after those gates pass, run bounded research in a new output directory, retain source/receipt/coverage provenance and demonstrate an actual eligible paper buy followed by fresh quote marks and an automatic exit. Local fixtures cannot satisfy this step.

`MODE=paper` was checked and left unchanged. No signer, broadcaster, funded authorization, protocol pin, whitelist or coverage approval was enabled. Existing positions, transactions, data and previous reports were not intentionally changed. The final [preservation check](phase16/preservation-check.json) confirms all 3,974 protected existing data/documentation files are unchanged.

The RPC request uses the explicit commitment/encoding/version configuration in Solana's [getTransaction contract](https://solana.com/docs/rpc/http/gettransaction). That contract does not establish this application's v1 execution correctness; the local validation blocker above remains decisive.


## Final validation

[Release results](phase16/validation-summary.json): **343/343 TypeScript tests passed**, including all existing tests and 13 new automatic-paper tests; **5/5 Python clock tests**; backend/frontend typecheck and production build passed; **zero dependency-audit advisories**. Tests ran under Node 22 in an isolated clean installation. [Commands and exit codes](phase16/release-validation/clean-validation.json), [test log](phase16/release-validation/clean-tests.log), [source hashes](phase16/tested-source-sha256.json), [original test preservation](phase16/original-test-preservation.json).

The tested source matches the workspace. Existing duplicate-event and restart recovery, live-mode rejection, authentication, kill switches, durable database/fencing and reconciliation tests remain passing. The new tests explicitly cover the requested budget through a supported adapter, exact automatic TP/SL, fresh marking, stale/missing liquidity and disabled variants, provider/epoch-gated exits, RPC failure retention, health/error-code handling, the hard position cap, v1 refusal and stale dashboard P&L. Unit safety overrides and modeled price moves are labeled; they prove control behavior only.

One intermediate full run exposed the monitoring-start API regression. It was corrected without removing the execution fence; all original tests pass in the final release run. Intermediate logs remain retained for review.

**Acceptance limit:** no real-market lifecycle experiment ran; observed genuine entries/exits in this phase are **0/0**. Continuous append-only retention beyond the existing bounded review/trade windows is also not newly implemented; the research WAL and retained run evidence remain separate. Local test success neither approves an epoch/provider/venue nor demonstrates executable current-chain profitability.
