# Phase 8 dashboard research visibility

The existing dashboard, synthetic replay controls, market-paper controls and authentication remain in place. A separate **Research** tab reads an opt-in snapshot of the bounded read-only monitoring workflow. It does not start monitoring, sign, broadcast, fund or approve execution.

## Source and configuration

Set `RESEARCH_STATUS_PATH` on the existing server to a producer-written local `research-status.json`, for example `docs/phase8/mainnet/research-status.json`. The authenticated endpoint is `GET /api/research/status`. It accepts no path argument. Without a configured, valid snapshot, the response and view report unavailable evidence rather than zeros or invented observations.

`src/research/status.ts` defines the version-1 `ResearchSnapshotSchema`. It projects only named public fields: launch identity/protocol/slot, verification and market status, decisions and rejection reasons, unsigned buy/sell simulation status, research paper positions and P&L, public provider identities/errors/slots, WAL/queue/backfill status, research intent states, stage latency quantiles and readiness findings. Unknown raw payload fields, wallet material and producer configuration are omitted. Endpoint URLs and credential-labelled text are redacted even inside permitted display text. Producers must supply only public data; this projection is not a secret storage mechanism.

Reads are limited to a regular, non-symlink file and one MiB. Schema cardinalities limit launch rows to 100, positions to 50, providers to 8, intents to 100, latency series to 80 and readiness rows to 30. Invalid inputs fail as unavailable. A snapshot older than 30 seconds is explicitly stale; this status does not change the underlying evidence states or authorize paper entries. Future-dated snapshots outside five seconds are rejected. The producer should write a temporary file and atomically rename it; a partial write otherwise becomes unavailable until the next poll.

## Display and security boundaries

The Research tab polls every three seconds with the existing in-memory bearer token. Requests are cancelled when the component closes or credentials change. The endpoint inherits the existing bearer authentication, same-origin check and `Cache-Control: no-store`. Browser authentication is observation access only; the research view has no mutation or live-execution controls. React text rendering escapes untrusted content.

Synthetic balance/P&L cards and the synthetic engine sidebar are hidden within the Research tab to keep the separate ledgers clear. Research positions and P&L come only from the configured research snapshot. Missing paper marks/P&L, provider agreement, WAL data or latency samples remain visibly unknown. Simulation success is explicitly distinguished from a paper fill, and successful RPC simulation is never presented as a funded trade. Snapshot age, recording time and the producer-provided running/stopped/failed monitor status remain visible. Missing run status is unknown. The existing start/configure action group is hidden in the Research tab; other workspace tabs retain their controls.

## Validation

`node --import tsx --test tests/research-dashboard.test.ts` covers four cases: bounded allowlisted projection and stale/unknown evidence; regular-file limits and symlink refusal; server-rendered UI escaping/mode labels/no execution controls; and actual HTTP bearer/origin enforcement, non-cacheability, ignored client path selection and GET-only routing. Backend/frontend typecheck passed after these additions. Browser screenshot validation was not performed: this environment exposes neither a browser tool nor an installed Chromium/Playwright runtime. Server-rendered output is tested, but it is not a claim of visual browser verification.
