# End-to-end real-chain paper validation

Phase 8 connects the existing opt-in simulation-gated paper wrapper to an explicitly bounded live research monitor. It captures actual Pump notifications, preserves identity/source/receipt clocks, verifies finalized original creation, reads pinned deployments/current accounts, computes integer buy/sell quotes where supported, preserves custody/authority/concentration/liquidity checks, constructs unsigned transactions and requires real successful simulations/exact effects before original strategy/paper review. No wallet, token inventory or safety signal is synthesized.

The long run observed 57,518 notifications, selected 18 candidates, verified 8 creations and recorded 8 paper decision callbacks; 0 paper trades and 0 linked simulation attempts occurred. Verification failures are separate pre-opportunity rejections. See [monitoring report](mainnet-monitoring-report.md) and raw reason counts. **A genuine positive launch→simulations→paper-entry→exit trace was not demonstrated.** Recorded rejected behavior is real; it must not be represented as a successful fill.

Existing four-protocol actual buy/sell captures remain regression inputs with their original clocks and identity. The expanded suite retains checks of zero signatures, message digests, instruction/metas, exact balances/fees, Token2022 restrictions, changed reserves/decimals, stale evidence and unavailable routes. Historical fixtures are never promoted to current quotes.

## Integration corrections and controls

The gate retains mandatory risk before expensive simulation, hashes the full strategy configuration, bounds diagnostics at100, rechecks stop state and delegates final risk/freshness/strategy/accounting to the original paper engine. Phase 8's configured provider guard rejects unknown/conflicting agreement and requires comparison of the exact quote bank. Operator strings/configuration are not cryptographic identity. Default public-provider independence is unknown, so no positive entry can rely on it. Deterministic tests verify no construction RPC or paper trade occurs on unknown/failed agreement.

The market transport keeps its existing sanitized error message and adds numeric HTTP/RPC diagnostics for research collection. The Research producer derives parsed market status from durable state, marks stale market evidence, and does not mislabel confirmed head slots as finalized. Projection metadata is observational, not a source of risk assertions.

Fresh exit pricing is polled every five seconds through existing `MarketService.poll`, retaining its fresh-quote minimum-output/fee/stop/failure protections. There were no positions in this run, so actual current-chain paper exit behavior remains unobserved. Exit prices are account-state paper estimates; Phase 8 does not claim a new simulation-based exit implementation or funded settlement. Existing deterministic exit tests remain intact.

## Durability and scope

Paper review mutations use the existing fsynced Store. Ingestion uses worker-owned WAL acknowledgements; neither authorizes signing. Verification issues before a verified launch are in raw evidence/WAL lifecycle, separate from paper opportunities. Final evidence JSON and sampled status files are diagnostic exports rather than a replacement financial ledger. The live monitor has no execution-intent database pool attached; its research intents shown in the dashboard are explicitly separate restricted-role fault-test records.

The retained long run predates the final metadata/provider-guard refinements; its exact harness is kept. Shorter integration/release checks preserve the final-source context, while tests cover added fail-closed behavior. No eligible mainnet candidate exercised the positive simulation branch. Remaining acceptance gaps include positive fresh entry/exit, multi-hour soak, independent provider validation, broader supported variants and funded operational/security readiness.

## Final short source check

`mainnet-feed-guard-check/evidence.json` records a separate 15-second run with the terminal health guard installed: 2,134 notifications, 1 selected candidate, 1 rejection and zero trades. It does not replace the failed long-duration run or demonstrate terminal failure recovery. Its host-recorded UTC start is 2026-11-11T01:27:11.423000+00:00; raw timestamps are retained without rewriting them to the report calendar.
