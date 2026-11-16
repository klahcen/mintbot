# Phase 15 evidence and reproduction

**PARTIAL / EXTERNALLY BLOCKED; acceptance unmet.** [Report](../phase15-engineering-report.md), [external matrix](../external-gate-assessment.md), [security](security-validation.md). No authenticated operator services or review authority were supplied. No RPC probe, current-market diagnostic, authorized epoch, timed research run or paper trade was attempted. No credentials were retained.

All original TypeScript tests and the lockfile/pins are preserved. `source-at-start-sha256.json` identifies the pre-change source. `prior-artifact-sha256.json` seals all pre-existing documentation and README; the three intentionally updated current entry documents have byte-exact originals under `prior-root-docs`. Two earlier mutable database summaries were overwritten by the legacy harness and their original bytes could not be recovered. This is an explicit preservation FAIL. Every other earlier artifact is checked unchanged. All runtime source remains byte-identical to the baseline (`runtime-source-preserved.json`). `source-changes.patch` and `source-changes-final.patch` retain attempted intermediate restrictions only; neither describes the final implementation. `source-before` preserves the three original modules. The original-byte backups for the two overwritten summaries were not found; `legacy-overwrite-evidence` retains the refreshed summaries and the original hashes remain in the start manifest. The final changes consist of the new Phase15 diagnostic/validation scripts, two regression tests and delivery documents.

`external-gate.json` is the initial presence-only assessment before source edits. `offline-audit` and `release-offline-audit` are intermediate audits with version labels superseded by `final-offline-audit`. The final distinction is SDK inspector max 0, native parsed readers max 1, historical parsed creation versions legacy/0/1, complete application v1 proof false. `sdk-inspection.json` identifies actual lock/installed version 1.99.0 and SDK hashes. Original Phase14 -32015 evidence was not rerequested or modified.

The first clean run and subsequent `final-clean`/`release-validation` directories retain intermediate failed attempts, including incompatible blanket restrictions, API startup timeouts under overlapping validation and the legacy shared-summary writes. `isolated-final` is the final sequential validation with original runtime source and isolated writable database summaries. No original tests or fixtures were modified to make them pass. The old validator is not used by the final reproduction command.

Use Node22 (actual validation: v22.22.0), npm, Docker and PostgreSQL16 binaries. The corrected isolated clean validator defaults to the locally installed Node22 executable path; it isolates legacy database-summary writes and symlinks other retained fixture files for reads. Use new output directories/names and a fresh image tag to preserve captures:

```sh
python3 scripts/phase15-diagnostics.py --output docs/phase15/repeat-offline
python3 scripts/phase15-validation.py --output-root docs/phase15/repeat-clean
node --import tsx --test tests/phase15-version-boundary.test.ts tests/phase13-verification-scheduling.test.ts tests/phase14-venue-delivery.test.ts tests/phase8-providers.test.ts
# Full clean suite includes PostgreSQL16 immediate crash/restart and reconciliation tests.
docker build -t mintbot:phase15-repeat-readonly .
python3 scripts/phase9-image-smoke.py --image mintbot:phase15-repeat-readonly --output docs/phase15/repeat-container-smoke.json
python3 scripts/phase15-final-validation.py
```

The Docker smoke runs without external network, read-only, with capability restrictions and private tmpfs state; it checks API authentication, dashboard/research projection and live-mode startup rejection. It is not an operator runtime certification. The final manifest is a hash seal, not an independent approval/signature or physically write-once storage guarantee. No Git metadata exists in this workspace; no commit or PR is claimed.
