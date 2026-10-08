import {ensure,micro,usd} from '../core';
import {priceDecisionSchema} from '../core/service-pricing';
import {one,type Queryable,type Row} from './connection';
import {event} from './economy';
import {requireEnabled} from './controls';

export async function pricingContext(tx:Queryable,agent:Row){
  return (await tx.query(`SELECT s.id AS "serviceId",s.name,s.description, s.category,
    s.price_amount::float8/1000000 AS price,
    (s.price_updated_at IS NULL OR s.price_updated_at<now()-interval '24 hours') AS "canUpdate",
    (SELECT count(*)::int FROM service_requests r WHERE r.service_id=s.id AND r.status='succeeded' AND r.completed_at>now()-interval '30 days') AS "completedOrders30d",
    (SELECT avg(cost)::float8/1000000 FROM (
      SELECT COALESCE(sum(l.amount),0) cost FROM service_requests r
      LEFT JOIN ledger_entries l ON l.job_id=r.job_id AND l.direction='debit' AND l.category IN ('compute','tool')
      WHERE r.service_id=s.id AND r.status='succeeded' AND r.completed_at>now()-interval '30 days'
      GROUP BY r.id) measured) AS "averageDeliveryCost30d"
    FROM agent_services s WHERE s.agent_id=$1 AND s.active ORDER BY s.id LIMIT 5`,[agent.id])).rows;
}

/** Called only inside the worker's fenced job transaction with the owner row locked. */
export async function updateServicePrice(tx:Queryable,agent:Row,job:Row,raw:unknown){
  await requireEnabled(tx,'agents');
  ensure(!agent.paused&&!agent.terminated_at&&!agent.config.policy.killSwitch,'PAUSED','Coin is paused');
  ensure(job.type!=='SERVICE'&&agent.config.policy.separateServiceBudget,'PRICING_DENIED','Only autonomous mission jobs can set service prices');
  const decision=priceDecisionSchema.parse(raw);
  const service=await one(tx,'SELECT * FROM agent_services WHERE id=$1 AND agent_id=$2 AND active FOR UPDATE',[decision.serviceId,agent.id]);
  ensure(service,'PRICING_DENIED','Cannot price another Coin’s service');
  if(Number(service.price_amount)===micro(decision.price))return {changed:false};
  if(service.price_updated_at&&Date.now()-new Date(service.price_updated_at).getTime()<86400000)return {changed:false,reason:'cooldown'};
  await tx.query('UPDATE agent_services SET price_amount=$1,price_updated_at=now() WHERE id=$2',[micro(decision.price),service.id]);
  await tx.query("INSERT INTO audit_logs(agent_id,action,details) VALUES($1,'autonomous-service-price',$2)",[agent.id,JSON.stringify({jobId:job.id,serviceId:service.id,previousPrice:usd(Number(service.price_amount)),price:decision.price,reason:decision.reason})]);
  await event(tx,agent.id,'service-priced',`${service.name}: price updated to $${decision.price.toFixed(2)} per order.`,{job:job.id});
  return {changed:true,price:decision.price};
}
