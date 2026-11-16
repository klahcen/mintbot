import test from "node:test";
import assert from "node:assert/strict";
import {ResearchFeedHealth} from "../src/research/feed-health.js";
test("Read-only feed health distinguishes receipts and freshness; exhausted reconnects cannot resume paper admission",()=>{
 const h=new ResearchFeedHealth();assert.equal(h.snapshot(0).allowNewPaperWork,false);h.ready();assert.equal(h.snapshot(1).status,"unknown");
 h.receipt(10);assert.equal(h.snapshot(20).allowNewPaperWork,true);assert.equal(h.snapshot(30011).allowNewPaperWork,false);
 h.disconnected();assert.equal(h.snapshot(21).status,"unavailable");h.ready();assert.equal(h.snapshot(22).allowNewPaperWork,true);
 h.fail(Error("WebSocket reconnect budget exhausted; backfill required"));assert.equal(h.snapshot(23).status,"failed");h.ready();h.receipt(24);assert.equal(h.snapshot(25).allowNewPaperWork,false);assert.equal(h.snapshot(25).exhausted,true);
});
