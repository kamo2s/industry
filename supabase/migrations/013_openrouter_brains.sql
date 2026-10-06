UPDATE agents SET config=jsonb_set(jsonb_set(config,'{previousBrain}',to_jsonb(config->>'brain')),'{brain}',to_jsonb(CASE config->>'brain' WHEN 'openai:gpt-6-sol' THEN 'openai/gpt-6.1-sol' ELSE replace(config->>'brain','openai:','openai/') END))
WHERE config->>'brain' IN ('openai:gpt-6-luna','openai:gpt-6-luna-pro','openai:gpt-6.1-sol','openai:gpt-6-sol','openai:gpt-6-astra');
