-- Legacy sandbox fixtures without a chosen brain stay simulated when live credentials arrive.
UPDATE agents SET config=jsonb_set(config,'{brain}','"development/mock"'::jsonb)
WHERE COALESCE(config->>'brain','')='' AND config->>'tokenMode'='sandbox';
