# Coverage epochs and quarantine policy

Phase10 evidence is immutable. Its 79 quarantines reproduce 78 truncated invocation histories and one incomplete invocation stack. All 357 refusal records are retained: 354 fingerprint conflicts and three capacity refusals; six duplicates are separate. Only 3 refusals retain the older payload, so most conflicts cannot be assigned to a fork, provider corruption, truncation or malicious token. [Full per-record analysis](phase11/phase10-forensics.json).

A compact [historical coverage index](phase11/coverage-history.json) retains the complete original evidence file's SHA-256, final gap and pending ownership. A new `coverage-epoch.json` is created with exclusive write and file/directory fsync; it records its own UUID, source-index hash, original artifact reference, selected programs and unresolved history. Bounded finalized rereads of all 79 old signatures are retained in [RPC evidence](phase11/quarantine-finalized-rpc.json); none was retrievable in that capture, and original bytes/time remain unchanged. A clean local current window can be measured separately, but **independent policy review is UNMET and authorization always remains unknown** in this implementation. A new directory/UUID, cleared current queue or operator name never grants paper/funded permission.

Before any future policy permits current-window research, an independent review must define exact epoch start/finalized anchors, startup lookback, per-venue completeness, maximum gap/recovery bounds, attribution of shared-signature conflicts, stale replay exclusion, independent same-snapshot evidence and stop/restart ownership. This delivery does not supply or self-approve that policy. Historical gaps stay visible even if a future current window is clean; funded permission is always separate.

The offline `phase11-quarantine-review.ts --apply --journal <stopped-copy> --plan <plan> --output <new-audit.jsonl>` acquires the existing exclusive WAL lock. Every expected event fingerprint must match retained bytes. Retain never drops ownership. Retry additionally requires `--retry-authority <artifact>`: exact WAL/plan SHA-256, explicit distinct named approver, one-hour maximum validity and `liveAuthorized:false`. Names are operator configuration, not verified independent human identities. Header authority and per-commit JSONL records are fsynced; WAL reviews preserve original observations/timestamps and lifetime attempts, with at most three reviews/ten attempts. Retry reopens coverage before releasing quarantine, and restarted ingestion labels the original receipt as restart/history, never live freshness.

[Durable retain audit on a forensic copy](phase11/quarantine-review-audit.jsonl) leaves all 79 quarantines and pending identities owned. Originals remain untouched. The current stopped-run forensic reconstruction also accounts for all 260 fingerprint refusals and the single truncated-log quarantine in [per-record current analysis](phase11/current-run-forensics.json). None of these conflicts has a retained older payload, so the reason for the byte mismatch remains unproven. New retry CLI tests exercise missing authority, exact bindings, checkpoint/reload and pending gap retention. The full stopped current WAL is diagnosed in [runtime reconciliation](phase11/runtime-reconciliation.json); current quarantines: 1, active work: 0.

Current gaps:

```json
[
  {
    "program": "meteora-dlmm",
    "fromSlot": 469458861,
    "toSlot": 469461414,
    "reason": "fork-or-provider-conflict",
    "anchor": {
      "signature": "1111111111111111111111111111111111111111111111111111111111111111",
      "slot": 469458893
    },
    "attempts": 3,
    "status": "unrecoverable",
    "knownRefused": 258
  },
  {
    "program": "pump",
    "fromSlot": 469458872,
    "toSlot": 469461190,
    "reason": "supervised-websocket-disconnect",
    "anchor": {
      "signature": "3E3o3DXJobyiKzUzmqGMCfU7Q5gUVbW3WMH4yaWKfL9aeDNdoJng12RLFKLQKM85wF7qxAGNeGnTmYWRSkuv6rZ7",
      "slot": 469458904
    },
    "attempts": 3,
    "status": "unrecoverable",
    "knownRefused": 2
  },
  {
    "program": "pumpswap",
    "fromSlot": 469458876,
    "toSlot": 469461190,
    "reason": "supervised-websocket-disconnect",
    "anchor": {
      "signature": "aA5XirtarFN26BgurQx4pCTWhFQWVzZ8qciX7KfviRQ8qTCz15TRHshigJ2oJaaULTrW2fRCdbuSc9jwEDW8pk2",
      "slot": 469458908
    },
    "attempts": 3,
    "status": "unrecoverable",
    "knownRefused": 0
  },
  {
    "program": "raydium-cpmm",
    "fromSlot": 469458873,
    "toSlot": 469461190,
    "reason": "supervised-websocket-disconnect",
    "anchor": {
      "signature": "4LMAHPxjNqw2LrKBXfhZFR9KmUvdSLiH8GKVFRXpYnctCTkMJUPcjGzhe7dXwxaQE1FeC9LvZEy6BkKe1aEucbPk",
      "slot": 469458905
    },
    "attempts": 3,
    "status": "unrecoverable",
    "knownRefused": 0
  }
]
```

Partial/unrecoverable pagination remains incomplete. Recovery cursors and admitted anchors are provider observations, not proof of all missing events. Unavailable finalized transactions are not proof that the transaction never existed. No diagnostic replaces original WAL payloads or timestamps.
