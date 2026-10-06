-- Add Pump operations and asset-separated receipt attribution without rewriting history.
ALTER TABLE businesses ADD COLUMN token_mode text;
ALTER TABLE businesses ADD COLUMN mint text;
ALTER TABLE businesses ADD COLUMN creator_wallet text;
CREATE TABLE pump_launches (
 id uuid PRIMARY KEY, business_id uuid NOT NULL UNIQUE, profile_id uuid NOT NULL REFERENCES profiles(id),
 idempotency_key text NOT NULL UNIQUE, fingerprint text NOT NULL, config jsonb NOT NULL,
 network text NOT NULL CHECK(network IN ('devnet','mainnet-beta')), mint text NOT NULL, creator text NOT NULL, treasury text NOT NULL,
 metadata_uri text NOT NULL, mint_secret text, signer_expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours', status text NOT NULL DEFAULT 'draft',
 signature text, signed_transaction text, prepared_transaction text, blockhash text, last_valid_height bigint,
 terms jsonb, evidence jsonb, error text, active_result jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(network,mint), CHECK(status IN ('draft','prepared','submitted','unknown','confirmed','verified','failed','expired','cancelled'))
);
CREATE TABLE pump_launch_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), launch_id uuid NOT NULL REFERENCES pump_launches(id),
 message_hash text NOT NULL UNIQUE, prepared_transaction text NOT NULL, signed_transaction text, signature text UNIQUE,
 last_valid_height bigint NOT NULL, status text NOT NULL DEFAULT 'prepared', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE pump_businesses (
 business_id uuid PRIMARY KEY REFERENCES businesses(id), launch_id uuid NOT NULL UNIQUE REFERENCES pump_launches(id),
 network text NOT NULL, mint text NOT NULL, creator text NOT NULL, treasury text NOT NULL, sharing_config text NOT NULL,
 quote_mint text NOT NULL, quote_decimals integer NOT NULL, quote_token_program text NOT NULL,
 routing_status text NOT NULL, routing_evidence jsonb NOT NULL, launch_slot bigint NOT NULL,
 pending_raw numeric(20,0), sweepable_raw numeric(20,0), observed_at timestamptz, graduated boolean NOT NULL DEFAULT false,
 collection_state text NOT NULL DEFAULT 'idle', collection_error text, collect_requested boolean NOT NULL DEFAULT false,
 last_collection timestamptz, next_collection_at timestamptz NOT NULL DEFAULT now(),
 scan_head text, scan_before text, scan_stop text, scan_next_head text,
 lease uuid, lease_until timestamptz, UNIQUE(network,mint),UNIQUE(network,sharing_config)
);
CREATE TABLE pump_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), network text NOT NULL,
 mint text NOT NULL, sharing_config text NOT NULL, signature text NOT NULL, instruction_index integer NOT NULL,event_index integer NOT NULL,
 slot bigint NOT NULL, block_time timestamptz NOT NULL, quote_mint text NOT NULL, quote_decimals integer NOT NULL,
 raw_amount numeric(20,0) NOT NULL CHECK(raw_amount>0), normalized_amount text NOT NULL, treasury text NOT NULL,
 operation text NOT NULL, confirmation text NOT NULL CHECK(confirmation='finalized'), reconciliation_key text NOT NULL UNIQUE,
 evidence jsonb NOT NULL, policy jsonb, phase text, allocation_status text NOT NULL DEFAULT 'PENDING_CONVERSION',
 price_proof jsonb, usd_value bigint CHECK(usd_value>=0), usd_unit text CHECK(usd_unit IN ('TEST_USDC','USDC_CREDIT')),
 conversion_error text, pricing_attempted_at timestamptz, converted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), allocated_at timestamptz,
 UNIQUE(network,signature,instruction_index,event_index,mint,treasury)
);
CREATE TABLE pump_collection_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES businesses(id), network text NOT NULL,
 signature text NOT NULL UNIQUE, signed_transaction text NOT NULL, last_valid_height bigint NOT NULL,
 estimated_fee bigint NOT NULL, state text NOT NULL DEFAULT 'prepared', error text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE pump_scan_signatures (
 business_id uuid NOT NULL REFERENCES businesses(id), signature text NOT NULL, slot bigint NOT NULL,
 processed boolean NOT NULL DEFAULT false, error text, PRIMARY KEY(business_id,signature)
);
CREATE TABLE ledger_assets (
 unit text PRIMARY KEY, network text NOT NULL, mint text, decimals integer NOT NULL CHECK(decimals BETWEEN 0 AND 18)
);
INSERT INTO ledger_assets(unit,network,decimals) VALUES('TEST_USDC','sandbox',6),('USDC_CREDIT','internal',6),('DEVNET_USDC','devnet',6);
ALTER TABLE ledger_accounts DROP CONSTRAINT ledger_accounts_unit_check;
ALTER TABLE ledger_accounts ADD CONSTRAINT ledger_unit_asset FOREIGN KEY(unit) REFERENCES ledger_assets(unit);
CREATE FUNCTION preserve_pump_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.token_mode IS DISTINCT FROM OLD.token_mode OR NEW.mint IS DISTINCT FROM OLD.mint OR NEW.creator_wallet IS DISTINCT FROM OLD.creator_wallet THEN RAISE EXCEPTION 'Pump economic identity is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_pump_identity BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION preserve_pump_identity();
CREATE FUNCTION preserve_pump_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (to_jsonb(NEW)-ARRAY['policy','phase','allocation_status','allocated_at','price_proof','usd_value','usd_unit','conversion_error','pricing_attempted_at','converted_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['policy','phase','allocation_status','allocated_at','price_proof','usd_value','usd_unit','conversion_error','pricing_attempted_at','converted_at']) THEN RAISE EXCEPTION 'Pump chain receipt is immutable'; END IF;
 IF OLD.price_proof IS NOT NULL AND (NEW.price_proof IS DISTINCT FROM OLD.price_proof OR NEW.usd_value IS DISTINCT FROM OLD.usd_value OR NEW.usd_unit IS DISTINCT FROM OLD.usd_unit OR NEW.converted_at IS DISTINCT FROM OLD.converted_at) THEN RAISE EXCEPTION 'Pump valuation is immutable'; END IF;
 IF OLD.allocation_status='ALLOCATED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Pump allocation is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_pump_receipt BEFORE UPDATE ON pump_receipts FOR EACH ROW EXECUTE FUNCTION preserve_pump_receipt();
CREATE TRIGGER no_delete_pump_receipt BEFORE DELETE ON pump_receipts FOR EACH ROW EXECUTE FUNCTION immutable_journal();
CREATE INDEX pump_collect_due ON pump_businesses(next_collection_at);
CREATE INDEX pump_receipt_business ON pump_receipts(business_id,slot);
CREATE FUNCTION preserve_pump_business() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF (NEW.business_id,NEW.launch_id,NEW.network,NEW.mint,NEW.creator,NEW.treasury,NEW.sharing_config,NEW.quote_mint,NEW.quote_decimals,NEW.quote_token_program,NEW.launch_slot) IS DISTINCT FROM (OLD.business_id,OLD.launch_id,OLD.network,OLD.mint,OLD.creator,OLD.treasury,OLD.sharing_config,OLD.quote_mint,OLD.quote_decimals,OLD.quote_token_program,OLD.launch_slot) THEN RAISE EXCEPTION 'Pump routing identity is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_pump_business BEFORE UPDATE ON pump_businesses FOR EACH ROW EXECUTE FUNCTION preserve_pump_business();
ALTER TABLE pump_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_launch_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_collection_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pump_scan_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_assets ENABLE ROW LEVEL SECURITY;
