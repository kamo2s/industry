import 'dotenv/config';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { safetyConfig } from '../packages/core/security';
safetyConfig();
await mkdir('.data',{recursive:true});
let secrets:Record<string,string>;
try {secrets=JSON.parse(await readFile('.data/local-secrets.json','utf8'));}
catch {secrets=Object.fromEntries(['SESSION_SECRET','INTERNAL_API_SECRET','WALLET_ENCRYPTION_KEY'].map(k=>[k,randomBytes(32).toString('hex')]));await writeFile('.data/local-secrets.json',JSON.stringify(secrets),{mode:0o600});}
const env:NodeJS.ProcessEnv={...process.env,...Object.fromEntries(Object.entries(secrets).map(([k,v])=>[k,process.env[k]||v])),APP_MODE:process.env.APP_MODE||'demo',NEXT_PUBLIC_SITE_URL:process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000',NEXT_TELEMETRY_DISABLED:'1',INDUSTRY_ROOT:process.cwd()};
const children:ChildProcess[]=[];let stopping=false;
function launch(args:string[]) {const p=spawn(process.execPath,args,{cwd:process.cwd(),env,stdio:'inherit',windowsHide:true});children.push(p);p.on('exit',code=>{if(!stopping&&code){console.error('A project service stopped; shutting down.');stop(code);}});return p;}
function stop(code=0) {if(stopping)return;stopping=true;for(const p of children)p.kill();setTimeout(()=>process.exit(code),500).unref();}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
launch(['--import','tsx','packages/db/server.ts']);
let ready=false;
for(let i=0;i<60;i++) {try {const r=await fetch(`http://127.0.0.1:${env.DB_PORT||4318}/rpc`,{method:'POST',headers:{'Authorization':`Bearer ${env.INTERNAL_API_SECRET}`,'Content-Type':'application/json'},body:JSON.stringify({op:'health'})});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}
if(!ready) {console.error('Database startup failed.');stop(1);} else {
  launch(['--import','tsx','apps/worker/index.ts']);
  launch([path.resolve('node_modules/next/dist/bin/next'),process.argv.includes('--production')?'start':'dev','apps/web','--hostname','127.0.0.1','--port',env.PORT||'3000']);
}
