import { one,type Queryable } from './connection';
import { agentView } from './metrics';
import { internalUnit } from './journal';

export async function economyOverview(tx:Queryable){
 const agents=await Promise.all((await tx.query("SELECT * FROM agents WHERE visibility='public' ORDER BY created_at")).rows.map(a=>agentView(tx,a)));
 const unit=internalUnit();
 const totals=(await one(tx,`SELECT
 COALESCE(sum(l.amount) FILTER(WHERE l.category='revenue' AND l.external AND r.requester_agent_id IS NULL),0)::float8/1e6 revenue,
 COALESCE(sum(l.amount) FILTER(WHERE l.category='revenue' AND l.external AND r.requester_agent_id IS NULL),0)::float8/1e6 customer_revenue,
 COALESCE(sum(l.amount) FILTER(WHERE l.category='revenue' AND r.requester_agent_id IS NOT NULL),0)::float8/1e6 a2a,
 COALESCE(sum(l.amount) FILTER(WHERE l.category IN ('compute','tool')),0)::float8/1e6 compute,
 COALESCE(sum(l.amount) FILTER(WHERE l.category IN ('compute','tool')),0)::float8/1e6 costs
 FROM ledger_entries l JOIN ledger_transactions t ON t.id=l.transaction_id JOIN agents a ON a.business_id=l.business_id LEFT JOIN service_requests r ON r.id=l.service_request_id WHERE a.visibility='public' AND t.unit=$1`,[unit]))!;
 const customers=Number((await one(tx,`SELECT count(DISTINCT r.requester_profile_id) n FROM service_requests r JOIN ledger_entries l ON l.service_request_id=r.id AND l.category='revenue' AND l.external JOIN ledger_transactions t ON t.id=l.transaction_id JOIN agents a ON a.id=r.provider_agent_id WHERE r.requester_agent_id IS NULL AND r.status='succeeded' AND a.visibility='public' AND t.unit=$1`,[unit]))!.n);
 const series=(await tx.query(`SELECT d::date::text AS "day",
 (SELECT COALESCE(sum(l.amount),0)::float8/1e6 FROM ledger_entries l JOIN ledger_transactions t ON t.id=l.transaction_id JOIN agents a ON a.id=l.agent_id LEFT JOIN service_requests r ON r.id=l.service_request_id WHERE a.visibility='public' AND t.unit=$1 AND l.category='revenue' AND l.external AND r.requester_agent_id IS NULL AND l.created_at>=d AND l.created_at<d+interval '1 day') revenue,
 (SELECT COALESCE(sum(p.amount),0)::float8/1e6 FROM service_requests r JOIN payments p ON p.id=r.payment_id JOIN ledger_entries l ON l.payment_id=p.id AND l.category='revenue' JOIN ledger_transactions t ON t.id=l.transaction_id WHERE t.unit=$1 AND r.requester_agent_id IS NOT NULL AND r.status='succeeded' AND r.completed_at>=d AND r.completed_at<d+interval '1 day' AND EXISTS(SELECT 1 FROM agents a WHERE a.id=r.provider_agent_id AND a.visibility='public')) a2a,
 (SELECT count(*)::integer FROM jobs j JOIN agents a ON a.id=j.agent_id WHERE a.visibility='public' AND j.status='succeeded' AND j.finished_at>=d AND j.finished_at<d+interval '1 day') jobs,
 (SELECT count(DISTINCT r.requester_profile_id)::integer FROM service_requests r JOIN ledger_entries l ON l.service_request_id=r.id AND l.category='revenue' AND l.external JOIN ledger_transactions t ON t.id=l.transaction_id WHERE r.requester_agent_id IS NULL AND t.unit=$1 AND r.completed_at>=d AND r.completed_at<d+interval '1 day') customers
 FROM generate_series(date_trunc('day',now())-interval '29 days',date_trunc('day',now()),interval '1 day') d ORDER BY d`,[unit])).rows;
 // Sustaining rate is recorded at observation time, never backfilled from today's status.
 const sustainability=(await tx.query('SELECT observed_at,active_businesses,sustaining_businesses FROM economy_snapshots WHERE unit=$1 ORDER BY observed_at DESC LIMIT 30',[unit])).rows.reverse();
 const services=(await tx.query(`SELECT s.id,s.name,a.name business,a.slug,count(*)::integer purchases,sum(p.amount)::float8/1e6 revenue FROM service_requests r JOIN payments p ON p.id=r.payment_id JOIN agent_services s ON s.id=r.service_id JOIN agents a ON a.id=r.provider_agent_id JOIN ledger_entries l ON l.payment_id=p.id AND l.category='revenue' JOIN ledger_transactions t ON t.id=l.transaction_id WHERE r.status='succeeded' AND p.status='settled' AND t.unit=$1 AND a.visibility='public' GROUP BY s.id,a.name,a.slug ORDER BY count(*) DESC LIMIT 10`,[unit])).rows;
 const categories=Object.values(agents.reduce((out:any,a)=>{const c=out[a.category]||={category:a.category,businesses:0,revenue:0,jobs:0};c.businesses++;c.revenue+=a.metrics.totalRevenue||0;c.jobs+=a.metrics.jobs;return out;},{}));
 return {unit,source:'INDUSTRY Treasury Ledger',totals:{...totals,net:totals.revenue-totals.costs,retained:agents.reduce((s,a)=>s+a.metrics.operatingBalance,0),computeCredits:agents.reduce((s,a)=>s+a.metrics.computeCredits,0),jobs:agents.reduce((s,a)=>s+a.metrics.jobs,0),active:agents.filter(a=>a.metrics.lifecycle!=='DORMANT').length,sustaining:agents.filter(a=>a.metrics.lifecycle==='SELF-SUSTAINING').length,customers},series,sustainability,categories,services,businesses:agents.sort((a,b)=>(b.metrics.totalRevenue||0)-(a.metrics.totalRevenue||0)),mostHired:(await tx.query(`SELECT a.id,a.name,a.slug,count(*)::integer hires,sum(p.amount)::float8/1e6 volume FROM service_requests r JOIN payments p ON p.id=r.payment_id JOIN agents a ON a.id=r.provider_agent_id JOIN ledger_entries l ON l.payment_id=p.id AND l.category='revenue' JOIN ledger_transactions t ON t.id=l.transaction_id WHERE r.requester_agent_id IS NOT NULL AND r.status='succeeded' AND a.visibility='public' AND t.unit=$1 GROUP BY a.id ORDER BY count(*) DESC LIMIT 10`,[unit])).rows};
}
