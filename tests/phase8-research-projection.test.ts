import test from "node:test";
import assert from "node:assert/strict";
import { researchLaunches } from "../src/research/projection.js";
import { MarketRpc } from "../src/market/rpc.js";
import { createServer } from "node:http";
test("A completed rejected decision cannot claim verified market state or an eligible position",()=>{
 const row={event:{program:"pump",signature:"public-signature",slot:1},verifiedLaunches:1,decision:{reasons:["Current market state unavailable"]}};
 let [view]=researchLaunches([row],[{id:"pump:public-signature:0",evidence:{launch:{},status:"failed"}}]);
 assert.equal(view.verification,"verified");assert.equal(view.market,"unknown");assert.equal(view.decision,"rejected");assert.equal(view.buySimulation,"unknown");
 [view]=researchLaunches([{...row,decision:{positionId:"paper-position"}}],[{id:"pump:public-signature:0",evidence:{state:{commitment:"finalized",mint:"public-mint",accounts:[],retrievedAt:Date.now()}}}]);assert.equal(view.market,"verified");assert.equal(view.decision,"eligible");
 [view]=researchLaunches([row],[{id:"pump:public-signature:0",evidence:{state:{commitment:"finalized",mint:"m",accounts:[],retrievedAt:1}}}],[],5000);assert.equal(view.market,"stale");
});
test("Market RPC exposes only numeric rate-limit diagnostics without changing sanitized error messages",async()=>{
 const server=createServer((_q,r)=>{r.writeHead(429);r.end("private provider error");});await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
 try{const rpc=new MarketRpc(`http://user:password@127.0.0.1:${(server.address()as any).port}/api-key`);
 // Native fetch refuses URL credentials before HTTP. The error still cannot expose them.
 await assert.rejects(rpc.accounts(["11111111111111111111111111111111"],0),(e:any)=>e.message==="Market read failed or timed out"&&!String(e).includes("password"));
 const clean=new MarketRpc(`http://127.0.0.1:${(server.address()as any).port}/private-api-key`);
 await assert.rejects(clean.accounts(["11111111111111111111111111111111"],0),(e:any)=>e.httpStatus===429&&e.message==="Market read failed or timed out"&&!String(e).includes("api-key"));
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
