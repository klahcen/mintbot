# Phase 6 engineering report

Delivered 2026-11-10: an opt-in **unsigned simulation research layer** within the existing Mintbot repository. Live mode remains disabled. No wallet was signed, funded or submitted, and no application/container rebuild was performed. Existing dashboard, telemetry, paper engines, WAL and safety controls remain in place.

## Audit and implementation

The audited Phase 5 baseline had 168 passing tests, four pinned decoders/market adapters, paper risk gates and disconnected legacy signing/execution utilities. It lacked protocol swap construction, authoritative simulation effects and transactional financial intent ownership. The new `src/simulation` layer reuses existing adapters and paper contracts rather than rebuilding them.

Four pinned builders cover narrow native-SOL Pump, PumpSwap, Raydium CPMM and Meteora DLMM buy/sell variants. They validate actual account owners/PDAs, same-bank digests and integer requotes, token restrictions, fees, rent and account lifecycle. Final account-state retrieval follows block/rent/deployment preparation so evidence is not aged by redundant holder enumeration. Unsupported program/account/route variants fail closed.

The independent wire validator inspects serialized unsigned v0 bytes, exact account privileges/instructions, payer/destination, authorization limits, minimum output, compute/priority fees and freshness. Read-only RPC transport calls actual `simulateTransaction`, preserves failures/logs/CU/balances/fees and rejects stale context/expired blockhash. Accounting reconciles authoritative token/native/WSOL effects, network fee and persistent versus temporary rent.

A separate PostgreSQL intent ledger implements idempotent opportunity/strategy/side/generation/wallet identity, atomic wallet-wide and strategy reservations, leases/fencing, legal state transitions, append audit and explicit uncertainty/manual resolution. It is not the ingestion WAL or paper JSON state. Crash and immediate-restart behavior were tested against PostgreSQL 16. No signed/submitted states exist.

`SimulationService` bounds admission to 16 with two workers, checks stop state, records durable ownership and can pass successful consistent results through existing mandatory risk/strategy/paper review. That bridge is opt-in and tested with UNIT evidence; it is not wired into automatic production launch processing. Successful diagnostics release research reservations with explicit cancellation, retaining simulation/audit evidence.

## Verification and real-chain evidence

| Check | Observed result |
|---|---|
| Original baseline | 168 tests pass |
| Expanded suite | **209 pass, zero failures/skips**, 17.248 seconds |
| Backend/frontend typecheck | Pass |
| Independent pinned SDK buy/sell serialization | **8/8 exact instruction-data and ordered-meta matches** |
| Actual unsigned Pump buy | Success, 97,199 CU, 6,000-lamport fee |
| Actual unsigned PumpSwap buy | Success, latest 132,294 CU, 6,000-lamport fee |
| Actual unsigned Raydium CPMM buy | Success, 46,149 CU, 6,000-lamport fee |
| Actual unsigned DLMM buy | Success in retained earlier run, 81,419 CU, 6,000-lamport fee; latest run HTTP 429 |
| Actual funded or qualifying mainnet paper entries | **None** |

Real captures preserve raw account bytes, provider/context, unsigned packet/message identity, response effects, SQL audit and restart results. Successful simulations matched quote output and reconciled native effects. Public payer addresses were read, never authorized or signed. Different PumpSwap payer/context samples explain differing CU observations; they are not speedup measurements. Earlier failures remain intact. Actual sell-side simulation and independent mainnet provider agreement remain incomplete.

All original test files remain unchanged. Added coverage includes wire tampering, changed reserves/decimals/ownership, missing accounts, stale quotes/blockhash, provider conflict, timeout, fee/rent limits, insufficient funds, ledger duplicate/capacity races, stale fencing, worker SIGKILL, database immediate restart and paper bridge stop/idempotency. Full details and raw logs are linked from the [Phase 6 index](phase6/README.md).

## Measured performance and limits

Three randomized interleaved before/after repetitions of six existing scenarios completed all offered work with zero duplicate logical processing or refusals. The mixed history/live workload is **3,883.1 → 3,611.3 events/s (−7.0%)**, unresolved. Slow/unavailable RPC is **1,467.0 → 1,484.0 events/s (+1.2%)** in this sample. Durable burst is **830.8 → 531.5 events/s (−36.0%)** and sustained stream **2,896.6 → 2,812.0 events/s (−2.9%)**; these measured regressions also remain unresolved. Repeated-mint and unique-mint samples improve 34.5% and 35.6%, respectively. These local samples do not establish causality or production performance. The performance portion of Phase 6 is incomplete. No unmeasured improvement is claimed.

After-only median offline build throughput is Pump 206.5/s, PumpSwap 149.5/s, Raydium 207.1/s and DLMM 94.8/s. Real local SQL reserve/claim/cancel throughput is 133.2 intents/s. Injected burst tests explicitly refuse 48 of 64 offers at the configured 16-pending bound; two provider failures remain counted. See [performance comparison](phase6/performance-comparison.md) for p50/p95/p99, raw evidence, scope and reproducibility.

Actual fresh on-chain receipt → eligible simulated paper entry, sustained public-feed tails, signing/submission/landing and production SLOs are unmeasured. Earlier diagnostic event-named timing measured service start, not chain receipt; this is explicitly corrected in current telemetry/documentation. A successful diagnostic is not a trading signal or guaranteed executable future state.

## Delivery boundary

The source implementation, four builders, SQL migration, tests, raw simulation/reference/benchmark artifacts, [architecture](architecture.md), [builder contract](phase6/swap-builders.md), [simulation validation](phase6/simulation-validation.md), [ledger contract](phase6/execution-intent-ledger.md), [security review](phase6/execution-security-review.md) and [funded blockers](phase6/funded-trading-blockers.md) are delivered. The baseline snapshot and hash manifests support review of preservation and measured-source identity.

Production persistent database deployment, least-privileged roles/backups/HA, global distributed stop, isolated signer policy, actual wallet settlement, original-signature reconciliation, actual sell simulations, independent provider validation, qualifying fresh paper entries and resolution of the mixed regression remain open. Unsupported variants and mandatory unknown evidence remain rejected. Phase 6 is not a funded-release approval.
