-- A platform-operated business is real execution, without an issued token.
ALTER TABLE businesses DROP CONSTRAINT businesses_mode_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_mode_check CHECK(mode IN ('SANDBOX','DEVNET_TOKEN','MAINNET_TOKEN','PLATFORM_OPERATED'));
ALTER TABLE businesses ADD CONSTRAINT platform_business_no_token CHECK(mode<>'PLATFORM_OPERATED' OR (token_id IS NULL AND routing_status='NOT_APPLICABLE' AND mint IS NULL));
