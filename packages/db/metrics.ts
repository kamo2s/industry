import { one, type Queryable, type Row } from './connection';
import { lifecycle, micro, usd, policySchema, type Agent, type Metrics } from '../core';
import { balances, internalUnit } from './journal';
import {operationalStatus} from './operations';
export async function metrics(db: Queryable, a: Row): Promise<Metrics> {
  const r = (await one(db, `SELECT
    COALESCE(sum(amount) FILTER(WHERE category='revenue' AND direction='credit' AND created_at>now()-interval '7 days'),0) service_revenue7d,
    COALESCE(sum(CASE WHEN direction='credit' THEN amount ELSE -amount END) FILTER(WHERE network='sandbox'),0) balance,
    COALESCE(sum(amount) FILTER(WHERE category='revenue' AND external),0) total_revenue,
    COALESCE(sum(amount) FILTER(WHERE category='revenue' AND external AND created_at>now()-interval '14 days' AND created_at<=now()-interval '7 days'),0) previous_revenue,
    COALESCE(sum(amount) FILTER(WHERE category='revenue' AND external AND created_at>now()-interval '1 day'),0) revenue24h,
    COALESCE(sum(amount) FILTER(WHERE category='revenue' AND external AND created_at>now()-interval '7 days'),0) revenue7d,
    COALESCE(sum(CASE WHEN category='refund' THEN -amount ELSE amount END) FILTER(WHERE category IN ('compute','tool','service_purchase','refund') AND created_at>now()-interval '7 days'),0) cost7d
    FROM ledger_entries WHERE business_id=$1`,[a.business_id||a.id]))!;
  const j = (await one(db, `SELECT count(*) FILTER(WHERE status='succeeded') jobs,count(*) FILTER(WHERE status='succeeded' AND finished_at>now()-interval '1 day') jobs24h,count(*) FILTER(WHERE status='succeeded' AND finished_at>now()-interval '7 days') jobs7d FROM jobs WHERE agent_id=$1`,[a.id]))!;
  const p = (await one(db, `SELECT count(*) n,count(DISTINCT sr.requester_profile_id) customers FROM service_requests sr JOIN ledger_entries l ON l.service_request_id=sr.id AND l.category='revenue' AND l.external WHERE sr.provider_agent_id=$1 AND sr.status='succeeded' AND sr.completed_at>now()-interval '7 days'`,[a.id]))!;
  const reserved = Number((await one(db,`SELECT COALESCE(sum((payload->>'reservedCost')::bigint),0) amount FROM jobs WHERE agent_id=$1 AND status='running'`,[a.id]))!.amount);
  const funds=await balances(db,a.business_id||a.id);
  const balance = Math.max(0,funds.compute-usd(reserved)), revenue7d=usd(Number(r.revenue7d)), cost7d=usd(Number(r.cost7d));
  const routing=a.token_id?await one(db,'SELECT routing_status FROM businesses WHERE id=$1',[a.business_id]):null;
  const state = lifecycle({ paused: a.paused||!!a.terminated_at||funds.computeDebt>0||(!!a.token_id&&routing?.routing_status!=='VERIFIED'), runs: Number(j.jobs), balance: micro(balance), nextCost: micro(a.config.policy.maxRunCost), revenue7d, cost7d, externalPaidJobs: Number(p.n) });
  const business=(await one(db,`SELECT count(*) FILTER(WHERE r.provider_agent_id=$1) sold,count(*) FILTER(WHERE r.requester_agent_id=$1) purchased,count(DISTINCT r.provider_agent_id) FILTER(WHERE r.requester_agent_id=$1) hired,COALESCE(sum(p.amount) FILTER(WHERE r.requester_agent_id=$1),0) volume FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.status='succeeded' AND p.status='settled' AND (r.provider_agent_id=$1 OR r.requester_agent_id=$1)`,[a.id]))!;
  const activeServices=Number((await one(db,'SELECT count(*) n FROM agent_services WHERE agent_id=$1 AND active',[a.id]))!.n);
  const observed=await one(db,'SELECT sustaining_since FROM agent_business_states WHERE agent_id=$1',[a.id]);
  // Public earnings include all settled service receipts. Eligibility above stays independent.
  const serviceRevenue7d=usd(Number(r.service_revenue7d));
  const funding=(await one(db,`SELECT COALESCE(sum(t.amount),0) amount FROM ledger_transactions t
    JOIN ledger_accounts c ON c.id=t.credit_account
    WHERE c.business_id=$1 AND c.kind IN ('BUSINESS_COMPUTE','BUSINESS_OPERATING')
    AND t.unit=$2 AND t.reference_type='pump-fee-allocation' AND t.created_at>now()-interval '7 days'`,[a.business_id||a.id,internalUnit()]))!;
  const publicIncome={serviceRevenue7d,serviceNet7d:serviceRevenue7d-cost7d,pumpFunding7d:usd(Number(funding.amount))};
  return { ...publicIncome, balance, operatingBalance:funds.operating,computeCredits:funds.compute, revenue24h: usd(Number(r.revenue24h)), revenue7d, cost7d, net7d: revenue7d-cost7d, jobs: Number(j.jobs), customers: Number(p.customers), externalPaidJobs: Number(p.n), ratio: cost7d>0 ? revenue7d/cost7d : 0, lifecycle: state,jobs24h:Number(j.jobs24h),jobs7d:Number(j.jobs7d),totalRevenue:usd(Number(r.total_revenue)),servicesSold:Number(business.sold),servicesPurchased:Number(business.purchased),agentsHired:Number(business.hired),a2aVolume:usd(Number(business.volume)),activeServices,revenueGrowth:Number(r.previous_revenue)>0?(Number(r.revenue7d)/Number(r.previous_revenue)-1)*100:null,selfSustainingSince:state==='SELF-SUSTAINING'?observed?.sustaining_since||null:null };
}
export async function agentView(db: Queryable, a: Row): Promise<Agent> {
  const owner = await one(db,'SELECT primary_wallet FROM profiles WHERE id=$1',[a.creator_profile_id]);
  a={...a,config:{...a.config,brain:a.config.brain||(a.config.tokenMode==='sandbox'?'development/mock':undefined),policy:policySchema.parse(a.config.policy)}};
  const token = a.token_id ? await one(db,'SELECT mint,network,name,symbol,verified_at,official,creator_wallet,launched_at,transaction_signature,metadata_uri FROM solana_tokens WHERE id=$1',[a.token_id]) : null;
  const treasury=await one(db,'SELECT public_address,network FROM wallet_accounts WHERE agent_id=$1',[a.id]);
  const market=a.token_id?await one(db,`SELECT market_cap::float8 AS "marketCap",volume_24h::float8 AS "volume24h",price::float8,change_24h::float8 AS "change24h",liquidity::float8,observed_at AS "observedAt",source FROM market_snapshots WHERE token_id=$1 AND observed_at>now()-interval '10 minutes' ORDER BY observed_at DESC LIMIT 1`,[a.token_id]):null;
  return { ...a, platform_operated:(await one(db,'SELECT mode FROM businesses WHERE id=$1',[a.business_id]))?.mode==='PLATFORM_OPERATED', slug:token?.mint||a.slug, operational:await operationalStatus(db,a), business:await one(db,'SELECT mode,routing_status,mandate,routing_evidence FROM businesses WHERE id=$1',[a.business_id]), treasury, market:market||null, creator_wallet: owner!.primary_wallet, token, tools: (await db.query('SELECT tool_key FROM agent_tools WHERE agent_id=$1 AND enabled',[a.id])).rows.map(t=>t.tool_key), metrics: await metrics(db,a) } as Agent;
}
