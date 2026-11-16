# Selective WebSocket delivery — Phase 14

The Phase13 single-venue controls received 6,591 Meteora notifications from Solana public and zero from PublicNode, despite acknowledgements. This is connection/provider-specific evidence, not proof of a remote implementation defect. Original [control](phase13/venue-controls.json) and wire evidence remain unchanged.

Fresh concurrent controls subscribe to `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo` with the same supervisor, strict decoding and shared 300-second stop deadline. Requests, request IDs, ACK results, connection generations, subscription lifecycles, open/close/error/ping/pong chronology, normalized counters, receipt times and bounded wire traces are retained. ACK intervals differ with connection setup and reconnection; whole-window counters are not equal exposure estimates.

```json
[
  {
    "host": "solana-rpc.publicnode.com",
    "notifications": 0,
    "invalidIdentities": 0,
    "acks": 7,
    "elapsedSeconds": 292.6366959,
    "acknowledgedSeconds": 215.500058844,
    "connections": 8,
    "incidents": 8,
    "firstReceiptAt": null,
    "lastReceiptAt": null,
    "finalizedSample": null,
    "wireDropped": 0
  },
  {
    "host": "api.mainnet-beta.solana.com",
    "notifications": 27100,
    "invalidIdentities": 5,
    "acks": 2,
    "elapsedSeconds": 299.970046331,
    "acknowledgedSeconds": 298.89857337499996,
    "connections": 2,
    "incidents": 1,
    "firstReceiptAt": 1794751174809,
    "lastReceiptAt": 1794751474124,
    "finalizedSample": null,
    "wireDropped": 0
  }
]
```

[Full experiment](phase14/delivery-control.json), [command](phase14/README.md). Finalized signature lists are capped at ten per endpoint. One selected transaction per endpoint was requested for original-signature and program-invocation verification, but both calls returned RPC `-32015`: transaction version 1 exceeds the current reader limit of 0. [Exact follow-up responses](phase14/version-diagnostics.json) preserve that compatibility blocker. No finalized program-log verification succeeded in this control. They are a clipped activity sample, not all finalized events in the monitoring window. Failed/null reads are unavailable. Confirmed notifications can differ from finalized history; no fork is inferred.

The synthetic supervisor regression shows that subscription routing preserves a silent venue even while another venue receives valid traffic. Existing tests cover ACK collisions, unbound IDs and old-generation callbacks. This supports investigating endpoint/connection delivery; it does not exclude network, server-side routing or other provider behavior. Resolving remote cause needs operator server logs tied to the retained connection times and subscription IDs. A positive delivery control never proves complete delivery.
