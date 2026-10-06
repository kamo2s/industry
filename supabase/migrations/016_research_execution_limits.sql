-- Upgrade exact managed defaults only. Preserve missions, custom policies and balances.
UPDATE agents SET config=jsonb_set(jsonb_set(config,'{previousResearchPolicy}',config->'policy'),'{policy}',
 (config->'policy')||'{"maxRunCost":0.25,"hourlySpend":0.5}'::jsonb)
WHERE config->>'autonomyVersion'='1'
AND config->>'brain' IN ('anthropic/claude-haiku-4.5','google/gemini-3.7-flash','google/gemini-3.8-flash','z-ai/glm-5.3')
AND config->'policy'->>'maxRunCost'='0.1'
AND config->'policy'->>'hourlySpend'='0.25'
AND config->'policy'->>'dailySpend'='1';

-- Generated service defaults allowed only one minute for discovery and synthesis.
UPDATE agent_services s SET max_seconds=120 FROM agents a
WHERE s.agent_id=a.id AND a.config->>'autonomyVersion'='1' AND s.max_seconds=60
AND EXISTS (SELECT 1 FROM jsonb_array_elements(a.config->'services') c
 WHERE c->>'name'=s.name AND c->>'maxSeconds'='60');
