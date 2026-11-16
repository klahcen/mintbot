/** Isolated PostgreSQL 16 test cluster. Private Unix socket only, fsync on; never connects to DATABASE_URL. */
import {mkdtemp,mkdir,rm}from"node:fs/promises";import{tmpdir,userInfo}from"node:os";import{join}from"node:path";import{execFile}from"node:child_process";import{promisify}from"node:util";import{Pool}from"pg";
const exec=promisify(execFile);
export async function localPostgres(){
 const dir=await mkdtemp(join(tmpdir(),"mintbot-intents6-")),data=join(dir,"data"),socket=join(dir,"socket"),bin="/usr/lib/postgresql/16/bin",user=userInfo().username;
 await mkdir(socket,{mode:0o700});await exec(`${bin}/initdb`,["-D",data,"-A","trust","--no-locale","-E","UTF8"],{maxBuffer:1024*1024});
 const start=()=>exec(`${bin}/pg_ctl`,["-D",data,"-l",join(dir,"postgres.log"),"-w","-t","15","-o",`-k ${socket} -h '' -p 5432 -c fsync=on -c synchronous_commit=on -c full_page_writes=on`,"start"]);
 const config={host:socket,port:5432,user,database:"postgres",max:4,connectionTimeoutMillis:3000};
 let pool:Pool;
 const connect=()=>{const p=new Pool(config);p.on("error",()=>undefined);return p;};
 try{await start();pool=connect();await pool.query("SELECT 1");}
 catch(e){await exec(`${bin}/pg_ctl`,["-D",data,"-m","immediate","stop"]).catch(()=>undefined);await rm(dir,{recursive:true,force:true});throw e;}
 return {dir,socket,user,get pool(){return pool;},
  async restart(){await pool.end();await exec(`${bin}/pg_ctl`,["-D",data,"-m","immediate","-w","stop"]);await start();pool=connect();await pool.query("SELECT 1");},
  async close(){await pool.end();await exec(`${bin}/pg_ctl`,["-D",data,"-m","fast","-w","stop"]);await rm(dir,{recursive:true,force:true});}
 };
}
