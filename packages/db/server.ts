import {monitorStatus} from './monitor';
import {refreshMarkets} from '../market/refresh';
import {validateEnvironment,appEnvironment} from '../core/environment';
import 'dotenv/config';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { database,migrate } from './connection';
import { Domain } from './domain';
import { seed } from './seed';
import { AppError } from '../core';
import { equalSecret,demoMode,safetyConfig } from '../core/security';
import {pruneBrowserCaptures} from './captures';
import {sweepCaptureObjects} from '../agent/capture-storage';
import {modelCatalog} from '../agent/catalog';
import {logJobOutcome} from './outcome-log';
import {prepareCollectorKey} from '../pump/key-file';
safetyConfig();validateEnvironment('database');
await prepareCollectorKey();
if(!process.env.INTERNAL_API_SECRET || process.env.INTERNAL_API_SECRET.length<32) throw new Error('Use pnpm dev or configure INTERNAL_API_SECRET');
if(!demoMode()&&(!process.env.WORKER_API_SECRET||process.env.WORKER_API_SECRET.length<32))throw new Error('Configure a separate WORKER_API_SECRET');
if(!demoMode()&&!process.env.DATABASE_URL) throw new Error('Production requires configured Supabase/Postgres');
const db=await database();await migrate(db);if(demoMode()) await seed(db);
if(!demoMode() && (await db.query("SELECT 1 FROM system_settings WHERE key='demo_seed_v1'")).rows.length) throw new Error('Hosted mode requires a database without the local demo seed');
const domain=new Domain(db);
let refreshingMarkets=false;async function marketTick(){if(refreshingMarkets)return;refreshingMarkets=true;try{await refreshMarkets(db);}catch{console.error(JSON.stringify({service:'market-data',status:'retry-next-cycle'}));}finally{refreshingMarkets=false;}}
if(!demoMode()&&process.env.MARKET_DATA_ENABLED!=='false'){void marketTick();const timer=setInterval(()=>void marketTick(),30000);timer.unref();}
// Warm the same fail-soft, five-minute catalog used for launch and execution.
void modelCatalog().catch(()=>{});
let pruning=false;const cleanup=async()=>{if(pruning)return;pruning=true;let state='ready';try{await db.transaction(tx=>pruneBrowserCaptures(tx));await sweepCaptureObjects();}catch{state='error';console.error(JSON.stringify({service:'capture-retention',status:'retry-next-cycle'}));}finally{await db.query("INSERT INTO process_health(id,kind,state) VALUES('capture-retention','capture-retention',$1) ON CONFLICT(id) DO UPDATE SET heartbeat_at=now(),state=excluded.state",[state]).catch(()=>{});pruning=false;}};void cleanup();const captureRetention=setInterval(()=>void cleanup(),10*60000);captureRetention.unref();
if(process.env.PUMP_COLLECTOR_API_SECRET&&(process.env.PUMP_COLLECTOR_API_SECRET.length<32||[process.env.INTERNAL_API_SECRET,process.env.WORKER_API_SECRET].includes(process.env.PUMP_COLLECTOR_API_SECRET)))throw new Error('Pump collector requires a distinct credential of at least 32 characters');
const server=createServer(async(req,res)=>{
  const requestId=randomUUID();res.setHeader('Content-Type','application/json');res.setHeader('X-Request-Id',requestId);
  if(req.url==='/monitor'){
    res.setHeader('Cache-Control','no-store');
    const key=process.env.MONITOR_API_SECRET;
    if(req.method!=='GET'||!key||key.length<32||!equalSecret(req.headers.authorization||'',`Bearer ${key}`)){res.writeHead(401);res.end('{}');return;}
    try{res.end(JSON.stringify(await monitorStatus(db)));}catch{res.writeHead(503);res.end(JSON.stringify({healthy:false,alerts:['DATABASE_UNAVAILABLE']}));}return;
  }
  if(!['/rpc','/worker','/collector'].includes(req.url||'')){res.writeHead(404);res.end('{}');return;}
  const secret=req.url==='/collector'?process.env.PUMP_COLLECTOR_API_SECRET:req.url==='/worker'?process.env.WORKER_API_SECRET||process.env.INTERNAL_API_SECRET:process.env.INTERNAL_API_SECRET;
  if(!secret||!equalSecret(req.headers.authorization||'',`Bearer ${secret}`)) {res.writeHead(401);res.end(JSON.stringify({error:{code:'UNAUTHORIZED',message:'Unauthorized'}}));return;}
  try {
    let raw='';for await(const c of req) {raw+=c; if(raw.length>500000) throw new AppError('TOO_LARGE','Request too large',413);}
    const input=JSON.parse(raw);if(req.url==='/collector'&&input.op!=='tick')throw new AppError('FORBIDDEN','Collector accepts only a bounded tick',403);if(req.url==='/collector')await db.query("INSERT INTO process_health(id,kind,state) VALUES('collector','collector',$1) ON CONFLICT(id) DO UPDATE SET heartbeat_at=now(),state=excluded.state",[process.env.PUMP_FEE_COLLECTION_ENABLED==='true'?'enabled':'disabled']);const result=req.url==='/collector'?await domain.collector.tick():req.url==='/worker'?await domain.worker(input.op,input.body):await domain.publicDispatch(input.op,input.body,input.session);
    if(req.url==='/worker'&&['complete','fail'].includes(input.op))await logJobOutcome(db,input.body.id).catch(()=>{});
    res.end(JSON.stringify(result));
  } catch(error) {
    const safe=error instanceof AppError?error:error instanceof ZodError?new AppError('VALIDATION',error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ').slice(0,400)):new AppError('INTERNAL','The operation could not be completed',500);
    console.error(JSON.stringify({service:'database',requestId,code:safe.code,...(demoMode()?{errorType:error instanceof Error?error.name:'unknown'}:{})}));
    res.writeHead(safe.status);res.end(JSON.stringify({error:{code:safe.code,message:safe.message,requestId}}));
  }
});
server.listen(Number(process.env.DB_PORT||4318),process.env.DB_HOST||'127.0.0.1',()=>console.log(JSON.stringify({service:'database',status:'ready',mode:demoMode()?'demo':appEnvironment()})));
for(const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>server.close(()=>{void db.close().then(()=>process.exit(0));}));

