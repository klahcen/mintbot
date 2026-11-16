import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { MarketRpc } from "../src/market/rpc.js";
import { decodePump, PUMP_GLOBAL } from "../src/market/pump.js";

test("Real finalized November14 Pump loader upgrade remains rejected by the unchanged reviewed pin", async () => {
  const fixture=JSON.parse(await readFile("docs/phase9/revalidation-2026-11-13/clock-release/pump-loader-mismatch.json","utf8"));
  const pins=JSON.parse(await readFile("src/market/deployment-pins.json","utf8"));
  assert.equal(pins[fixture.program].deploymentSlot,458921440);
  for(const observation of fixture.observations){
    assert.equal(observation.observedDeploymentSlot,"469055660");
    const original=globalThis.fetch;
    globalThis.fetch=(async(_url,options)=>{
      const request=JSON.parse(String(options!.body));
      assert.equal(request.method,"getMultipleAccounts");assert.equal(request.params[1].commitment,"finalized");
      return new Response(JSON.stringify({jsonrpc:"2.0",id:request.id,result:observation.result}));
    }) as typeof fetch;
    try{await assert.rejects(new MarketRpc("https://unit.invalid").deployment(fixture.program,0),/Unsupported upgraded program version/);}
    finally{globalThis.fetch=original;}
  }
});

test("Captured executable integrity does not claim source equivalence or enable a protocol variant", async () => {
  const root="docs/phase10/pump-deployment",capture=JSON.parse(await readFile(`${root}/evidence.json`,"utf8"));
  const successful=capture.observations.find((o:any)=>o.programDataSha256);
  assert(successful,"Bounded executable capture must be retained for this fixture test");
  const sha=(data:Buffer)=>createHash("sha256").update(data).digest("hex");
  assert.equal(sha(await readFile(`${root}/programdata.bin`)),successful.programDataSha256);
  const elf=await readFile(`${root}/elf-referenced-image.bin`);
  assert.equal(sha(elf),successful.elfReferencedSha256);assert.equal(elf.subarray(0,4).toString("hex"),"7f454c46");
  assert.equal(capture.sourceToBinaryEquivalence,"unknown");assert.equal(capture.newVariantEnabled,false);
  assert.equal(capture.liveTrading,false);
});

test("The captured current 1096-byte Global is rejected rather than silently extending the reviewed layout", async () => {
  const capture=JSON.parse(await readFile("docs/phase10/current-pump-global.json","utf8"));
  assert.equal(capture.actualBytes,1096);assert.equal(capture.address,PUMP_GLOBAL);
  assert.equal(capture.batch.commitment,"finalized");
  assert.throws(()=>decodePump(capture.batch,PUMP_GLOBAL,"Global"),/Unsupported Pump global version/);
  assert.equal(capture.newVersionEnabled,false);
});
