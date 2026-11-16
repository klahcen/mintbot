# Stable monitoring validation — Phase 13

**Duration gate: PASS. Continuous required coverage: FAIL.** Elapsed time and complete event coverage are assessed separately.

| Separate experiment | Monotonic seconds | Result |
|---|---:|---|
| Corrected fresh 300-second preflight | 300.000203099 | Stable: True |
| Required same-budget preflight | 1800.000089956 | Stable: True |
| Primary supervisor, one run | 1800.000344329 | State: stopped |
| Concurrent independent clock observer | 1800.000107102 | Stable: True |

The Phase 12 timing guard still requires a completed preflight at least as long as the proposed monitoring interval. The additional 1,800-second preflight preserves that rule after the requested fresh 300-second check. Their durations are never added to monitoring. The earlier 120-second identity probe and roughly ten-second owner probes are also excluded.

Temporary `systemd-inhibit --what=sleep:idle --mode=block` locks are held during preflights and across launch/wait of the actual research container. [Inhibitor evidence](phase13/timing/inhibitors-during-preflight.json), [driver](../scripts/phase13-stable-monitor.py), [launch record](phase13/validated-runtime-launch.json). No permanent desktop sleep policy is changed. Kernel suspend counters, realtime/monotonic/boottime/raw clocks, scheduler/process/cgroup CPU and NTP journals are retained under `phase13/timing/`.

Primary supervisor wall seconds: 1800.001000; wall/monotonic discrepancy: 0.655671 ms. Connected: 1789.034800 seconds; fully ACKed: 1778.861819; disconnected: 10.965544. Connections: 6; incidents: 5. Exact socket/ACK/fault chronology is in `supervisor.intervals` and `supervisor.events` in [final evidence](phase13/runtime/mainnet-validated/evidence.json). The clock observer uses a persistent same-host container; the research wrapper additionally checks its own current boot and coherent wall/monotonic ages.

The initial `runtime/mainnet/` container failed a five-second public RPC genesis bootstrap before monitoring started. Its source/ledger/launch and container logs are preserved and contribute no supervisor time. The distinct primary `runtime/mainnet-validated/` uses PublicNode as primary and Solana public RPC as secondary; neither is authenticated or independently authorized.

The first 300-second observer wrote successful evidence, but its one-off outer launch command raised an exit-handling TypeError. That failed log is preserved. A corrected separate fresh 300-second launch returned success. No failure was overwritten or counted as extra coverage.

Final gap states are {'unrecoverable': 3, 'recovered': 1}, quarantines 752, invalid identities 69. WAL writer failure: None; pipeline fatal: None. These facts prevent a duration-only coverage claim. [Coverage reconciliation](independent-provider-and-coverage.md).
