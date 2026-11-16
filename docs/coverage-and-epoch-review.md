# Coverage and epoch review — Phase 14

**Independent epoch approval is EXTERNALLY BLOCKED.** No self-approved bypass was added. The existing proposal remains a proposal requiring an independent reviewer with explicit policy authority. New run IDs, empty pending queues, fresh subscription ACKs and fresh valid delivery do not erase history.

All Phase13 evidence, WAL gaps, quarantines and prior manifests are unchanged ([preservation](phase14/preservation-check.json)). Baseline final gaps remain three unrecoverable and one recovered, with 752 quarantines. Phase14 transport controls do not own a research WAL and recover none of those gaps. Historical classification is retained rather than recomputed from a recent-ten history sample.

Recovery still requires completed underlying bounded work, original valid anchors, explicit interval/predecessor boundaries and durable completion evidence. Failed, clipped, partial or unavailable pages stay incomplete. The new per-venue gate adds a missing-delivery rejection to `researchCoverage`; provider consistency, journal failures, quarantine and identity-refusal coverage checks remain mandatory. Independent infrastructure is needed to verify recovery completeness and authorize a current window under [the operator contract](external-prerequisites.md).
