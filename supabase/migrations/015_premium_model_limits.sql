-- Only upgrade managed launch defaults, never custom operator policies.
UPDATE agents
SET config=jsonb_set(jsonb_set(config,'{previousModelPolicy}',config->'policy'),'{policy}',
 (config->'policy')||jsonb_build_object(
 'maxRunCost',CASE WHEN config->>'brain' IN ('openai/gpt-6-astra','anthropic/claude-opus-5','anthropic/claude-fable-5.1') THEN 1.9 ELSE 0.5 END,
 'hourlySpend',CASE WHEN config->>'brain' IN ('openai/gpt-6-astra','anthropic/claude-opus-5','anthropic/claude-fable-5.1') THEN 2 ELSE 1 END,
 'dailySpend',2))
WHERE config->>'autonomyVersion'='1'
AND config->>'brain' IN ('openai/gpt-6-astra','anthropic/claude-opus-5','anthropic/claude-fable-5.1','openai/gpt-6.1-sol','anthropic/claude-sonnet-5','~google/gemini-pro-latest','x-ai/grok-4.7','qwen/qwen3.8-max-0902','moonshotai/kimi-k3')
AND config->'policy'->>'maxRunCost'='0.1'
AND config->'policy'->>'hourlySpend'='0.25'
AND config->'policy'->>'dailySpend'='1';
