# Phase 14 evidence and reproduction

Overall acceptance is **PARTIAL / EXTERNALLY BLOCKED**. See the [eleven-item verdict](../phase14-engineering-report.md) and [operator prerequisites](../external-prerequisites.md). All commands are read-only chain diagnostics or isolated local validation. No command signs or broadcasts.

Use Node22 (`node --version` must report v22), npm, Docker and local PostgreSQL16 binaries for full tests. The clean validator currently defaults to the installed `/home/lkazaz/.nvm/versions/node/v22.22.0/bin` executable directory and records its actual version. SDK comparisons require the pinned standalone installations under `/tmp/mintbot-pump-reference` and `/tmp/mintbot-phase5-reference`; their versions, integrity and entry hashes are in the output. These are reference dependencies, not changes to the application lock.

```sh
python3 scripts/phase14-validation.py --output-root docs/phase14/validation-repeat
node --import tsx --test tests/phase14-venue-delivery.test.ts tests/phase13-wire-identity.test.ts
node --import tsx scripts/phase14-delivery-control.mjs --run --seconds 300 --output docs/phase14/delivery-repeat.json
node --import tsx scripts/phase13-provider-history.ts --run --output docs/phase14/provider-repeat.json
node --import tsx scripts/phase13-creation-validation.ts --run --output docs/phase14/creation-repeat.json
node --import tsx scripts/phase14-creation-fixtures.ts --run
node --import tsx scripts/phase6-mainnet-simulation.ts --run --venues pumpswap,raydium-cpmm --output docs/phase14/buy-repeat.json
node --import tsx scripts/phase7-sell-simulation.ts --run --venues pumpswap,raydium-cpmm --output docs/phase14/sell-repeat.json
node --import tsx scripts/phase9-builder-reference.ts --output docs/phase14/wires-repeat.json
node --import tsx scripts/phase9-quote-reference.ts --output docs/phase14/quotes-repeat.json
docker build -t mintbot:phase14-readonly .
python3 scripts/phase9-image-smoke.py --image mintbot:phase14-readonly --output docs/phase14/smoke-repeat.json
node --import tsx scripts/phase7-performance-benchmark.ts --before-root /tmp/mintbot-phase13-clean-delivery-9xep4e38 --runs 3 --scenarios durable-burst-200,sustained-stream --output docs/phase14/performance-repeat.json
python3 scripts/phase14-report.py
python3 scripts/phase14-final-validation.py
```

Choose new output names for immutable capture commands. `phase14-creation-fixtures.ts` refuses to overwrite its fixed output; preserve or relocate the original before repeating in a new checkout. The provider-history command rechecks the retained Phase12 Raydium subject; the new fixture command separately checks the Phase13 Raydium subject.

`clean-tests.log` retains the initial loaded-host API startup timeout (327/328); `clean-tests-retest.log` records the complete same-concurrency rerun (328/328). `full-tests.log` retains the supplementary Node20 timeout. `final-focused-tests.log` retains an intermediate trace-contract regression; `final-focused-retest.log` proves the correction without editing original tests. `clean-validation.json` records all initial and final check exit codes. Final typecheck/build and validated-source hashes apply to the final code.

`delivery-control.json` has a requested 300-second shared deadline. PublicNode terminated at 292.637 seconds after eight incidents; Solana public monitored 299.970 seconds. ACK duration, connection duration and receipt counts are separate. Follow-up reads do not contribute monitored time. Five incoming zero envelopes are retained byte-exact; 5/27,100 is the normalized Solana/Meteora invalid-identity rate; PublicNode's zero denominator is undefined. Neither clipped history nor a supported transaction-version error is interpreted as zero finalized activity.

The follow-up `version-diagnostics.json` captures both exact `-32015` responses for the original sampled subjects. Their current transaction version1 is unsupported by the unchanged version0 reader. No broader current-transaction compatibility is implied by successful historical fixture reads.

`matched-performance.json` contains twelve randomized jobs (three before/after repetitions per selected scenario), source/harness hashes, seed, workload and fsync evidence. The baseline directory is the retained Phase13 clean installation; the harness records its actual source hashes. Measurements on a shared host do not establish a speedup or assess the new supervisor gate's CPU cost.

`source-at-start-sha256.json`, `validated-source-sha256.json`, `preservation-check.json`, final manifests and source patch distinguish baseline, validated source and immutable historical evidence. No Git repository metadata exists in this workspace; no commit/PR is claimed. No new four-venue 300-second research probe or 1,800-second research run was attempted after the provider/epoch prerequisite stop.
