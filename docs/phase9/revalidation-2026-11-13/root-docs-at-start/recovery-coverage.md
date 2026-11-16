# Phase 9 recovery coverage

The existing WAL, stable event identities, bounded live-priority queues and recovery verifier remain in place. `HttpRecoveryRpc` now accepts an explicit finalized commitment for the research run; its existing confirmed default remains compatible. A new awaited page-progress callback records target/from slots, cursor, pages, retrieved/duplicate/unavailable counts, anchor visibility and boundary visibility. The CLI fsyncs the progress file and its parent directory. The WAL owns gap bounds, anchors and attempt counts.

A recorded cursor is audit progress, **not** authorization to skip earlier pages after restart. Restart rescans from the head and deduplicates against durable identities. Recovery is reported complete only when the original anchor and lower boundary were seen, no window was truncated, transactions were available, accepted work finished, and the gap did not expand during the scan. Provider-reported history is not independently proven complete history.

The monitor pins each scan to the selected HTTP provider. Each scan has a 2000-slot window, ten 100-signature pages, at most 1000 transactions, one retry and a 20-second deadline. A program gets at most three automatic cycles; an explicit reviewed recovery action is required to reset exhausted attempts. A new disconnect merged into an exhausted gap now remains explicitly unrecoverable, with a flush before completion. The final run includes the status correction before launch. The interrupted first run under `mainnet-extended` predates it and retains a pending exhausted gap; that original artifact is preserved. Neither version permits a paper entry through an unresolved gap.

Observed final/current WAL gaps:

```json
[
  {
    "program": "pump",
    "fromSlot": 467967153,
    "toSlot": 467971626,
    "reason": "fork-or-provider-conflict",
    "anchor": {
      "signature": "2uYT6jhi6RHVb5G71KioXea54Z5u2nRstmGURJYzQe2EDyaMxSrBGAF4wTHvCCTZjpfrzxCvFAmDZtvtxEzZL9Gf",
      "slot": 467967186
    },
    "attempts": 3,
    "status": "unrecoverable",
    "knownRefused": 62
  }
]
```

The bounded real RPC attempt using the **last selected Phase 8 anchor** returned the result in [phase8-recovery.log](phase9/phase8-recovery.log). It cannot certify outages preceding that anchor. Its window was clipped and stayed partial. Raw-page progress and the private research WAL are retained in the corresponding `phase8-recovery-*` directory. No Phase 8 interval is newly claimed fully recovered. A separate controlled finalized Meteora history probe also stayed partial: five ten-signature pages were all newer than its fixed target, so the bounded scan did not reach the requested window. [recovery-probe.log](phase9/recovery-probe.log) and its retained RPC responses demonstrate the limitation; zero retrieved transactions do not mean an empty chain interval. The probe does not claim recovery of an observed outage.

Deterministic durable-WAL tests interrupt after an awaited page checkpoint, restart, rescan, and assert no repeated strategy identity. Tests also check finalized RPC parameters, the confirmed default, and exhausted merged-gap behavior. Existing retention, missing-transaction, pagination, 429 and live/history priority tests remain unchanged. See [recovery test log](phase9/recovery-tests-release.log). New paper admission requires fresh receipts, no quarantined work or ingestion failure, and every current gap recovered; historical discoveries retain their origin and cannot become fresh launch entries.
