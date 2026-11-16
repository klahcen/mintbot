# Phase 15 monitoring and performance

**PARTIAL local validation; operational research EXTERNALLY BLOCKED.** Neither the 300-second research probe nor the independently timed 1,800-second run was started, because provider/epoch prerequisites are absent. No current venue ACK/disconnection durations, recovery completeness, RPC errors, queue/fsync latency, RSS/CPU or candidate decisions were measured. Offline test/build durations are validation timings, not chain monitoring.

No new performance benchmark or speedup claim is made. Historical benchmarks retain their original scope. On prerequisite approval, use existing supervisor/host-clock controls, exclusive ownership and durable storage. Record per-venue acknowledged/disconnected/stale intervals and recovered/unrecoverable gaps, resource/queue/fsync metrics, exact decisions and matching source hashes. Exclude sleep, process pauses and calibration; retain failed attempts. [Validation commands](phase15/README.md), [validation results](phase15/isolated-final/clean-validation.json).

Final isolated validation passes 330 TypeScript tests and five Python clock tests, clean Node22 install/typecheck/build, PostgreSQL fault controls and zero-advisory npm audit. Test timings are retained without a performance comparison.
