# Simulation validation

The transport uses the documented [Solana `simulateTransaction` interface](https://solana.com/docs/rpc/http/simulatetransaction): base64 unsigned v0, `sigVerify:false`, `replaceRecentBlockhash:false`, finalized commitment and an explicit minimum context slot. It checks current finalized block height against `lastValidBlockHeight`. A quote bank still expires after 1,500 ms; preparation/blockhash observations have separate five-second bounds. Neither a recent blockhash nor a successful simulation renews quote freshness.

Blockhash/rent/deployment preparation occurs before the final quote bank where possible. Preparation is a provider-bound process-local capability, not arbitrary caller JSON. RPC methods are allowlisted to simulation, blockhash, block height and rent reads. Responses have timeout, 4-MiB and shape bounds. HTTP status / numeric JSON-RPC codes are retained without endpoint credentials. There is no signing, send, airdrop or arbitrary-method entry point.

## Actual captured outcomes

All records below are actual RPC simulations against current mainnet state, with public payer addresses and zero signatures. They are not signer authorization, landed transactions, paper fills or real trades.

| Venue | Captured successful buy | Measured CU | Simulated fee (lamports) | Output/effect comparison |
|---|---|---:|---:|---|
| Pump | `mainnet-pump-public-payer.json`, also final-source `mainnet-verified.json` | 97,199 | 6,000 | Exact quote token output; native input, fee and persistent rent reconcile |
| PumpSwap | `mainnet-simulation-final-bank.json`; final-source `mainnet-verified.json` | 123,294 / 132,294 respectively | 6,000 | Exact output; samples use different public payers/contexts, so CU differences are not code-speed evidence |
| Raydium CPMM | `mainnet-simulation-final-bank.json`, also final-source `mainnet-verified.json` | 46,149 | 6,000 | Exact output; temporary wrapped-SOL rent refunded |
| Meteora DLMM | `mainnet-dlmm-current-pool.json` | 81,419 | 6,000 | Exact output and native effects for the newly inspected supported pool |

The same final-source four-venue run received HTTP **429** for DLMM. Its earlier successful response remains preserved separately. Initial attempts also retained missing accounts, an off-curve historical pool creator, an execution-account discovery ordering bug that was corrected, expired quote evidence, and an old DLMM pool whose route exceeded the verified three-array window. No failure was rewritten into success. Pool `CPWA5ufjXEyC7DTd7g5fVUxJYZ81kxvbC8f9R9XFx1Y8` was selected through a bounded current-state scan after the older DLMM example became unsuitable; it has no invented creation proof.

No accounts were funded. Public native balances, existing token accounts and required ownership were read before construction. The RPC skipped signature verification only for simulation. A public address's signature was never supplied or claimed authorized. The configured CU limit in these diagnostic runs was 1,000,000 and CU price 1,000 micro-lamports, so the 6,000-lamport fee includes the configured priority fee. Measured usage is lower; lowering the budget would require another simulation and policy validation, not an unmeasured fee claim.

## Accounting and paper boundary

The response preserves errors, logs, consumed CU, requested account states, optional authoritative pre/post native and token balances, fee, version/message/blockhash context and provider. Absent balance/fee fields remain unknown. Post-account state alone is not substituted for same-bank pre/post effects. Failed simulation, unavailable effects, excessive spend/fees/CU, minOut violation or inconsistent identity/bank prevents accounting approval.

Buy token output is compared with quote output/minOut; existing wrapped-SOL input/output effects and native sell proceeds are checked. Native input, returned fee and persistent ATA rent reconcile with returned native deltas, allowing only explicitly reported one-lamport unused-input rounding. Temporary wrapped-SOL rent is distinguished from persistent rent. Missing data cannot silently produce zero fees or a fill.

`SimulationService` can call the existing `RealMarketPaper.review` only after successful, consistent simulation plus all existing mandatory risk/strategy checks. It supplies the returned simulation fee and validated persistent rent, retains conservative quote minimum output and keeps simulated output separately in the intent audit. The existing paper engine rechecks safety/freshness and exact balances. The bridge has a UNIT integration test; **no current mainnet paper entry was created**. Real captures are diagnostic, historical/inspection identities and cannot establish fresh launch eligibility.

## Reproduction and limits

Run source tools after installing existing dependencies and PostgreSQL 16 binaries:

```sh
npm run validate:phase6-builders
npm run validate:swap-simulation -- --run --venues raydium-cpmm --output docs/phase6/new-run.json
npm run discover:dlmm-phase6
```

`SIMULATION_PUBLIC_PAYER` accepts a public address only; no secret or funded signing authorization is consumed. `SIMULATION_DLMM_POOL` chooses a currently inspected address. Without overrides the tool uses recorded public identities/pools and may fail if they are no longer usable. Existing capture paths are refused. Discovery/benchmark outputs should be copied before explicit recapture. Reference SDKs install outside the workspace as described in the Phase 6 README.

The bounded CLI uses an isolated PostgreSQL test cluster, exports intents/audit/budgets, tests immediate restart and then removes that disposable database. It is not the long-running financial ledger deployment. Successful diagnostics cancel their research reservations explicitly; RPC uncertainty retains reservations. A real runtime supplies a dedicated persistent PostgreSQL Pool to `IntentLedger` and must operate reconciliation/backup/privilege controls.

There is no actual sell-side simulation corpus, independent mainnet provider agreement, cryptographic account-state proof, funded signer authorization or competitive event-to-simulation latency proof. Earlier artifacts named `event_to_result_ms` measured service-start latency; current code separates prepared-evidence latency from actual receipt latency. No current on-chain receipt-to-simulation sample exists in these historical/inspection experiments.
