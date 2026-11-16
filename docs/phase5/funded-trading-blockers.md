# Remaining funded-trading blockers

Live trading is disabled. A funded implementation is not authorized by Phase 5.

- No qualifying current mainnet entry passed the captured mandatory safety/strategy checks. Observed verified candidates were rejected; no synthetic safety assertions or historical receipts were substituted to obtain a fill.
- Positive liquid CPMM/DLMM quote fixtures now exist, with pinned SDK arithmetic comparisons. Positive DLMM SOL-as-X quotes and additional fee/order-mode fixture coverage remain incomplete. Actual unsigned protocol-transaction simulation, route/account creation, measured compute use and network landing remain unverified. Representative fee messages and modeled rent are insufficient.
- Complete reconciled owner enumeration is bounded to 20 token accounts; larger distributions remain unknown and fail closed. Common beneficial control and exhaustive creator/liquidity history remain unknown.
- Default finalized fast-entry viability is not established. The named 60-second research policy deliberately admits older entries and cannot demonstrate five-second competitive entry. Provider-delayed receipts and block-time age require independent measurement.
- Only reviewed creation/account variants are supported. DLMM order inventory, permissioned/custom activation and unknown programs/layouts fail closed. ELF/semantic deployment validation remains absent beyond loader-header slot pins.
- The mixed live/history throughput regression remains unresolved. Benchmarks and short soaks are local diagnostics, not production SLOs, tail-loss guarantees or provider-resilience certification.
- Implement and independently review the [execution ownership, isolated signer, exact authorization, simulation, signature reconciliation and emergency design](execution-readiness.md). The paper Store and ingestion WAL cannot stand in for a live execution intent ledger.
- Validate actual fees, token deltas, rent refunds, forks, ambiguous submission outcomes, restart ownership, adversarial markets and unavailable exits under a separately authorized funded test plan. Stop-loss and emergency sells are not guaranteed.
