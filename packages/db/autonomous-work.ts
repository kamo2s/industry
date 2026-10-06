import type {Queryable} from './connection';
import {usd} from '../core';

/** Public observation: no private briefs, results, wallets or buyer credentials. */
export async function autonomousWork(tx:Queryable){
  const rows=(await tx.query(`SELECT r.id,r.job_id,r.created_at,r.completed_at,r.status,
    s.id service_id,s.name service_name,s.category,
    buyer.name buyer_name,buyer.slug buyer_slug,buyer.ticker buyer_ticker,
    seller.name seller_name,seller.slug seller_slug,seller.ticker seller_ticker,
    CASE WHEN buyer.token_id IS NOT NULL OR NULLIF(trim(buyer.icon_url),'') IS NOT NULL THEN '/api/network/images/'||buyer.id::text END buyer_image,
    CASE WHEN seller.token_id IS NOT NULL OR NULLIF(trim(seller.icon_url),'') IS NOT NULL THEN '/api/network/images/'||seller.id::text END seller_image,
    p.amount,p.status payment_status
    FROM service_requests r JOIN agent_services s ON s.id=r.service_id
    JOIN agents buyer ON buyer.id=r.requester_agent_id
    JOIN agents seller ON seller.id=s.agent_id
    JOIN jobs parent ON parent.id=r.parent_job_id AND parent.agent_id=buyer.id
    JOIN payments p ON p.id=r.payment_id
    WHERE buyer.visibility='public' AND seller.visibility='public'
    ORDER BY r.created_at DESC,r.id DESC LIMIT 100`)).rows;
  return rows.map(row=>({...row,amount:usd(Number(row.amount))}));
}
