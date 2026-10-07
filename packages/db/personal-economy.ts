import {one,type Queryable} from './connection';
import {internalUnit} from './journal';

// The caller must supply the authenticated profile, never a client-selected wallet.
export async function personalEconomy(tx:Queryable,profileId:string){
 const unit=internalUnit();
 const owned=`SELECT id,business_id FROM agents WHERE creator_profile_id=$1`;
 const entries=`SELECT l.* FROM ledger_entries l JOIN ledger_transactions t ON t.id=l.transaction_id WHERE t.unit=$2 AND l.business_id IN (SELECT business_id FROM owned)`;
 const revenue=`COALESCE(sum(amount) FILTER(WHERE category='revenue' AND direction='credit'),0)::float8/1e6`;
 const costs=`COALESCE(sum(CASE WHEN category='refund' THEN -amount ELSE amount END) FILTER(WHERE category IN ('compute','tool','service_purchase','refund')),0)::float8/1e6`;
 const orders=`SELECT p.id,p.amount,r.completed_at FROM service_requests r JOIN payments p ON p.id=r.payment_id WHERE r.requester_agent_id IS NOT NULL AND r.status='succeeded' AND p.status='settled' AND (r.requester_agent_id IN (SELECT id FROM owned) OR r.provider_agent_id IN (SELECT id FROM owned)) AND EXISTS(SELECT 1 FROM ledger_entries l JOIN ledger_transactions t ON t.id=l.transaction_id WHERE l.payment_id=p.id AND l.category='revenue' AND t.unit=$2)`;
 const totals=(await one(tx,`WITH owned AS (${owned}), entries AS (${entries}), orders AS (${orders}) SELECT ${revenue} revenue,${costs} costs,(SELECT count(*)::integer FROM owned) coins,(SELECT COALESCE(sum(amount),0)::float8/1e6 FROM orders) a2a,(SELECT count(*)::integer FROM jobs WHERE agent_id IN (SELECT id FROM owned) AND status='succeeded') jobs FROM entries`,[profileId,unit]))!;
 const series=(await tx.query(`WITH owned AS (${owned}), entries AS (${entries}), orders AS (${orders}) SELECT d::date::text AS "day",
 (SELECT ${revenue} FROM entries WHERE created_at>=d AND created_at<d+interval '1 day') revenue,
 (SELECT COALESCE(sum(amount),0)::float8/1e6 FROM orders WHERE completed_at>=d AND completed_at<d+interval '1 day') a2a,
 (SELECT count(*)::integer FROM jobs WHERE agent_id IN (SELECT id FROM owned) AND status='succeeded' AND finished_at>=d AND finished_at<d+interval '1 day') jobs
 FROM generate_series(date_trunc('day',now())-interval '29 days',date_trunc('day',now()),interval '1 day') d ORDER BY d`,[profileId,unit])).rows;
 return {unit,coins:totals.coins,totals:{revenue:totals.revenue,a2a:totals.a2a,jobs:totals.jobs,net:totals.revenue-totals.costs},series};
}
