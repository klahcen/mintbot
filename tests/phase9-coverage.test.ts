import test from "node:test";
import assert from "node:assert/strict";
import { researchCoverage } from "../src/research/coverage.js";
test("Fresh transport cannot authorize paper admission with partial, exhausted or quarantined coverage", () => {
  for (const status of ["pending", "partial", "unrecoverable"])
    assert.equal(researchCoverage({ liveReady: true }, { gaps: [{ status }], quarantined: 0 }).status, "unknown");
  assert.equal(researchCoverage({ liveReady: true }, { gaps: [], quarantined: 1 }).status, "unknown");
  assert.equal(researchCoverage({ liveReady: false }, { gaps: [], quarantined: 0 }).status, "unknown");
  assert.equal(researchCoverage({ liveReady: true }, { gaps: [{ status: "recovered" }], quarantined: 0 }).status, "verified");
});
test("Durability failure remains failed even with fresh receipts and recovered gaps", () => {
  assert.equal(researchCoverage({ liveReady: true }, { gaps: [], quarantined: 0, writerFailure: "fsync failed" }).status, "failed");
  assert.equal(researchCoverage({ liveReady: true }, { gaps: [], quarantined: 0 }, "ingestion failed").status, "failed");
});
