/** Explicit isolated persistent PG16 deployment. Never uses DATABASE_URL or an existing unmarked cluster. */
import {mkdir,readFile,writeFile,chmod} from "node:fs/promises";
import {homedir,userInfo} from "node:os";
import {join} from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {Pool} from "pg";
const exec=promisify(execFile),bin="/usr/lib/postgresql/16/bin";
export async function persistentPostgres(root=join(homedir(),".local/state/mintbot-phase7-postgres")){
 const marker=join(root,"MINTBOT_PHASE7_PRIVATE_CLUSTER"), data=join(root,"data"),socket=join(root,"socket");
 const user=userInfo().username;
 let existing=false;try{existing=(await readFile(marker,"utf8"))==="mintbot-read-only-research-v7\n";}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
 if(!existing){
  // Exclusive creation: refusing to adopt another directory protects unrelated local databases.
  await mkdir(root,{mode:0o700});await writeFile(marker,"mintbot-read-only-research-v7\n",{flag:"wx",mode:0o600});
  await mkdir(socket,{mode:0o700});
  await exec(`${bin}/initdb`,["-D",data,"-A","trust","--no-locale","-E","UTF8"]);
 }
 await chmod(root,0o700);
 const ctl=async (...args:string[])=>exec(`${bin}/pg_ctl`,["-D",data,...args]);
 const start=async()=>{try{await ctl("status");}catch{await ctl("-l",join(root,"postgres.log"),"-w","-t","20","-o",`-k ${socket} -h '' -p 5432 -c fsync=on -c synchronous_commit=on -c full_page_writes=on`,"start");}};
 const config={host:socket,port:5432,user,database:"postgres",max:4,connectionTimeoutMillis:3000};
 const connect=()=>{const p=new Pool(config);p.on("error",()=>undefined);return p;};
 await start();let pool=connect();await pool.query("SELECT 1");
 return {root,data,socket,user,reused:existing,get pool(){return pool;},config,
  async stop(){await pool.end();await ctl("-m","immediate","-w","stop");},
  async start(){await start();pool=connect();await pool.query("SELECT 1");},
  async restart(){await pool.end();await ctl("-m","immediate","-w","stop");await start();pool=connect();await pool.query("SELECT 1");},
  async dump(path:string){await exec(`${bin}/pg_dump`,["-h",socket,"-p","5432","-U",user,"-d","postgres","-Fc","-f",path]);await chmod(path,0o600);},
  async restore(dump:string,database:string){if(!/^mintbot_restore_[a-z0-9_]+$/.test(database))throw Error("Restore database name bound");await pool.query(`CREATE DATABASE ${database}`);await exec(`${bin}/pg_restore`,["-h",socket,"-p","5432","-U",user,"-d",database,"--exit-on-error",dump]);return new Pool({...config,database});},
  async close(){await pool.end();await ctl("-m","fast","-w","stop");} // Data intentionally retained across invocations.
 };
}
