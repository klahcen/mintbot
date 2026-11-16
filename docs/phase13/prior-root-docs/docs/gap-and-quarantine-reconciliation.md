# Gap and quarantine reconciliation

All 7,023 checksummed frames of the original completed WAL were replayed into memory without opening its writer lock.

| Exact reproduced decoder failure | Count |
|---|---|
| Incomplete invocation stack; fetch full transaction logs | 5 |
| Truncated invocation logs; cannot validate launch attribution | 35 |

The original failure stage was not retained by Phase9; replay demonstrates current deterministic rejection of those exact bytes, not unseen historical callback context. Original decoder/module hashes are recorded. Unknown fields/layouts, incomplete invocation attribution and truncation are not automatically token-risk failures. New durable failure records include stage, timestamp, error name and bounded URL-redacted cause.

Admission accounting: 223 total = 3 capacity refusals + 220 fingerprint conflicts. 2 known duplicates are separate. Full individual refusal payloads were not retained in Phase9, so fork versus provider inconsistency/truncation cannot be assigned to all 220 cases. New bounded refusal audit files retain original event/time, actual pipeline reason and retained/observed fingerprints, with explicit rotation metadata.

Finalized RPC rereads of the 40 original signatures:

| Observed outcome | Count |
|---|---|
| Finalized transaction unavailable | 10 |
| Read-only verification HTTP 429 | 30 |

A null transaction is unavailable provider evidence, not proof that no chain transaction existed. HTTP 429 is a recorded rate limit, not a verified bad token. These bounded reads do not replace original WAL payloads or timestamps.

[WAL reconstruction and review plan](phase10/phase9-reconciliation.json), [bounded RPC captures](phase10/quarantine-finalized-rpc.json), [fsynced review on forensic copy](phase10/quarantine-review-results.json). All 40 reviews retain ownership; pending/quarantined count remains 40 and the original gap remains unrecoverable. The original Phase9 WAL is unchanged. The forensic copy is separate and is not the production writer.

`phase10-quarantine-review.ts` requires an explicit plan, expected fingerprint and exclusive offline writer. Reviews are fsynced/checkpointed. Retain/retry never marks completion, alters the original observation/time, resets attempts, or marks coverage recovered. Retry opens a gap before clearing quarantine; at most three reviews and ten lifetime attempts are permitted. A retry is not freshness, independent-provider agreement or a trade authorization. Old readers must not be used to write reviewed WALs with the new record kind.

The stopped current WAL has 18971 checksummed frames and 0 incomplete tail bytes. Its 79 pending quarantines retain their actual failure metadata and original observations.

| Current durable failure stage/cause | Count |
|---|---|
| decode: Incomplete invocation stack; fetch full transaction logs | 1 |
| decode: Truncated invocation logs; cannot validate launch attribution | 78 |

Current refusal reasons: {'fork-or-provider-conflict': 354, 'admission-capacity': 3}. Full stopped ownership reconstruction: [runtime-reconciliation.json](phase10/runtime-reconciliation.json). These quarantines are separate from the 105 selected candidate receipts and are not additional invented paper rejections. No current pending ownership was removed during the read-only diagnosis.

Current run gaps (provider-reported only):

```json
[
  {
    "program": "pump",
    "fromSlot": 469404738,
    "toSlot": 469437712,
    "reason": "supervised-websocket-disconnect",
    "anchor": {
      "signature": "3QoTYothkAWABa1oSmFa83cXdoQkCNbPVjAiCHiW1vPHM5LgknktZhGschtMUqQuJKENKVbZ4Uc6Fi1HBAdyB1Ap",
      "slot": 469404771
    },
    "attempts": 3,
    "status": "unrecoverable",
    "knownRefused": 357
  }
]
```

Large clipped/pagination-limited intervals stay partial/unrecoverable. A persisted cursor is an audit checkpoint; restart rescans and deduplicates, not proof that missing pages were covered. Old pending age includes quarantine; `activePending` / `oldestActiveAgeMs` are separate. Admission anchors are durable observations and may include pending work; they are not necessarily completed strategy callbacks.
