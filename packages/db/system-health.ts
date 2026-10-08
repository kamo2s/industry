import {appEnvironment,providerCap,publicAppUrl} from '../core/environment';
import {providerBudget} from './provider-budget';
import {one,type Queryable} from './connection';
import {validOperationalAddress,publicPumpConfig} from '../pump/config';
export function readinessConfiguration(){
 const env=appEnvironment();
 return [
  {name:'ENVIRONMENT',status:process.env.APP_ENV&&process.env.PUBLIC_APP_URL?'READY':'MISSING',detail:env},
  {name:'WEB',status:process.env.PUBLIC_APP_URL?'READY':env==='local'?'OPTIONAL':'MISSING',detail:'URL configuration only; HTTPS and response must pass hosted acceptance'},
  {name:'DATABASE',status:process.env.DATABASE_URL?'READY':env==='local'?'OPTIONAL':'MISSING',detail:process.env.DATABASE_URL?'PostgreSQL configured':'Local PGlite only'},
  {name:'OPENROUTER',status:process.env.OPENROUTER_API_KEY?'READY':'MISSING',detail:'Configuration only; live structured-output acceptance requires a valid funded key'},
  {name:'SEARCH',status:process.env.OPENROUTER_API_KEY&&process.env.SEARCH_PROVIDER!=='brave'||process.env.SEARCH_PROVIDER_API_KEY?'READY':'MISSING',detail:process.env.SEARCH_PROVIDER==='brave'?'brave':'openrouter'},
  {name:'STORAGE',status:process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY?'READY':env==='local'?'OPTIONAL':'MISSING',detail:'Private bucket must pass storage acceptance'},
  {name:'WORKER',status:process.env.WORKER_API_SECRET?'READY':env==='local'?'OPTIONAL':'MISSING',detail:env==='local'?'Local supervisor supplies its runtime credential; use --probe for heartbeat':'Persistent service credential; heartbeat checked separately'},
  {name:'SCHEDULER',status:process.env.WORKER_API_SECRET?'READY':env==='local'?'OPTIONAL':'MISSING',detail:'Durable dispatcher alongside worker; hosted heartbeat still requires acceptance'},
  {name:'PUMP',status:process.env.PUMP_LAUNCH_ENABLED==='true'||process.env.PUMP_FEE_COLLECTION_ENABLED==='true'?'BLOCKED':'DISABLED',detail:'Enabling flags alone is not verified production readiness'},
  {name:'TREASURY',status:validOperationalAddress(process.env.INDUSTRY_FEE_TREASURY)?'READY':'BLOCKED',detail:validOperationalAddress(process.env.INDUSTRY_FEE_TREASURY)?'Public address configured':'NOT CONFIGURED'},
  {name:'COLLECTOR',status:validOperationalAddress(process.env.INDUSTRY_FEE_COLLECTOR)?'READY':'BLOCKED',detail:validOperationalAddress(process.env.INDUSTRY_FEE_COLLECTOR)?'Public address configured':'NOT CONFIGURED'},
  {name:'METADATA',status:process.env.PUMP_METADATA_BASE_URL?.startsWith('https://')?'READY':'MISSING',detail:'Stable HTTPS required before future token launch'},
  {name:'ALT',status:process.env.PUMP_LOOKUP_TABLES?.split(',').some(v=>validOperationalAddress(v.trim()))?'BLOCKED':'MISSING',detail:'Read-only on-chain contents and authority preflight required before Pump acceptance'},
  {name:'RECEIPT PRICING',status:'READY',detail:'Coinbase public SOL/USD minute-close pricing configured; each receipt requires validated historical evidence'},
  {name:'ADMIN',status:process.env.ADMIN_WALLETS?.split(',').some(v=>validOperationalAddress(v.trim()))?'READY':'MISSING',detail:'Wallet allowlist'},
  {name:'RATE LIMITS',status:env==='local'||process.env.TRUST_PROXY_IP_HEADER?'READY':'MISSING',detail:env==='local'?'Shared local bucket':'Requires trusted overwritten proxy IP header'},
  {name:'BACKUPS',status:process.env.BACKUP_RESTORE_VERIFIED_AT?'READY':'MISSING',detail:process.env.BACKUP_RESTORE_VERIFIED_AT||'Restore drill required'},
  {name:'PROVIDER CAP',status:'READY',detail:`${providerCap()/1e6} USD per UTC day`},
  {name:'CI',status:process.env.CI==='true'?'READY':'BLOCKED',detail:process.env.CI==='true'?'Running in CI; check job result':'Private repository push and remote workflow evidence required'},
 ];
}
export async function systemHealth(tx:Queryable){
 const worker=await one(tx,'SELECT max(heartbeat_at) last FROM worker_health');
 const processes=(await tx.query('SELECT id,kind,state,heartbeat_at FROM process_health')).rows;
 const queue=(await one(tx,"SELECT count(*) FILTER(WHERE status='queued') queued,count(*) FILTER(WHERE status='running') running,count(*) FILTER(WHERE status='failed') failed,count(*) FILTER(WHERE dead_lettered_at IS NOT NULL) dead FROM jobs"))!;
 const budget=await providerBudget(tx),alerts:string[]=[];
 const fresh=(v:unknown)=>!!v&&Date.now()-new Date(String(v)).getTime()<30000;
 if(!fresh(worker?.last))alerts.push('WORKER_STALE');
 if(!fresh(processes.find(p=>p.kind==='scheduler')?.heartbeat_at))alerts.push('SCHEDULER_STALE');
 if(Number(queue.queued)>100)alerts.push('QUEUE_HIGH');if(Number(queue.dead)>0)alerts.push('DEAD_LETTERS');
 if(budget.committedMicro>=budget.capMicro)alerts.push('PROVIDER_CAP_REACHED');if(budget.paused)alerts.push('PROVIDERS_PAUSED');
 const invariant=await one(tx,"SELECT count(*) n FROM ledger_accounts a WHERE a.balance<>(SELECT COALESCE(sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END),0) FROM ledger_postings p WHERE p.account_id=a.id)");
 if(Number(invariant?.n))alerts.push('LEDGER_INVARIANT');
 const retention=processes.find(p=>p.kind==='capture-retention');
 if(retention?.state==='error')alerts.push('CAPTURE_STORAGE_UNAVAILABLE');
 if(await one(tx,"SELECT id FROM operation_events WHERE event_type='CAPTURE_FAILED' AND created_at>now()-interval '1 hour' LIMIT 1"))alerts.push('CAPTURE_STORAGE_FAILURE');
 if(await one(tx,"SELECT id FROM businesses WHERE routing_status='FAILED' LIMIT 1"))alerts.push('PUMP_ROUTING_FAILURE');
 const collector=processes.find(p=>p.kind==='collector');
 if(collector?.state==='error'||process.env.PUMP_FEE_COLLECTION_ENABLED==='true'&&(!collector||Date.now()-new Date(collector.heartbeat_at).getTime()>120000))alerts.push('PUMP_COLLECTOR_FAILURE');
 const costs=(await one(tx,`SELECT COALESCE(sum(cost_amount) FILTER(WHERE kind='model'),0) model,
 COALESCE(sum(cost_amount) FILTER(WHERE model_or_tool LIKE '%web_search%'),0) search FROM model_tool_runs WHERE started_at>=date_trunc('day',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`))!;
 const topBusinesses=(await tx.query("SELECT a.name,sum(r.charged_micro) cost FROM provider_budget_reservations r JOIN agents a ON a.business_id=r.business_id WHERE budget_day=(now() AT TIME ZONE 'UTC')::date GROUP BY a.name ORDER BY cost DESC LIMIT 10")).rows;
 const topJobs=(await tx.query("SELECT job_id,sum(charged_micro) cost FROM provider_budget_reservations WHERE budget_day=(now() AT TIME ZONE 'UTC')::date GROUP BY job_id ORDER BY cost DESC LIMIT 10")).rows;
 const pump=publicPumpConfig();
 const pumpReadiness=[
  {name:'Treasury',status:pump.treasuryConfigured?'READY':'BLOCKED',detail:pump.treasuryConfigured?'Public address configured':'NOT CONFIGURED'},
  {name:'Collector',status:pump.collectorConfigured?'READY':'BLOCKED',detail:pump.collectorConfigured?'Public address configured':'NOT CONFIGURED'},
  {name:'Collector funding',status:'BLOCKED',detail:'Read-only on-chain balance preflight required'},
  {name:'RPC / programs',status:process.env.PUMP_RPC_URL?'BLOCKED':'MISSING',detail:'Verify genesis and executable program accounts with pump-preflight'},
  {name:'Metadata',status:process.env.PUMP_METADATA_BASE_URL?.startsWith('https://')?'READY':'MISSING',detail:'HTTPS origin configuration; fetch must pass preflight'},
  {name:'Address lookup table',status:'BLOCKED',detail:'Configured chain table must pass pump:lookup check'},
  {name:'Coinbase receipt pricing',status:'READY',detail:'Public historical SOL/USD candles; missing or invalid receipt evidence stays PENDING_CONVERSION'},
  {name:'Fee allocation policy',status:'READY',detail:'Approved V1 policy validated on application; no economic changes'},
  {name:'Launch',status:pump.enabled?'BLOCKED':'DISABLED',detail:pump.enabled?'Flag enabled; separate prerequisites apply':'No broadcast'},
  {name:'Collection',status:pump.collectionEnabled?'BLOCKED':'DISABLED',detail:pump.collectionEnabled?'Flag enabled; separate prerequisites apply':'No broadcast'},
  {name:'Mainnet approval',status:'BLOCKED',detail:'Separate operator acceptance required; no approval granted by this run'},
 ];
 return {environment:appEnvironment(),publicUrl:publicAppUrl(),at:new Date().toISOString(),database:'READY',web:'RESPONDING',realtime:'SSE · 3-second authorized refresh; no direct Supabase subscription',worker:worker?.last,processes,queue,budget,costs,topBusinesses,topJobs,alerts,readiness:readinessConfiguration(),pump,pumpReadiness,ledgerInvariantErrors:Number(invariant?.n)};
}
