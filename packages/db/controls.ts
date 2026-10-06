import { ensure } from '../core';
import { one, type Queryable, type Row } from './connection';

export type Switch = 'agents'|'payments'|'launches';
const env:Record<Switch,string>={agents:'AGENTS_ENABLED',payments:'AUTONOMOUS_PAYMENTS_ENABLED',launches:'TOKEN_LAUNCH_ENABLED'};
export async function enabled(tx:Queryable,kind:Switch) {
  if(process.env.EMERGENCY_PAUSE==='true'||process.env[env[kind]]==='false')return false;
  const setting=await one(tx,'SELECT value FROM system_settings WHERE key=$1',[`disable_${kind}`]);
  return setting?.value!==true;
}
export async function requireEnabled(tx:Queryable,kind:Switch){ensure(await enabled(tx,kind),'DISABLED',`${kind} are paused by an operator`,503);}
export function requireAdmin(profile:Row|undefined) {
  const wallets=(process.env.ADMIN_WALLETS||'').split(',').map(v=>v.trim()).filter(Boolean);
  ensure(profile&&wallets.includes(profile.primary_wallet),'FORBIDDEN','Administrator wallet required',403);
}
export async function audit(tx:Queryable,profile:Row,action:string,agentId:string|null,details:Record<string,unknown>={}){
  await tx.query('INSERT INTO audit_logs(profile_id,agent_id,action,details) VALUES($1,$2,$3,$4)',[profile.id,agentId,action,JSON.stringify(details)]);
}
export async function operatingSpend(tx:Queryable,agentId:string) {
  const row=(await one(tx,`SELECT COALESCE(sum(amount) FILTER(WHERE created_at>now()-interval '1 hour'),0) AS "hour",
    COALESCE(sum(amount),0) AS "day" FROM ledger_entries WHERE agent_id=$1 AND direction='debit'
    AND category IN ('compute','tool','service_purchase') AND created_at>now()-interval '24 hours'`,[agentId]))!;
  const pending=(await one(tx,`SELECT COALESCE(sum((requirements->>'amount')::bigint) FILTER(WHERE created_at>now()-interval '1 hour'),0) AS "hour",
    COALESCE(sum((requirements->>'amount')::bigint),0) AS "day" FROM payment_attempts WHERE requester_agent_id=$1
    AND status IN ('reserved','signed','verifying','settling')`,[agentId]))!;
  const running=(await one(tx,"SELECT COALESCE(sum((payload->>'measuredCost')::bigint),0) cost FROM jobs WHERE agent_id=$1 AND status='running'",[agentId]))!;
  return {hour:Number(row.hour)+Number(pending.hour)+Number(running.cost),day:Number(row.day)+Number(pending.day)+Number(running.cost)};
}
