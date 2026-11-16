# Current Pump deployment compatibility

**Current Pump financial execution is blocked. The deployment pin was not changed.** Reviewed slot: 458921440. Captured slot: 469055660; ProgramData address: B5MvUwXdiW1NMM6QFFD3ssPKBujD4zMohncbM73Z2BQu.

| Captured object | Bytes | SHA-256 |
|---|---|---|
| Full ProgramData including loader header/allocation | 10485760 | c849155c1d5bf990c564bad8df406d704ed05b8d3dc4ee30ce2350bfbc4edf3a |
| Allocated code payload after 45-byte loader header | 10485715 | f0a9c1e2b65decfef63d807cbf2cedcfd24040634d1a9a3443b63eccecd809d6 |
| ELF extent referenced by headers/segments/sections | 1936536 | 0630a8108569c1c7a5b833c6e11276ebac03c801c495b1685fcfac99bf865cc5 |

Trailing allocation bytes all zero: True. ELF machine/flags: 263 / 0; these numeric fields are not interpreted as a verified program/source release. [Full request, finalized bank, loader ownership, Program pointer, header bytes and source revisions](phase10/pump-deployment/evidence.json) and the two binary files permit exact rehashing. Captures are bounded to two providers and 20 MiB per response. The byte range called ELF extent is not a reproducible-build or semantic-equivalence claim.

The Program account points to ProgramData under loader-v3; loader metadata and code are separate. [Solana's loader documentation](https://solana.com/docs/core/programs/program-deployment) explains that structure. The inspected official [Pump docs/IDL revision](https://github.com/pump-fun/pump-public-docs/tree/639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22) is captured locally with URLs/hashes. It documents quote assets, depth, holder rewards and retained-fee/sweep mechanics. Those published descriptions are not a verified build linked to this ELF hash.

Defensibly established: provider-reported finalized loader identity, ProgramData pointer, deployment slot and exact captured bytes. **Unknown:** source correspondence, all changed initialization/fee/supply/custody behavior, every new instruction's wire/economic contract, and positive compatible current buy/sell simulations. The unchanged `MarketRpc.deployment` rejects the real upgraded header fixture. The 1096-byte Global is separately rejected. No larger size, schema prefix, apparent reserve balance, SDK match or public simulation alone enables the deployment.
