import {ensure} from '../core';
import {appEnvironment,providerCap} from '../core/environment';
import {one,type Queryable,type Row} from './connection';
export async function providerPaused(tx:Queryable){return process.env.PROVIDER_EXECUTION_PAUSED==='true'||process.env.EMERGENCY_PAUSE==='true'||(await one(tx,"SELECT value FROM system_settings WHERE key='disable_providers'"))?.value===true;}
export async function reserveProviderRun(tx:Queryable,job:Row,agent:Row,runId:string,maximum:number){
  if(agent.config.brain==='development/mock')return true;
  if(await providerPaused(tx))return false;
  // One database lock covers all workers, businesses and paid provider types.
  await tx.query("INSERT INTO system_settings(key,value) VALUES('provider_budget_lock','{}') ON CONFLICT DO NOTHING");
  await tx.query("SELECT key FROM system_settings WHERE key='provider_budget_lock' FOR UPDATE");
  const used=await providerBudget(tx);
  if(used.committedMicro+maximum>used.capMicro)return false;
  await tx.query('INSERT INTO provider_budget_reservations(run_id,job_id,business_id,environment,reserved_micro) VALUES($1,$2,$3,$4,$5)',[runId,job.id,agent.business_id,appEnvironment(),maximum]);return true;
}
export async function requireProviderRun(tx:Queryable,job:Row,agent:Row){
  if(agent.config.brain==='development/mock')return;
  ensure(!await providerPaused(tx),'PROVIDER_PAUSED','Paid provider execution is paused',503);
  const r=await one(tx,"SELECT * FROM provider_budget_reservations WHERE run_id=$1 AND state='reserved'",[job.run_id]);
  ensure(r,'PROVIDER_RESERVATION_REQUIRED','This run has no global provider budget reservation',503);
  // A run crossing UTC midnight also holds its unspent reservation against today.
  const budget=await providerBudget(tx);ensure(budget.committedMicro<=budget.capMicro,'PROVIDER_DAILY_CAP','Global provider daily cap reached',503);
}
export async function settleProviderRun(tx:Queryable,job:Row){
  if(!job.run_id)return;
  await tx.query("UPDATE provider_budget_reservations SET charged_micro=$1,state='settled',settled_at=now(),budget_day=(now() AT TIME ZONE 'UTC')::date WHERE run_id=$2 AND state='reserved'",[Number(job.payload.measuredCost||0),job.run_id]);
}
export async function providerBudget(tx:Queryable){
  const row=(await one(tx,`SELECT COALESCE(sum(CASE WHEN state='reserved' THEN reserved_micro ELSE charged_micro END),0) committed,
    COALESCE(sum(charged_micro) FILTER(WHERE state='settled'),0) charged,
    COALESCE(sum(reserved_micro) FILTER(WHERE state='reserved'),0) reserved
    FROM provider_budget_reservations WHERE environment=$1 AND (budget_day=(now() AT TIME ZONE 'UTC')::date OR state='reserved')`,[appEnvironment()]))!;
  return {capMicro:providerCap(),committedMicro:Number(row.committed),chargedMicro:Number(row.charged),reservedMicro:Number(row.reserved),paused:await providerPaused(tx)};
}
