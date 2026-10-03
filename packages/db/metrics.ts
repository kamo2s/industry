import { one, type Queryable, type Row } from './connection';
import { lifecycle, micro, usd, type Agent, type Metrics } from '../core';
export async function metrics(db: Queryable, a: Row): Promise<Metrics> {
  const r = (await one(db, `SELECT
    COALESCE(sum(CASE WHEN direction='credit' THEN amount ELSE -amount END),0) balance,
    COALESCE(sum(amount) FILTER(WHERE category='revenue' AND external AND created_at>now()-interval '1 day'),0) revenue24h,
    COALESCE(sum(amount) FILTER(WHERE category='revenue' AND external AND created_at>now()-interval '7 days'),0) revenue7d,
    COALESCE(sum(CASE WHEN category='refund' THEN -amount ELSE amount END) FILTER(WHERE category IN ('compute','tool','service_purchase','refund') AND created_at>now()-interval '7 days'),0) cost7d
    FROM ledger_entries WHERE agent_id=$1`,[a.id]))!;
  const j = (await one(db, `SELECT count(*) FILTER(WHERE status='succeeded') jobs FROM jobs WHERE agent_id=$1`,[a.id]))!;
  const p = (await one(db, `SELECT count(*) n,count(DISTINCT sr.requester_profile_id) customers FROM service_requests sr JOIN ledger_entries l ON l.service_request_id=sr.id AND l.category='revenue' AND l.external WHERE sr.provider_agent_id=$1 AND sr.status='succeeded' AND sr.completed_at>now()-interval '7 days'`,[a.id]))!;
  const reserved = Number((await one(db,`SELECT COALESCE(sum((payload->>'reservedCost')::bigint),0) amount FROM jobs WHERE agent_id=$1 AND status='running'`,[a.id]))!.amount);
  const balance = usd(Number(r.balance)-reserved), revenue7d=usd(Number(r.revenue7d)), cost7d=usd(Number(r.cost7d));
  const state = lifecycle({ paused: a.paused, runs: Number(j.jobs), balance: micro(balance), nextCost: micro(a.config.policy.maxRunCost), revenue7d, cost7d, externalPaidJobs: Number(p.n) });
  return { balance, revenue24h: usd(Number(r.revenue24h)), revenue7d, cost7d, net7d: revenue7d-cost7d, jobs: Number(j.jobs), customers: Number(p.customers), externalPaidJobs: Number(p.n), ratio: cost7d>0 ? revenue7d/cost7d : 0, lifecycle: state };
}
export async function agentView(db: Queryable, a: Row): Promise<Agent> {
  const owner = await one(db,'SELECT primary_wallet FROM profiles WHERE id=$1',[a.creator_profile_id]);
  const token = a.token_id ? await one(db,'SELECT mint,network,name,symbol,verified_at FROM solana_tokens WHERE id=$1',[a.token_id]) : null;
  return { ...a, creator_wallet: owner!.primary_wallet, token, tools: (await db.query('SELECT tool_key FROM agent_tools WHERE agent_id=$1 AND enabled',[a.id])).rows.map(t=>t.tool_key), metrics: await metrics(db,a) } as Agent;
}
