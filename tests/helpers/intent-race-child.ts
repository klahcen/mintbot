import {Pool}from"pg";import {IntentLedger,type IntentKey}from"../../src/simulation/intent-ledger.js";
const [socket,user,mode,identity]=process.argv.slice(2),pool=new Pool({host:socket,user,database:"postgres",port:5432,max:1}),ledger=new IntentLedger(pool);
try{
 if(mode==="reserve"){
  const key:IntentKey={opportunity:identity,strategy:"persistent-v7",side:"buy",generation:"1",wallet:"persistent-wallet"};
  console.log(JSON.stringify({ok:true,intent:await ledger.reserve(key,[{asset:"SOL",atoms:"100"}],{source:"persistent-race"})}));
 }else console.log(JSON.stringify({ok:true,intent:await ledger.claim(identity,`child-${process.pid}`,200)}));
}catch(error){console.log(JSON.stringify({ok:false,error:String(error)}));}finally{await pool.end();}
