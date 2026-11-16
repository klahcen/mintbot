# Upstream reference provenance

Retained Meteora TypeScript helpers are authored by MeteoraAg, from `dlmm-sdk` commit `af36dd53ab180783ccecda306926189a4700953c`, under `ts-client/src/dlmm/helpers/` and `constants/index.ts`. They are reference/test evidence, not Mintbot-authored SDK code. The independent reference runner executes their BN fee/bin helpers and selected original math declarations. No published npm package was available at the repository's declared `1.9.15` version during this run; the report does not claim that package was installed. Consult upstream licensing before redistribution; root LICENSE/LICENSE.md retrieval was unavailable.

Retained Raydium Rust sources are from `raydium-io/raydium-cp-swap` commit `3d69122790e97cd6aff24e8ba95940793773f58c`, under `programs/cp-swap/src/`. The upstream Apache 2.0 license is included as `raydium-LICENSE`.

Pump and PumpSwap layouts are reduced structural definitions from the official IDLs already retained in `docs/phase3/schemas`, commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`. `pump-sdk-pin.json` and `pumpswap-sdk-pin.json` record exact official npm versions and package integrities for independent temporary SDK checks. The project dependencies were not changed to include either SDK.

Primary references:

- https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22
- https://www.npmjs.com/package/@pump-fun/pump-sdk/v/4.3.1
- https://www.npmjs.com/package/@pump-fun/pump-swap-sdk/v/2.2.0
- https://github.com/raydium-io/raydium-cp-swap/tree/3d69122790e97cd6aff24e8ba95940793773f58c/programs/cp-swap/src
- https://github.com/MeteoraAg/dlmm-sdk/tree/af36dd53ab180783ccecda306926189a4700953c/ts-client/src/dlmm

The reduced market JSON schemas retain only account/type definitions and remove documentation. Supported runtime variants are narrower than these schemas. Real account fixtures contain provider, capture time, commitment and context slot; fixture/source checksums are in the Phase 4 manifest.
