# Public competitor research

Research date: **2026-11-03**. Scope: Trojan, BONKbot/Telemetry, GMGN, Axiom and Maestro. This is an independent public documentation review; no account was funded, trade placed, private API queried, or competitor source code inspected.

## Evidence standard

**D** means the vendor documents a capability. It does not mean an independent execution test verified it. **U** means unknown from the sources reviewed, not absent. **H** means an architectural hypothesis. Marketing speed, security and profitability statements are not measurements. Documentation can lag production; launchpad support and fees require rechecking in the actual interface before any trading decision.

Trojan's current web terminal and older Telegram documentation describe different surfaces. BONKbot's Telegram bot and Telemetry likewise have different controls. Their capabilities must not be silently combined into a claim that every surface supports every feature.

## Feature matrix

Source keys link to the evidence register below. All affirmative entries are **D**, unless explicitly marked otherwise.

| Capability | Trojan | BONKbot / Telemetry | GMGN | Axiom | Maestro |
|---|---|---|---|---|---|
| Token discovery | Trenches new/about-to-migrate/migrated lists [T1] | Contract/URL entry; alpha alert channels [B1] | Smart-money tracking and signal feeds [G1,G2] | Explore/Pulse, wallet and tweet monitors [A1] | Pasted contracts, signals, premium trending [M1,M3] |
| Launch detection | Real-time new-token and migration categories [T1] | Alert feed documented; launch event mechanism U [B1] | New-LP notification channel [G1] | Migration actions [A2] | Solana auto-snipe on Raydium V4 [M2] |
| Automatic buy/sell | Limit, DCA, quick/clipboard buys [T2] | Auto-buy on contract; DCA; Auto Strat [B2,B3,B4] | Contract auto-buy, limit and auto-sell [G1] | Limit orders and migration buy/sell [A2,A3] | Signals, copytrade, auto-snipe and limit orders [M1] |
| Pool discovery | Migrated-token/DEX filtering; raw pool subscription U [T1,T5] | Raw pool discovery U | New-LP notifications [G1] | Migration discovery; raw pool subscription U [A2] | Supported venues listed; arbitrary pool detector U [M4] |
| Submission/priority | Configurable gas in Telegram; terminal proprietary routing claim [T2,T6] | Priority presets/custom; Jito modes [B5] | Priority, tips, custom backup RPC [G3] | Priority, bribe, MEV modes [A4] | Global gas settings; Solana-specific routing U [M4] |
| Wallet management | Creation/import, groups, up to 10 active wallets [T3] | Funded wallet and security settings; internal signing U [B2] | Generated wallet, import/export and switching [G1] | Multi-wallet dashboard and switching [A5] | Generate/import, multi-wallet monitor [M1,M4] |
| Copy trading | Telegram documented; current terminal index also lists it [T4,T7] | U in reviewed sources | Automated wallet copy mode [G1] | Tracking documented; automated copy execution U [A1] | Copy buys/sells documented [M1] |
| Sniper controls | Telegram sniping documented; precise venue-specific controls U [T4] | Manual fast entry documented; autonomous launch sniper U | Auto-buy amounts/slippage/fees; full launch sniper semantics U [G1] | Migration order and fees [A2] | Auto-snipe; Solana Raydium V4 scope [M2] |
| TP/SL exits | Terminal TP/SL limit orders [T2] | Fixed/trailing SL, partial TP, up to four rules [B4] | TP/SL with configured order expiry [G1] | Buy/sell limit orders; trailing SL U [A3] | Automated buy/sell limits; trailing specifics U [M1] |
| Rug/honeypot signals | Developer launch/migration metrics; scanner guarantees U [T1] | Holder distribution analytics; rug classifier U [B6] | Mint, holders, freeze/blacklist, burned LP and creator-history signals [G4] | Dedicated scanner methodology U | Premium prelaunch simulator advertised; Solana applicability U [M3] |
| Monitoring/alerts | Wallet tracking, alerts, orders, analyzer [T7] | Trades, holders, orders, fills and history [B6] | Wallet alerts/new-LP/signals [G1,G2] | Wallet/tweet monitoring and portfolio [A1] | Trade monitor and positions [M1] |
| Interface/analytics | Web terminal and Telegram bot [T2,T4] | Telegram, web and mobile Telemetry [B7] | Web and Telegram [G2] | Web terminal [A1] | Telegram trading bot [M4] |
| Measured latency | U | U | U | U | U |

## Trading costs and slippage

| Platform | Published platform charge | Slippage and additional costs | Evidence limits |
|---|---|---|---|
| Trojan | Current terminal FAQ: 1% per successful trade; rank-based SOL cashback | Older Telegram FAQ documents a 15% default, configurable slippage and gas presets | Telegram pages differ: older referral description says 0.9%, newer FAQ says 1% with 20% cashback. Do not apply bot promotions to terminal fees. [T5,T6,T8] |
| BONKbot | 1% per successful swap; Telemetry rewards vary with volume | Separate buy/sell slippage and max-price-impact controls; priority/Jito-related settings | No independently verified total cost or cashback entitlement. [B8,B9,B5] |
| GMGN | 1% handling fee per transaction | Network gas, priority and tip are separate; venue/token fees may add costs. Custom RPC is described as simultaneous backup submission | Docs contain multiple MEV-related minimums and modes; verify active UI rather than treating an old threshold as universal. [G3] |
| Axiom | Published net tiers range from 0.95% (Wood) to 0.75% (Champion), with corresponding cashback of 0.05–0.25 percentage points | Docs list 0.001 SOL priority and 0.001 SOL bribe defaults; slippage and MEV modes configurable | Net plus cashback implies a 1% gross schedule; this is arithmetic inference. Defaults are not recommended limits. [A4,A6] |
| Maestro | 1% on successful buys and sells, extracted within the Solana transaction | Network and execution costs remain separate; global slippage controls documented | Optional premium is $200/month; subscription does not replace transaction fees. [M4,M5,M3] |

Slippage tolerance is a permitted execution bound, not an amount charged on every trade. Price impact, movement between quote and landing, token transfer fees, platform charges, validator fees and tips require separate accounting. A buy and subsequent sell are distinct charged transactions. The new platform should store quoted and actual token/SOL deltas, on-chain fee, tips, venue/platform fees and remaining inventory cost basis; never infer profitability from chart price alone.

## Workflow reconstruction

The common documented workflow is: configure/fund a trading wallet → discover or paste a mint → inspect available token/holder data → choose size, slippage and fees → submit a market or conditional order → inspect transaction outcome and portfolio → manage automated exits. One-click execution and unattended conditional orders are common features, but their documentation does not establish how each service authenticates a signer, reserves balances, deduplicates events or reconciles uncertain submissions.

**H:** A plausible implementation separates a chain indexer, token metadata/risk service, strategy scheduler, signer, execution router and portfolio reconciler. An alternative is a third-party data feed plus a centralized order worker. Both could produce the documented user experience. Neither architecture can be attributed to a competitor from these sources.

Submission modes describe a tradeoff between broader propagation and restricted routes; they do not establish complete sandwich immunity. BONKbot's Turbo mode can fall back to unprotected routing, while Axiom explicitly distinguishes reduced and secure routes. Vendor language claiming guaranteed protection or guaranteed early entries is not adopted as a system guarantee. [B5,A4,M2]

## Limitations and implementation consequences

- No independently measured latency distributions, first-block rates, trade success rates, uptime, profitability or comparative rankings were found in the reviewed evidence. No benchmarks were run against competitor services.
- GMGN explicitly says security checks may be inaccurate; its risk labels are signals rather than proof of sellability. Our scanner must expose unknown data and reject required-but-missing checks. [G4]
- Axiom's migration documentation explicitly references pump.fun-to-Raydium. It does not verify current PumpSwap behavior. Maestro distinguishes Raydium V4 auto-sniping from its broader list of tradable venues. These are material scope boundaries. [A2,M2,M4]
- No competitor's proprietary RPC topology, decoder implementation, routing algorithm, private-key boundary, hot-wallet recovery process, replay protection or internal risk thresholds were verified.
- No wallet was connected and no private key was created/imported/exported during research. Vendor wallet features are reported as documentation, not a recommendation to replicate secret-export interfaces.
- Phase 2 must use public transaction signatures with documented provenance. A fee recipient can support attribution, but unrelated transfers or copied instructions alone cannot prove a transaction was generated by a bot.

## Evidence register

All links below were accessed through public web research on 2026-11-03. Sources are vendor-controlled documentation or product pages. Search results from affiliate/referral sites and lookalike domains were excluded.

### Trojan

- **T1** [Trenches](https://docs.trojan.com/terminal-overview/meme-coin-trenches.md)
- **T2** [Swaps](https://docs.trojan.com/trading-on-trojan/trojan-swaps)
- **T3** [Wallet Management](https://docs.trojan.com/trading-on-trojan/wallet-management.md)
- **T4** [Telegram feature overview](https://docs.trojanonsolana.com/overview/get-to-know-trojan-on-solana)
- **T5** [Terminal FAQ](https://docs.trojan.com/faqs)
- **T6** [Telegram FAQ](https://docs.trojanonsolana.com/overview/trojan-on-solana-faq)
- **T7** [Current terminal documentation index](https://docs.trojan.com/llms.txt)
- **T8** [Older Telegram fees and security](https://docs.trojanonsolana.com/about-trojan-on-solana)

### BONKbot

- **B1** [Official product page](https://bonkbot.io/)
- **B2** [Telegram settings](https://docs.bonkbot.io/bonkbot/settings/settings)
- **B3** [DCA](https://docs.bonkbot.io/bonkbot/advanced-trading/dca)
- **B4** [Auto Strat](https://docs.bonkbot.io/telemetry/trading/auto-strat)
- **B5** [MEV Protection](https://docs.bonkbot.io/bonkbot/settings/mev-protection)
- **B6** [Trading stats](https://docs.bonkbot.io/telemetry/trading/terminal/stats)
- **B7** [Overview](https://docs.bonkbot.io/)
- **B8** [Fee structure](https://docs.bonkbot.io/fee-structure)
- **B9** [Slippage controls](https://docs.bonkbot.io/bonkbot/settings/slippage-config)

### GMGN

- **G1** [Solana Telegram bot guide](https://docs.gmgn.ai/index/gmgn-tg-sniper-bot-sol.md)
- **G2** [Tutorial index](https://docs.gmgn.ai/index)
- **G3** [Fees and settings](https://docs.gmgn.ai/index/gmgn-fees-settings)
- **G4** [CA security checks](https://docs.gmgn.ai/index/ca-security-checks.md)

### Axiom

- **A1** [Product documentation](https://docs.axiom.trade/)
- **A2** [Migration actions](https://docs.axiom.trade/axiom/swap/migration-actions.md)
- **A3** [Limit orders](https://docs.axiom.trade/axiom/swap/limit-orders.md)
- **A4** [Solana fees, slippage and routing modes](https://docs.axiom.trade/getting-started/fees/solana-fees)
- **A5** [Multi-wallet](https://docs.axiom.trade/multi-wallet.md)
- **A6** [Platform fee/cashback tiers](https://docs.axiom.trade/getting-started/fees/axiom-fees)

### Maestro

- **M1** [Manual overview](https://docs.maestrobots.com/sniper)
- **M2** [Auto Snipe and chain-specific scope](https://docs.maestrobots.com/sniper/auto-snipe)
- **M3** [Premium subscription](https://docs.maestrobots.com/sniper/premium-subscription)
- **M4** [Getting started and supported venues](https://docs.maestrobots.com/sniper/getting-started)
- **M5** [Monetization and public fee addresses](https://docs.maestrobots.com/sniper/monetization)
