# Operational ownership validation — Phase 12

**Single-host shared-namespace controls pass the retained operational checks. Distributed ownership is not claimed.** The shared owner is an exclusive file lock with no automatic foreign/stale owner takeover. The sticky authenticated stop persists across controller/ledger operations. The final wrapper retains inherited entry and exit fences introduced at the end of Phase 11.

The [final release probe](phase12/final-release-probe-stop-owner-smoke.json) ran the delivered compiled wrapper in the actual read-only research container. A concurrent owner in the same configured namespace failed with `EEXIST`. Authenticated kill returned HTTP 200; the controller observed stop, drained, killed its file-backed ledger and released ownership. Four historical epochs were retained and paper trades remained zero. Its 10.000451 seconds are excluded from both mainnet durations.

The [production image smoke](phase12/production-delivery-smoke.json) exercises dashboard and API authentication (401/200), no-store research status, SQL asset availability and live-mode startup rejection. The [CLI guard matrix](phase12/host-health-cli-guards.json) executes missing, too-short, wrong-boot and suspended/stale timing evidence against the actual image with networking disabled.

The current 312-test suite includes existing WAL crash/tail recovery, durable admission, sticky-stop commit fencing, inherited exit fencing, quarantine authority, owner refusal and ledger recovery checks. All original Phase 11 test files remain byte-identical. Final [WAL replay](phase12/final-runtime-reconciliation.json) reads 9,329 checksummed frames without writing the original WAL; incomplete tail bytes are zero. Its replayed in-memory status says `durable:false` by construction; the original runtime status separately records durable fsync acknowledgement. Replay does not erase gaps or authorize entries.

Retained [PostgreSQL fault evidence](phase12/release-validation/prior-helper-rerun/docs/phase8/database-validation.json) covers SCRAM runtime roles, credential rotation, immediate crash recovery and backup/restore with fsync, synchronous commit and full-page writes enabled. This is a single-node local test, without HA or distributed lease guarantees.

Cross-host ownership still requires an independently reviewed lease, fencing and storage design. Independently mounted paths do not establish a shared namespace. Full fresh-candidate entry/exit under the operational wrapper remains unproved.
