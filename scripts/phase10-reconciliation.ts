/** Read-only full-frame bounded WAL reconstruction. Never opens its writer lock. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { EventJournal } from "../src/event-journal.js";
import { DecoderRegistry } from "../src/decoders.js";
import { Telemetry } from "../src/telemetry.js";
const args=process.argv.slice(2),opt=(key:string,fallback:string)=>args.includes(key)?args[args.indexOf(key)+1]!:fallback;
const path=opt("--wal","docs/phase9/mainnet-2026-11-13/ingestion.wal"),output=opt("--output","docs/phase10/phase9-reconciliation.json");
const bytes=await readFile(path);if(bytes.length>64*1024*1024)throw Error("Forensic WAL bound");
const sha=(data:string|Buffer)=>createHash("sha256").update(data).digest("hex");
const lines=bytes.toString().split("\n");const incompleteTail=lines.pop()!;
const journal=new EventJournal(),registry=new DecoderRegistry(),metrics=new Telemetry();let frames=0;
for(const line of lines){if(!line)continue;const frame=JSON.parse(line);if(frame.walVersion!==2||frame.sha256!==sha(JSON.stringify(frame.record)))throw Error("WAL frame integrity mismatch");journal.persistRecord(frame.record);frames++;}
const rows=[...journal.pending.values()].filter(item=>item.quarantined).map(item=>{
 let decode:{status:string;name?:string;message?:string}={status:"no-decoder-failure-reproduced"};
 try{registry.decode(item.observation,metrics);}catch(error){decode={status:"decoder-failure-reproduced",name:(error as Error).name,message:(error as Error).message};}
 return {...item,fingerprint:sha(JSON.stringify([item.observation.slot,item.observation.failed,item.observation.logs])),decode,
  classification:decode.status==="no-decoder-failure-reproduced"?"historical-callback-or-provider-cause-unavailable":/unsupported/i.test(decode.message??"")?"decoder-reported-unsupported-variant":"decoder-content-rejected; original truncation/layout cause unproven",
  truncatedMarker:item.observation.logs.some(l=>/log(?:s)? truncated/i.test(l)),
  originalCallbackFailureRecorded:!!item.lastFailure,
  disposition:"Retain pending ownership; no entry authorization or gap recovery from this diagnosis"};
});
const evidencePath=opt("--evidence","docs/phase9/mainnet-2026-11-13/evidence.json"),manifestPath=opt("--source-manifest","docs/phase9/mainnet-2026-11-13/source-manifest.json");
const old=JSON.parse(await readFile(evidencePath,"utf8"));
const beforeManifest=JSON.parse(await readFile(manifestPath,"utf8"));
const decoderFiles=["src/decoders.ts","src/borsh-reader.ts","src/chain.ts"];
const decoderHashes=Object.fromEntries(await Promise.all(decoderFiles.map(async file=>[file,{atRunSource:beforeManifest.files?.[file],atRunCompiled:beforeManifest.hashes?.[file.replace(/^src\//,"dist/src/").replace(/\.ts$/,".js")],currentSource:sha(await readFile(file))}])));
const counters=old.telemetry.counters;
await writeFile(output,JSON.stringify({generatedAt:new Date().toISOString(),wal:path,runEvidence:evidencePath,sourceManifest:manifestPath,walSha256:sha(bytes),frames,incompleteTailBytes:Buffer.byteLength(incompleteTail),
 status:journal.status(),decoderHashes,quarantined:rows,admission:{total:old.refused,capacityRefusals:counters["research.admission.backpressure"]??0,stableIdentityConflicts:counters["ingest.fork_or_provider_conflicts"]??0,knownDuplicatesNotCountedAsRefusals:counters["ingest.duplicates"]??0,perRefusalOriginalPayloads:old.refusalStorage??"Not captured comprehensively in Phase9; no individual fork/provider/truncation attribution invented"},
 reviewPlan:rows.map(row=>({id:row.id,expectedFingerprint:row.fingerprint,review:{at:Date.now(),reviewer:"phase10-forensic-review",decision:"retain",evidenceSha256:sha(bytes),reason:"Exact decoder replay retained; unsupported or malformed cause remains unverified. Preserve ownership and gap."}})),
 liveTrading:false,scope:"All available checksummed WAL frames replayed into memory. Original WAL is never opened for writing. Decoder reproduction is not proof of the historical callback stage or malicious tokens. Old missing error metadata remains unknown."},null,2)+"\n",{flag:"wx"});
journal.close();console.log(JSON.stringify({frames,quarantined:rows.length,refusals:old.refused,capacity:counters["research.admission.backpressure"],conflicts:counters["ingest.fork_or_provider_conflicts"]}));
