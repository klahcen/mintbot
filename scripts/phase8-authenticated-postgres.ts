/** Isolated retained PostgreSQL16: peer administration, SCRAM owner/runtime, no TCP. Never DATABASE_URL. */
import {mkdir,readFile,writeFile,chmod,rename} from "node:fs/promises";
import {homedir,userInfo} from "node:os";import {join} from "node:path";import {randomBytes} from "node:crypto";
import {execFile} from "node:child_process";import {promisify} from "node:util";import {Pool} from "pg";
const exec=promisify(execFile),bin="/usr/lib/postgresql/16/bin",database="mintbot_research8",owner="mintbot_migration8",runtime="mintbot_runtime8";
export async function authenticatedPostgres(root=join(homedir(),".local/state/mintbot-phase8-postgres")) {
 const marker=join(root,"MINTBOT_PHASE8_PRIVATE_CLUSTER"),data=join(root,"data"),socket=join(root,"socket"),secretPath=join(root,"credentials.json"),admin=userInfo().username;
 let reused=false;try{reused=(await readFile(marker,"utf8"))==="mintbot-authenticated-research-v8\n";}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e;}
 if(!reused){
  await mkdir(root,{mode:0o700});await writeFile(marker,"mintbot-authenticated-research-v8\n",{flag:"wx",mode:0o600});await mkdir(socket,{mode:0o700});
  await exec(`${bin}/initdb`,["-D",data,"-A","peer","--no-locale","-E","UTF8"]);
  await writeFile(join(data,"pg_hba.conf"),`local all ${admin} peer\nlocal all all scram-sha-256\n`,{mode:0o600});
 }
 await chmod(root,0o700);
 const ctl=(...args:string[])=>exec(`${bin}/pg_ctl`,["-D",data,...args]);
 const start=async()=>{try{await ctl("status");}catch{await ctl("-l",join(root,"postgres.log"),"-w","-t","20","-o",`-k ${socket} -h '' -p 5432 -c fsync=on -c synchronous_commit=on -c full_page_writes=on -c password_encryption=scram-sha-256 -c max_connections=20`,"start");}};
 const base={host:socket,port:5432,connectionTimeoutMillis:2000,idleTimeoutMillis:5000,statement_timeout:5000,lock_timeout:2000};
 const pool=(config:object)=>{const p=new Pool({...base,...config});p.on("error",()=>undefined);return p;};
 await start();let adminPool=pool({user:admin,database:"postgres",max:1});
 let secrets:{owner:string;runtime:string};
 if(!reused){
  secrets={owner:randomBytes(32).toString("hex"),runtime:randomBytes(32).toString("hex")};
  await adminPool.query(`CREATE ROLE ${owner} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${secrets.owner}'`);
  await adminPool.query(`CREATE ROLE ${runtime} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD '${secrets.runtime}'`);
  await adminPool.query(`CREATE DATABASE ${database} OWNER ${owner}`);
  await adminPool.query(`REVOKE ALL ON DATABASE ${database} FROM PUBLIC`);
  await adminPool.query(`GRANT CONNECT ON DATABASE ${database} TO ${runtime}`);
  await writeFile(secretPath,JSON.stringify(secrets),{flag:"wx",mode:0o600});
 } else {secrets=JSON.parse(await readFile(secretPath,"utf8"));}
 let ownerPool=pool({user:owner,password:secrets.owner,database,max:1}),runtimePool=pool({user:runtime,password:secrets.runtime,database,max:2});
 await ownerPool.query("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
 return {root,data,socket,reused,database,owner,runtime,get ownerPool(){return ownerPool;},get runtimePool(){return runtimePool;},get adminPool(){return adminPool;},
  async grantRuntime(){await ownerPool.query(`GRANT USAGE ON SCHEMA public TO ${runtime}`);await ownerPool.query(`GRANT SELECT,INSERT,UPDATE ON simulation_intent,simulation_budget TO ${runtime}`);await ownerPool.query(`GRANT SELECT ON simulation_intent_audit TO ${runtime}`);},
  async health(){const t=performance.now();const r=await runtimePool.query("SELECT current_user,current_setting('fsync') AS fsync,current_setting('synchronous_commit') AS synchronous_commit,current_setting('full_page_writes') AS full_page_writes,current_setting('listen_addresses') AS listen_addresses,pg_database_size(current_database())::text AS database_bytes");return {...r.rows[0],roundTripMs:performance.now()-t,pools:{migrationMax:1,runtimeMax:2,administrationMax:1},authentication:"local SCRAM-SHA-256 runtime and migration owner; local peer administrator"};},
  runtimeConfig(password=secrets.runtime){return {...base,user:runtime,password,database,max:2};},
  async rotateRuntime(){
   await runtimePool.end();const next=randomBytes(32).toString("hex");await adminPool.query(`ALTER ROLE ${runtime} PASSWORD '${next}'`);
   secrets.runtime=next;await writeFile(`${secretPath}.next`,JSON.stringify(secrets),{mode:0o600});await rename(`${secretPath}.next`,secretPath);
   runtimePool=pool({user:runtime,password:next,database,max:2});await runtimePool.query("SELECT 1");
  },
  async restart(){await Promise.all([ownerPool.end(),runtimePool.end(),adminPool.end()]);await ctl("-m","immediate","-w","stop");await start();adminPool=pool({user:admin,database:"postgres",max:1});ownerPool=pool({user:owner,password:secrets.owner,database,max:1});runtimePool=pool({user:runtime,password:secrets.runtime,database,max:2});await runtimePool.query("SELECT 1");},
  async backup(path:string){await exec(`${bin}/pg_dump`,["-h",socket,"-p","5432","-U",admin,"-d",database,"-Fc","-f",path]);await chmod(path,0o600);},
  async restore(path:string,name:string){if(!/^mintbot8_restore_[a-z0-9_]+$/.test(name))throw Error("Restore database bound");await adminPool.query(`CREATE DATABASE ${name}`);await exec(`${bin}/pg_restore`,["-h",socket,"-p","5432","-U",admin,"-d",name,"--exit-on-error",path]);return pool({user:admin,database:name,max:1});},
  async close(){await Promise.all([ownerPool.end(),runtimePool.end(),adminPool.end()]);await ctl("-m","fast","-w","stop");},
 };
}
