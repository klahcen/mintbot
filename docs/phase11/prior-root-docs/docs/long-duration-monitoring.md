# Phase 10 long-duration monitoring

Finalized bounded experiment. Monotonic 7,200-second target met: **True**. Provider-reported continuous coverage established: **False**. Independent operation/agreement: **UNMET**. No duration or open socket is substituted for complete event coverage.

| Observation | Measured result |
|---|---|
| Run | Finalized bounded experiment |
| Requested monotonic monitoring seconds | 7200 |
| Recorded supervisor seconds | 7,200.000 |
| Process wall seconds | 7,201.782 |
| Transport-open seconds | 7,020.967 |
| Fully acknowledged subscription seconds | 7,004.942 |
| Transport-disconnected seconds | 179.033 |
| Wall/monotonic discrepancy ms | -0.336 |
| Connections / incidents | 111 / 110 |
| Delivered notifications | 898515 |
| Verified creations | 69 |
| Market reviews / parsed states / paired quotes | 69 / 0 / 0 |
| Paper entries / exits | 0 / 0 |
| Admission refusals | 357 |
| Active pending / quarantined | 0 / 79 |
| Oldest active work ms | 0 |
| Oldest pending ms including quarantine | 7194440 |
| Writer / pipeline failure | None / None |
| Two-hour monotonic target met | True |
| Provider-reported continuous coverage established | False |
| Independently operated provider agreement | UNMET |
| Live trading | False |

| Resource/timer | Measured observation |
|---|---|
| Process CPU user/system microseconds | {'user': 1660022298, 'system': 304654568} |
| Sampled peak RSS bytes | 290050048 |
| Sampled peak WAL bytes | 33498367 |
| WAL checkpoints | 66 |
| RPC calls / errors | 774 / 301 |
| Explicit HTTP/handshake 429 lower bound | 5 |
| Event-loop delay milliseconds | {'p50': 20.119551, 'p95': 21.020671, 'p99': 23.199743, 'max': 544.210943} |
| Fsync batches | 389577 |
| Fsync group records p50/p95/p99 | {'count': 389510, 'samples': 10000, 'p50': 4, 'p95': 8, 'p99': 9, 'max': 13} |

| Sampled slot scope | Range/anchor |
|---|---|
| Confirmed sampled receipt slots | [469404752, 469437708] |
| Finalized transaction response slots | [469404752, 469437708] |
| Finalized market account banks | [469404775, 469437692] |
| Durable admitted anchors, possibly including pending work | {'pump': {'signature': '3C2D32Awx7Weesjoe19JStPRJytqP2RwL9ezJvZFA3AScw6rSKt5MTmLCAWLka1QmnPxRy4zSSnPnf2PNv2uXamN', 'slot': 469438053}} |

Ranges describe sampled provider observations, not fully covered intervals. Slot differences are not converted into milliseconds. Research-pipeline monotonic runtime (startup/drain scope) is recorded separately in sample elapsedMs; container start/stop wall time is retained in the final container inspection. Wrapper bootstrap and final JSON export are not claimed as monitored coverage.

The measured job is a restricted Node22 container with compiled runtime snapshots sealed before pipeline import. All monitoring is Pump-only; creation candidates are bounded samples. Confirmed notification slots, durable admission anchors, finalized creation slots and finalized market banks are different evidence scopes. Receipt latency is process-local and never substituted for chain occurrence time.

`connectedMs` counts physical open intervals; `acknowledgedMs` begins only after every subscription ACK. Stale receipts and outages create explicit gaps; recovery windows remain provider-reported and bounded. Host clock drift above five seconds terminates before delivery of delayed notifications. Process wall, monotonic elapsed, disconnection and discrepancy are independently recorded. Oldest active work is separate from retained quarantines.

Raw observations and refusals rotate with retained deletion metadata. WAL ownership/acknowledgement remains worker fsync(file+directory), with pending/completed/disk caps and checkpoints. All source copies, in-flight/queue observations, memory/CPU, event-loop lag, RPC issues and rejection provenance are retained under [the validated run](phase10/runtime/mainnet-validated/). Final `evidence.json` follows stop, drain, flush and ledger reload; progress is interim only.

The earlier `runtime/mainnet` and `runtime/mainnet-final` calibrations are preserved separately, excluded from this window. The failed Phase9 host-discontinuity run is not added to this duration. Shared-host tests/builds/reference installs and performance probes overlapped portions of this run; recorded latency is not a quiet-host SLO. The research process has no PostgreSQL pool attached; database fault/recovery validation is separate.
