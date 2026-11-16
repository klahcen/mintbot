import {mkdir,writeFile} from "node:fs/promises";
import {authenticatedPostgres} from "./phase8-authenticated-postgres.js";
if(!process.argv.includes("--run"))throw Error("Explicit --run required for retained research DB read-only snapshot");
const pg=await authenticatedPostgres();
try {
 const records=(await pg.runtimePool.query("SELECT id,status,updated_at FROM simulation_intent ORDER BY updated_at DESC,id LIMIT 20")).rows;
 const result={observedAt:new Date().toISOString(),origin:"Phase 8 research fault tests; not live candidate intents",cluster:pg.root,role:pg.runtime,records,limit:20,liveAuthorized:false,submitted:false};
 await mkdir("docs/phase8",{recursive:true});await writeFile("docs/phase8/database-intents-snapshot.json",JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await pg.close();}
