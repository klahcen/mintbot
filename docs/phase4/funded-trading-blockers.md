# Funded trading remains disabled

This phase authorizes and implements read-only research and paper simulation. `MODE=live` remains rejected. No signer or submission path is connected.

Required work before any separately authorized funded implementation:

- Independently review protocol instruction construction, program versions/code provenance, signer ownership, exact spending/minimum-output authorization and security boundaries.
- Simulate the actual unsigned swap route, account creation, Token-2022 behavior and compute consumption; reconcile real fee/rent liabilities and actual token balance deltas. Representative fee-message estimates are insufficient for execution authorization.
- Obtain positive liquid real-chain Raydium CPMM and Meteora DLMM two-sided quote fixtures and validate against actual protocol simulation. Current recorded cases are deliberately rejected. Validate additional program/token/bin/activation variants before supporting them.
- Demonstrate a fresh WebSocket → verified creation → complete market/risk evidence → paper fill run. Current finalized verification and five-second launch age constraints can prevent all fast-launch entries. Historical timestamps must remain historical.
- Establish mandatory token-owner concentration with complete reconciled account evidence, and explicitly define acceptable gaps in creator history, common beneficial control and historical liquidity. Unsupported safety evidence cannot be overridden with synthetic assertions.
- Add funded execution ownership, durable intent/outcome reconciliation, uncertain-signature recovery, actual cost accounting, operational incident handling and independently reviewed emergency controls. The ingestion WAL and paper ledger are not a funded execution journal.
- Validate provider discrepancies, upgrading programs, transaction landing/reorganizations, stale/no-sell positions, adverse selection, MEV and competition under sustained operation. Current diagnostic samples are not production SLOs.
- Keep separate authorization for any wallet funding or live signing. This repository task did not authorize or perform either.

See [the engineering report](../phase4-engineering-report.md) for measured regressions, current evidence and explicit acceptance gaps.
