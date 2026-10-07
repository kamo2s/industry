import 'dotenv/config';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import {appEnvironment} from '../packages/core/environment';
import { safetyConfig } from '../packages/core/security';
safetyConfig();if(appEnvironment()!=='local')throw new Error('Use separately managed hosted services; pnpm start/dev is local-only');
await mkdir('.data',{recursive:true});
let secrets:Record<string,string>;
try {secrets=JSON.parse(await readFile('.data/local-secrets.json','utf8'));}
catch {secrets=Object.fromEntries(['SESSION_SECRET','INTERNAL_API_SECRET','WALLET_ENCRYPTION_KEY'].map(k=>[k,randomBytes(32).toString('hex')]));await writeFile('.data/local-secrets.json',JSON.stringify(secrets),{mode:0o600});}
const env:NodeJS.ProcessEnv={...process.env,OPENAI_API_KEY:'',...Object.fromEntries(Object.entries(secrets).map(([k,v])=>[k,process.env[k]||v])),APP_ENV:'local',APP_MODE:process.env.APP_MODE||'demo',WORKER_HEALTH_PORT:process.env.WORKER_HEALTH_PORT||'4319',NEXT_PUBLIC_SITE_URL:process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000',NEXT_TELEMETRY_DISABLED:'1',INDUSTRY_ROOT:process.cwd()};
for(const key of ['WORKER_API_SECRET','PUMP_COLLECTOR_API_SECRET'])env[key]||=randomBytes(32).toString('hex');
const children:ChildProcess[]=[];let stopping=false;
function launch(args:string[],childEnv=env) {const p=spawn(process.execPath,args,{cwd:process.cwd(),env:childEnv,stdio:'inherit',windowsHide:true});children.push(p);p.on('exit',code=>{if(!stopping&&code){console.error('A project service stopped; shutting down.');stop(code);}});return p;}
function stop(code=0) {
  if(stopping)return;stopping=true;
  const drain=(p:ChildProcess,ms:number)=>new Promise<void>(resolve=>{
    if(p.exitCode!==null||p.signalCode!==null){resolve();return;}
    const timeout=setTimeout(()=>{p.kill('SIGKILL');resolve();},ms);
    p.once('exit',()=>{clearTimeout(timeout);resolve();});p.kill('SIGTERM');
  });
  // Keep ledger/persistence available until callers have stopped. Windows
  // process termination is abrupt; abandoned jobs still recover by lease.
  void (async()=>{await Promise.all(children.slice(1).map((p,i)=>drain(p,i===1?320000:150000)));if(children[0])await drain(children[0],30000);process.exit(code);})();
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
launch(['--import','tsx','packages/db/server.ts']);
let ready=false;
for(let i=0;i<60;i++) {try {const r=await fetch(`http://127.0.0.1:${env.DB_PORT||4318}/rpc`,{method:'POST',headers:{'Authorization':`Bearer ${env.INTERNAL_API_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify({op:'health'})});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
if(!ready) {console.error('Database startup failed.');stop(1);} else {
  const restricted={...env,PUMP_COLLECTOR_KEYPAIR_FILE:'',PUMP_COLLECTOR_KEYPAIR_JSON:'',PUMP_COLLECTOR_API_SECRET:'',PYTH_API_KEY:'',WALLET_ENCRYPTION_KEY:'',INTERNAL_API_SECRET:'',DATABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SESSION_SECRET:''};
  launch(['--import','tsx','apps/worker/index.ts'],restricted);
  launch(['--import','tsx','apps/collector/index.ts'],{NODE_ENV:env.NODE_ENV,PATH:env.PATH,SystemRoot:env.SystemRoot,APP_MODE:env.APP_MODE,INTERNAL_API_URL:env.INTERNAL_API_URL,DB_PORT:env.DB_PORT,PUMP_COLLECTOR_API_SECRET:env.PUMP_COLLECTOR_API_SECRET});
  launch([path.resolve('node_modules/next/dist/bin/next'),process.argv.includes('--production')?'start':'dev','apps/web','--hostname','127.0.0.1','--port',env.PORT||'3000'],{...env,OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',SEARCH_PROVIDER_API_KEY:'',BROWSERBASE_API_KEY:'',PUMP_COLLECTOR_KEYPAIR_FILE:'',PUMP_COLLECTOR_KEYPAIR_JSON:'',PUMP_COLLECTOR_API_SECRET:'',PYTH_API_KEY:'',DATABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',WORKER_API_SECRET:'',WALLET_ENCRYPTION_KEY:''});
}
