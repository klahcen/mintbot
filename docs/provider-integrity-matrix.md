# Provider integrity matrix — Phase 14

| Requirement | Solana public | PublicNode |
|---|---|---|
| Authenticated independent operator pair | Unavailable | Unavailable |
| Genesis / selected finalized transaction | Captured in fresh read-only diagnostics | Captured in fresh read-only diagnostics |
| Meteora subscription delivery | See fresh per-connection control | See fresh per-connection control |
| Complete bounded historical interval | Unproven: latest-ten sample | Unproven: latest-ten sample |
| Same snapshot / bank | Different account banks; agreement unknown | Different account banks; agreement unknown |
| Provider authorization | False | False |

[Fresh provider history](phase14/provider-history.json) records matching selected signed transaction payloads with different account context banks. This cannot approve state agreement, authentication or operator independence. `minContextSlot` is a lower bound, never an atomic snapshot guarantee. Conditional equal reported slots alone would still need a defensible bank/common-snapshot contract and operator verification. Conflicts require immutable evidence and manual independent review; no automatic release, quorum override or epoch approval was added.

The inspected process contains no RPC/provider credential variable names; no `.env` exists in the repository (only `.env.example`). This does not assert credentials are absent from every external secret store. Supply the [operator prerequisites](external-prerequisites.md). Account owners/deployments used by diagnostics remain checked by existing market constructors and unchanged pins; these checks are separate from infrastructure authority.
