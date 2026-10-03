import 'dotenv/config';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { database,migrate } from './connection';
import { Domain } from './domain';
import { seed } from './seed';
import { AppError } from '../core';
import { equalSecret,demoMode,safetyConfig } from '../core/security';
safetyConfig();
if(!process.env.INTERNAL_API_SECRET || process.env.INTERNAL_API_SECRET.length<32) throw new Error('Use pnpm dev or configure INTERNAL_API_SECRET');
if(!demoMode()&&!process.env.DATABASE_URL) throw new Error('Production requires configured Supabase/Postgres');
const db=await database();await migrate(db);if(demoMode()) await seed(db);
if(!demoMode() && (!process.env.OPENROUTER_API_KEY || (await db.query("SELECT 1 FROM system_settings WHERE key='demo_seed_v1'")).rows.length)) throw new Error('Non-demo mode requires a live model provider and an unseeded database');
const domain=new Domain(db);
const server=createServer(async(req,res)=>{
  const requestId=randomUUID();res.setHeader('Content-Type','application/json');res.setHeader('X-Request-Id',requestId);
  if(!equalSecret(req.headers.authorization||'',`Bearer ${process.env.INTERNAL_API_SECRET}`)) {res.writeHead(401);res.end(JSON.stringify({error:{code:'UNAUTHORIZED',message:'Unauthorized'}}));return;}
  try {
    let raw='';for await(const c of req) {raw+=c; if(raw.length>500000) throw new AppError('TOO_LARGE','Request too large',413);}
    const input=JSON.parse(raw);const result=req.url==='/worker'?await domain.worker(input.op,input.body):await domain.dispatch(input.op,input.body,input.session);
    res.end(JSON.stringify(result));
  } catch(error) {
    const safe=error instanceof AppError?error:error instanceof ZodError?new AppError('VALIDATION',error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ').slice(0,400)):new AppError('INTERNAL','The operation could not be completed',500);
    console.error(JSON.stringify({service:'database',requestId,code:safe.code,...(demoMode()?{errorType:error instanceof Error?error.name:'unknown'}:{})}));
    res.writeHead(safe.status);res.end(JSON.stringify({error:{code:safe.code,message:safe.message,requestId}}));
  }
});
server.listen(Number(process.env.DB_PORT||4318),'127.0.0.1',()=>console.log(JSON.stringify({service:'database',status:'ready',mode:demoMode()?'demo':'configured'})));
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>server.close(()=>{void db.close().then(()=>process.exit(0));}));
