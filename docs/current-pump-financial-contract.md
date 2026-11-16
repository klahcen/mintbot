# Current Pump financial contract — Phase 12

**REJECTED for execution. No new financial adapter is enabled.** The [finalized deployment audit](phase12/pump-deployment-release/evidence.json) observes slot 469055660, while the reviewed pin remains 458921440. The referenced ELF is 1,936,536 bytes with SHA-256 `0630a8108569c1c7a5b833c6e11276ebac03c801c495b1685fcfac99bf865cc5`. Full ProgramData and allocated-payload hashes are separately recorded; these are different byte populations. Retained ELF bytes and prior pins remain unchanged.

The [Global review](phase12/global-layout-review.json) accounts for 1,088 serialized bytes against the actual 1,096-byte allocation. The final eight bytes are `1e00000000000000`. Their numeric appearance does not establish a field name or financial purpose. No authoritative semantics or defensible source-to-deployed-binary equivalence was established.

[Official captures](phase12/official/evidence.json) pin Pump documentation and IDLs to commit `639b87fb45c3adeffa6f7c4a1bf0cb85e392bf22`. The [supplement](phase12/official-supplement/evidence.json) preserves creator-fee, holder-reward and fee-sweep documents at the same revision. These sources describe interfaces; older README examples are not substituted for current account values.

| Contract area | Evidence and decision |
|---|---|
| Mayhem supply/reserves | Mode flags and IDL exist; full version-specific supply, custody and deployed implementation equivalence remain unproved. Disabled. |
| Native/non-native quotes | Global whitelists USDC and carries separate quote reserves. Pump-coin quote docs describe chained routing and prohibit Mayhem quote coins. No generalized SOL assumption is authorized. |
| Curve depth | Captured Global reports maximum depth 2. Official quote-coin documentation describes a program cap of 5 and checks on underlying curves. No recursive adapter enabled. |
| Creator fees | Creator-vault PDA derivation and configurable fees are documented. Final Global reports protocol 95 bps, creator 5 bps and maximum configurable creator fee 100 bps. These fields alone do not prove every rounding and routing rule. |
| Rewards/custody | Holder-reward docs route fees to a protocol-controlled recorded creator, with unchanged vault derivation; retained pool fees have separate sweep rules. Reward ownership cannot be equated to trader inventory. |
| Transfer restrictions | Each mint still requires current owner, authorities and exact extension checks; protocol documentation does not approve arbitrary Token-2022 mints. |
| Instructions | `create_v2` has optional reward arguments; quote-coin documentation introduces v3 swap/routing accounts. Legacy wires are insufficient proof for these variants. |

The [current network read](phase12/current-network-release/evidence.json) preserves finalized owners and Global bytes. The [buy diagnostic](phase12/current-buy-simulations.json) refuses Pump with `Unsupported Pump global version`; sell inventory discovery was also incomplete. No actual two-sided simulation proof exists for an enabled current Pump variant. Independent wire vectors for older supported subjects do not approve this deployment.

Approval requires authoritative tail semantics, a reviewed binary/financial-contract link, finalized fixtures covering each variant, exact independent integer quote and wire comparisons, custody checks and successful unsigned buy/full-position sell effects. An unchanged address or published IDL cannot satisfy these requirements.
