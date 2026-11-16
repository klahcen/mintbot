# Phase 3 WAL durability and ownership

The synchronous `EventJournal` remains available for compatibility and in-memory tests. File-backed server/CLI monitoring now opens `AsyncEventJournal`: a bounded main-thread state mirror and one dedicated worker owning the WAL file, PID lock, append, fsync, recovery and compaction. Source execution uses the committed `.mjs` bootstrap and installed tsx; emitted JavaScript uses the native worker module. No application rebuild was performed for this work.

## Acknowledgement contract

A call to `acceptDurable`/`offerDurable` reserves bounded local work, sends its record to the writer, and **awaits fsync of the WAL file and its parent directory**. Only then does it return accepted/deferred durable ownership, increment `journal.ownership_acks`, and allow decoding/strategy. A pending mirror entry before that response is a reservation, not a durable acknowledgement. `isOwned` prevents it entering the pipeline early. Duplicate receipts while a first offer is pending await the same ownership promise. A duplicate of a retained completed identity does not repeat processing.

`completeDurable` awaits a separately persisted completion record after primary persistence. `ingest.completed` and `journal.completion_acks` follow that acknowledgement. Completions may be acknowledged in groups; the asynchronous persistence stage admits up to 16 workers under the existing 128-flow global bound. Paper Store transactions remain serialized. Raw persistence has its own bounded single writer.

The synchronous `offer`/`complete`/`retry`/`compact` interfaces deliberately throw on the asynchronous journal. Consumers must use their awaited counterparts, `flush`, `checkpoint` and `shutdown`. Existing synchronous callers still work with `EventJournal`. Server/CLI and historical recovery use the awaited interface. Backfill flushes gap outcome records before reporting a recovered window.

Group commit defaults to at most **64 records** or a **2 ms collection delay**, with at most **one group in transit**, **1,024 unacknowledged records** and **4 MiB of unacknowledged serialized records**. New receipt reservations stop at 75% of writer capacity to leave completion/control headroom. Pipeline admission promises have a separate 512-call bound. Byte/record exhaustion returns an explicit refusal and a coverage gap; runtime pauses providers and retries bounded recovery. These bounds complement the 10,000 pending identities / 20,000 retained completions / 64 MiB WAL limits. None is an unbounded Promise queue.

A 2 ms collection delay is a throughput/individual-acknowledgement latency tradeoff; no single-event latency improvement is claimed. Grouping reduces the number of durability boundaries, **not the fsync guarantee**. `journal.fsync_batches` counts acknowledged record groups, not individual fsync system calls: each group syncs both file and directory, and checkpoints perform extra syncs.

## File format, recovery and compaction

New worker records use a version-2 envelope containing the validated record and SHA-256 of its serialized payload. Existing plain Phase 2 records remain readable; new appends/checkpoints become checksummed. Checksums detect accidental corruption, including a valid JSON edit that still passes ordinary field validation. They are not authentication against a local attacker who can rewrite the file and checksum.

The journal replays complete valid records in order. Unsupported envelopes, checksum mismatch, unknown record kinds and malformed complete records fail startup. An incomplete final line is truncated to the last newline and reported as `truncatedTailBytes`; such a tail could contain unacknowledged work and is not evidence that an acknowledged event was lost. PID locks survive SIGKILL and are reclaimed only when their owning process no longer exists. A dead worker inside a still-live process requires operator investigation/restart; no second writer is started speculatively.

Compaction runs in the writer thread. It writes a bounded checkpoint to a temporary file, **fsyncs the checkpoint before rename**, reopens the new WAL and syncs the file/directory. This also applies when the worker is batching ordinary append syncs: previously acknowledged work must never be replaced by an unsynced checkpoint. Automatic compaction starts before the WAL crosses 90% of its byte bound. The monitoring supervisor additionally requests a checkpoint at 50% when ingestion and acknowledgements are idle, checking every 30 seconds. Only one control operation is admitted. New writes wait within existing bounds during that operation.

A worker failure, timeout, write error or fsync error rejects unresolved acknowledgements and stops further ownership. The mirror remains explicitly failed; it is not permission to process its unacknowledged payloads. A failed/unacknowledged write may nevertheless be present after restart, so recovery is at least once until the completion record. Duplicate worker responses do not produce duplicate acknowledgements or callbacks.

## Crash boundary and limits

SIGKILL tests cover a receipt whose ownership was acknowledged and whose paper snapshot committed before WAL completion. Restart replays that pending identity into the existing retained paper-ID window and makes no second purchase or fee. Other tests cover truncated tails, complete-record corruption, checksums, bounded admission, duplicate acknowledgements and injected write/fsync `ENOSPC` failures. Full disk is simulated at the persistence boundary; the tests do not fill the user's actual disk.

The WAL is not a cross-system transaction with Store snapshots, raw JSONL, optional SQL or callbacks. Callbacks need stable IDs and idempotence. The existing paper `seen` list retains 10,000 IDs; there is no indefinite exactly-once promise after that horizon. Raw audit lines can repeat after a crash. A process may crash before receiving an acknowledgement for a record that did reach disk; replay of such ambiguous work is expected.

The existing paper Store still uses temporary-file/rename snapshots without file fsync. WAL durability improvements do not upgrade the paper account snapshot to an independent financial database. Directory/file fsync relies on the host filesystem/device honoring those calls; no physical power-cut experiment, distributed ownership or hardware fault-tolerance proof was performed. Live signing and funded execution remain disconnected.
