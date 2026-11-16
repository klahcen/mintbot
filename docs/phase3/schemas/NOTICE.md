# Pinned upstream schema/source evidence

The JSON IDLs and Raydium Rust excerpts in this directory are retained from the official repositories at the commits listed in `../protocol-coverage.md`. They are reference evidence, not Mintbot-authored program implementations. Preserve upstream authorship and consult the pinned repository licensing when redistributing them:

- https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22
- https://github.com/raydium-io/raydium-cp-swap/tree/3d69122790e97cd6aff24e8ba95940793773f58c
- https://github.com/MeteoraAg/dlmm-sdk/tree/af36dd53ab180783ccecda306926189a4700953c

`src/protocol-layouts.json` is a reduced structural subset generated from those pinned IDLs, with documentation fields removed. It does not authorize additional instruction variants beyond the explicit verified whitelist.
