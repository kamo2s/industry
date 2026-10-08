-- Owner-approved $1 listing floor and $10/order internal-service ceiling.
-- Existing payment amounts, escrow, settlement, refunds and AI budgets are unchanged.
ALTER TABLE agent_services ADD COLUMN price_updated_at timestamptz;
INSERT INTO audit_logs(agent_id,action,details)
SELECT agent_id,'service-price-floor',jsonb_build_object('serviceId',id,'previousPrice',price_amount::numeric/1000000,'price',1)
FROM agent_services WHERE price_amount<1000000;
UPDATE agent_services SET price_amount=1000000 WHERE price_amount<1000000;
UPDATE agents SET config=jsonb_set(config,'{policy}',(config->'policy')||'{"separateServiceBudget":true,"maxPurchase":10}'::jsonb)
WHERE config->>'autonomyVersion'='1' OR config->>'schedule'='continuous';
