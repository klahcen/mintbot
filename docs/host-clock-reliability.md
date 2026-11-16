# Host clock reliability — Phase 12

**Bounded timing passes; extended coverage acceptance remains unmet.** The independent observer reads realtime, monotonic, boottime and raw clocks, process CPU, scheduler and cgroup counters, journals and container clock bounds. It never modifies chain timestamps.

[Historical correlation](phase12/historical-clock-correlation.json) contains kernel suspend entry/exit markers during both earlier failed runs. Phase 11 measured 584.319388 monotonic seconds against 7,854.626 wall seconds; the 7,270.307-second discrepancy is excluded. Suspension is supported by these markers, rather than inferred solely from clock drift. Additional VM pauses and clock adjustments cannot be exhaustively ruled out.

[Preflight](phase12/clock-stability/evidence.json) achieved 300.000130316 seconds, with 31 successful host/container bounds observations, maximum sampling interval 1,288.465 ms and maximum realtime/monotonic step 0.054 ms. The separate [concurrent observer](phase12/clock-during-mainnet/evidence.json) achieved 300.000131739 seconds. These intervals are never added together. The delivered identity guard was exercised in a separate [120-second run](phase12/clock-final-mainnet/evidence.json); its timing observer achieved 120.000988550 seconds.

Actual subscription periods and fault chronology are in each run's `supervisor.intervals` and `supervisor.events`. The 300-second supervisor recorded 292.996 seconds fully ACKed and 4.819 disconnected, with three invalid WebSocket close frames. The final 120.005-second supervisor recorded 116.228 seconds ACKed and 3.568 disconnected, one invalid close frame and three HTTP 429 reconnect failures. Stable clocks do not establish complete subscriptions or market coverage.

`timedatectl` reported NTP synchronized; the journal records contact with the Ubuntu time server, not a measured offset correction. Chrony and adjtimex were unavailable. `systemd-detect-virt` returned `none`; this does not prove absence of scheduling interference. Original suspend-counter captures reported `IsADirectoryError`; the delivered observer now reads the directory's individual counters. The corrected [completion experiment](phase12/clock-completion/evidence.json) is separate and cannot extend either mainnet window.

The wrapper rejects missing, expired, wrong-boot or insufficient-duration certificates before monitoring. Actual network-disabled container [guard checks](phase12/host-health-cli-guards.json) include a certificate rendered stale by the overnight suspension. Same-boot certificates expire after 15 minutes and reject incoherent wall/monotonic ages. A certificate grants no trading permission.

Reproduce into a new directory, using a running Node container:

```sh
python3 scripts/phase12-host-health.py --seconds 300 --container mintbot-phase12-clock --output /tmp/mintbot-clock-new
```

No 1,800-second stability or coverage acceptance is claimed. Longer validation requires a fresh at-least-equal-duration preflight and operational prevention of suspension.
