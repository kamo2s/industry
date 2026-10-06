-- Add economic identities without replacing agent, job, token or receipt history.
CREATE TABLE businesses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), creator_profile_id uuid NOT NULL REFERENCES profiles(id),
 token_id uuid UNIQUE REFERENCES solana_tokens(id), mode text NOT NULL CHECK(mode IN ('SANDBOX','DEVNET_TOKEN','MAINNET_TOKEN')),
 mandate text NOT NULL, routing_status text NOT NULL DEFAULT 'NOT_APPLICABLE' CHECK(routing_status IN ('NOT_APPLICABLE','PENDING','VERIFIED','FAILED')),
 routing_provider text, routing_evidence jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO businesses(id,creator_profile_id,token_id,mode,mandate,created_at,routing_status)
 SELECT a.id,a.creator_profile_id,a.token_id,CASE WHEN a.token_id IS NULL THEN 'SANDBOX' WHEN t.network='devnet' THEN 'DEVNET_TOKEN' ELSE 'MAINNET_TOKEN' END,a.mission,a.created_at,CASE WHEN a.token_id IS NULL THEN 'NOT_APPLICABLE' ELSE 'PENDING' END FROM agents a LEFT JOIN solana_tokens t ON t.id=a.token_id;
ALTER TABLE agents ADD COLUMN business_id uuid UNIQUE REFERENCES businesses(id);
UPDATE agents SET business_id=id;
ALTER TABLE agents ALTER COLUMN business_id SET NOT NULL;
CREATE FUNCTION preserve_business_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.creator_profile_id IS DISTINCT FROM OLD.creator_profile_id OR NEW.token_id IS DISTINCT FROM OLD.token_id OR NEW.mode IS DISTINCT FROM OLD.mode THEN RAISE EXCEPTION 'Business identity is immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_business_identity BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION preserve_business_identity();
CREATE FUNCTION preserve_operator_business() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.business_id IS DISTINCT FROM OLD.business_id THEN RAISE EXCEPTION 'Operator business identity is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_operator_business BEFORE UPDATE ON agents FOR EACH ROW EXECUTE FUNCTION preserve_operator_business();

CREATE TABLE ledger_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_key text NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('BUSINESS_OPERATING','BUSINESS_COMPUTE','CUSTOMER_CREDITS','PLATFORM_REVENUE','PLATFORM_COMPUTE_EXPENSE','TREASURY_CLEARING','SETTLEMENT_ESCROW','EXTERNAL_CUSTODY','BUSINESS_COMPUTE_DEBT')),
 business_id uuid REFERENCES businesses(id), profile_id uuid REFERENCES profiles(id),
 unit text NOT NULL CHECK(unit IN ('TEST_USDC','USDC_CREDIT','DEVNET_USDC')), balance bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind NOT IN ('BUSINESS_OPERATING','BUSINESS_COMPUTE','CUSTOMER_CREDITS','SETTLEMENT_ESCROW')) OR balance>=0),
 CHECK((kind NOT IN ('BUSINESS_OPERATING','BUSINESS_COMPUTE')) OR business_id IS NOT NULL),
 CHECK(kind<>'CUSTOMER_CREDITS' OR profile_id IS NOT NULL)
);
CREATE TABLE ledger_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key text NOT NULL UNIQUE,
 debit_account uuid NOT NULL REFERENCES ledger_accounts(id), credit_account uuid NOT NULL REFERENCES ledger_accounts(id),
 amount bigint NOT NULL CHECK(amount>0), unit text NOT NULL, business_id uuid REFERENCES businesses(id),
 reference_type text NOT NULL, reference_id text NOT NULL, status text NOT NULL DEFAULT 'posted' CHECK(status='posted'),
 metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), CHECK(debit_account<>credit_account)
);
CREATE TABLE ledger_postings (
 transaction_id uuid NOT NULL REFERENCES ledger_transactions(id), account_id uuid NOT NULL REFERENCES ledger_accounts(id),
 direction text NOT NULL CHECK(direction IN ('debit','credit')), amount bigint NOT NULL CHECK(amount>0),
 PRIMARY KEY(transaction_id,direction)
);
CREATE FUNCTION immutable_journal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Journal history is append-only'; END $$;
CREATE TRIGGER immutable_transactions BEFORE UPDATE OR DELETE ON ledger_transactions FOR EACH ROW EXECUTE FUNCTION immutable_journal();
CREATE TRIGGER immutable_postings BEFORE UPDATE OR DELETE ON ledger_postings FOR EACH ROW EXECUTE FUNCTION immutable_journal();
CREATE FUNCTION check_journal_pair() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE n integer; total bigint; BEGIN
 SELECT count(*),sum(CASE WHEN direction='credit' THEN amount ELSE -amount END) INTO n,total FROM ledger_postings WHERE transaction_id=NEW.id;
 IF n<>2 OR total<>0 THEN RAISE EXCEPTION 'Unbalanced journal transaction'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_journal_pair();

-- Only this transaction function changes cached balances. Each transfer creates
-- exactly two immutable postings; explicit locks prevent concurrent overdrafts.
CREATE FUNCTION post_ledger_transfer(p_key text,p_debit uuid,p_credit uuid,p_amount bigint,p_unit text,p_business uuid,p_type text,p_reference text,p_metadata jsonb DEFAULT '{}',p_time timestamptz DEFAULT now()) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE old ledger_transactions; a ledger_accounts; b ledger_accounts; result uuid; BEGIN
 IF p_amount<=0 OR p_debit=p_credit THEN RAISE EXCEPTION 'Invalid transfer'; END IF;
 PERFORM id FROM ledger_accounts WHERE id IN (p_debit,p_credit) ORDER BY id FOR UPDATE;
 SELECT * INTO old FROM ledger_transactions WHERE idempotency_key=p_key;
 IF old.id IS NOT NULL THEN
  IF old.debit_account<>p_debit OR old.credit_account<>p_credit OR old.amount<>p_amount OR old.unit<>p_unit OR old.reference_type<>p_type OR old.reference_id<>p_reference OR old.metadata<>p_metadata THEN RAISE EXCEPTION 'Ledger idempotency conflict'; END IF;
  RETURN old.id;
 END IF;
 SELECT * INTO a FROM ledger_accounts WHERE id=p_debit; SELECT * INTO b FROM ledger_accounts WHERE id=p_credit;
 IF a.id IS NULL OR b.id IS NULL OR a.unit<>p_unit OR b.unit<>p_unit THEN RAISE EXCEPTION 'Ledger account unit mismatch'; END IF;
 IF a.kind IN ('BUSINESS_OPERATING','BUSINESS_COMPUTE','CUSTOMER_CREDITS','SETTLEMENT_ESCROW') AND a.balance<p_amount THEN RAISE EXCEPTION 'Insufficient ledger balance'; END IF;
 INSERT INTO ledger_transactions(idempotency_key,debit_account,credit_account,amount,unit,business_id,reference_type,reference_id,metadata,created_at) VALUES(p_key,p_debit,p_credit,p_amount,p_unit,p_business,p_type,p_reference,p_metadata,p_time) RETURNING id INTO result;
 INSERT INTO ledger_postings(transaction_id,account_id,direction,amount) VALUES(result,p_debit,'debit',p_amount),(result,p_credit,'credit',p_amount);
 UPDATE ledger_accounts SET balance=balance-p_amount WHERE id=p_debit;
 UPDATE ledger_accounts SET balance=balance+p_amount WHERE id=p_credit;
 RETURN result;
END $$;

ALTER TABLE ledger_entries ADD COLUMN business_id uuid REFERENCES businesses(id);
ALTER TABLE ledger_entries ADD COLUMN transaction_id uuid REFERENCES ledger_transactions(id);
UPDATE ledger_entries l SET business_id=a.business_id FROM agents a WHERE a.id=l.agent_id;
ALTER TABLE ledger_entries ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE jobs ADD COLUMN business_id uuid REFERENCES businesses(id);
UPDATE jobs j SET business_id=a.business_id FROM agents a WHERE a.id=j.agent_id;
ALTER TABLE jobs ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE agent_services ADD COLUMN business_id uuid REFERENCES businesses(id);
UPDATE agent_services s SET business_id=a.business_id FROM agents a WHERE a.id=s.agent_id;
ALTER TABLE agent_services ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE service_requests ADD COLUMN provider_business_id uuid REFERENCES businesses(id);
ALTER TABLE service_requests ADD COLUMN requester_business_id uuid REFERENCES businesses(id);
UPDATE service_requests r SET provider_business_id=a.business_id FROM agents a WHERE a.id=r.provider_agent_id;
UPDATE service_requests r SET requester_business_id=a.business_id FROM agents a WHERE a.id=r.requester_agent_id;
ALTER TABLE service_requests ALTER COLUMN provider_business_id SET NOT NULL;
ALTER TABLE payments ADD COLUMN debit_account uuid REFERENCES ledger_accounts(id);
ALTER TABLE payments ADD COLUMN escrow_account uuid REFERENCES ledger_accounts(id);
ALTER TABLE payments ADD COLUMN settlement_transaction_id uuid REFERENCES ledger_transactions(id);
ALTER TABLE work_offers ADD COLUMN debit_account uuid REFERENCES ledger_accounts(id);
ALTER TABLE work_offers ADD COLUMN escrow_account uuid REFERENCES ledger_accounts(id);

CREATE FUNCTION assign_business_owner() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 SELECT business_id INTO NEW.business_id FROM agents WHERE id=NEW.agent_id;
 RETURN NEW;
END $$;
CREATE TRIGGER job_business BEFORE INSERT ON jobs FOR EACH ROW EXECUTE FUNCTION assign_business_owner();
CREATE TRIGGER service_business BEFORE INSERT ON agent_services FOR EACH ROW EXECUTE FUNCTION assign_business_owner();
CREATE TRIGGER entry_business BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION assign_business_owner();
CREATE FUNCTION assign_request_businesses() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 SELECT business_id INTO NEW.provider_business_id FROM agents WHERE id=NEW.provider_agent_id;
 SELECT business_id INTO NEW.requester_business_id FROM agents WHERE id=NEW.requester_agent_id;
 RETURN NEW;
END $$;
CREATE TRIGGER request_business BEFORE INSERT ON service_requests FOR EACH ROW EXECUTE FUNCTION assign_request_businesses();

-- Import every existing recorded line, preserving timestamps and values. The old
-- combined sandbox credit is explicitly legacy compute; no fee split is invented.
INSERT INTO ledger_accounts(account_key,kind,unit) VALUES ('platform:TEST_USDC:TREASURY_CLEARING','TREASURY_CLEARING','TEST_USDC'),('platform:DEVNET_USDC:TREASURY_CLEARING','TREASURY_CLEARING','DEVNET_USDC');
INSERT INTO ledger_accounts(account_key,kind,business_id,unit) SELECT 'business:'||id||':BUSINESS_COMPUTE:TEST_USDC','BUSINESS_COMPUTE',id,'TEST_USDC' FROM businesses;
INSERT INTO ledger_accounts(account_key,kind,business_id,unit) SELECT 'business:'||id||':EXTERNAL_CUSTODY:DEVNET_USDC','EXTERNAL_CUSTODY',id,'DEVNET_USDC' FROM businesses;
DO $$ DECLARE r record; debit uuid; credit uuid; own uuid; clearing uuid; entry_unit text; posted uuid; BEGIN
 FOR r IN SELECT * FROM ledger_entries WHERE amount>0 ORDER BY CASE direction WHEN 'credit' THEN 0 ELSE 1 END,created_at,id LOOP
  entry_unit:=CASE WHEN r.network='devnet' THEN 'DEVNET_USDC' ELSE 'TEST_USDC' END;
  SELECT id INTO own FROM ledger_accounts WHERE business_id=r.business_id AND kind=CASE WHEN r.network='devnet' THEN 'EXTERNAL_CUSTODY' ELSE 'BUSINESS_COMPUTE' END AND ledger_accounts.unit=entry_unit;
  SELECT id INTO clearing FROM ledger_accounts WHERE account_key='platform:'||entry_unit||':TREASURY_CLEARING';
  debit:=CASE WHEN r.direction='debit' THEN own ELSE clearing END; credit:=CASE WHEN r.direction='credit' THEN own ELSE clearing END;
  posted:=post_ledger_transfer('migration:'||r.id,debit,credit,r.amount,entry_unit,r.business_id,'legacy-entry',r.id::text,jsonb_build_object('legacy',true,'category',r.category,'external',r.external),r.created_at);
  UPDATE ledger_entries SET transaction_id=posted WHERE id=r.id;
 END LOOP;
 FOR r IN SELECT * FROM profiles LOOP
  INSERT INTO ledger_accounts(account_key,kind,profile_id,unit) VALUES('customer:'||r.id||':TEST_USDC','CUSTOMER_CREDITS',r.id,'TEST_USDC') RETURNING id INTO own;
  SELECT id INTO clearing FROM ledger_accounts WHERE account_key='platform:TEST_USDC:TREASURY_CLEARING';
  IF r.credits>0 THEN PERFORM post_ledger_transfer('migration:customer:'||r.id,clearing,own,r.credits,'TEST_USDC',NULL,'legacy-customer',r.id::text,'{"legacy":true}',r.created_at); END IF;
 END LOOP;
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
CREATE INDEX ledger_business_time ON ledger_entries(business_id,created_at DESC);
CREATE INDEX journal_business_time ON ledger_transactions(business_id,created_at DESC);
CREATE INDEX job_business_time ON jobs(business_id,created_at DESC);
CREATE INDEX postings_account ON ledger_postings(account_id,transaction_id);
CREATE TABLE business_watchlist(profile_id uuid REFERENCES profiles(id),business_id uuid REFERENCES businesses(id),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(profile_id,business_id));
ALTER TABLE notifications ADD COLUMN event_type text NOT NULL DEFAULT 'notice';
ALTER TABLE notifications ADD COLUMN href text NOT NULL DEFAULT '/dashboard?tab=Notifications';
ALTER TABLE notifications ADD COLUMN dedupe_key text UNIQUE;
CREATE INDEX notifications_unread ON notifications(profile_id,read_at,created_at DESC);
CREATE TABLE business_config_history(id bigserial PRIMARY KEY,business_id uuid NOT NULL REFERENCES businesses(id),profile_id uuid NOT NULL REFERENCES profiles(id),previous jsonb NOT NULL,current jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE treasury_fee_receipts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),business_id uuid NOT NULL REFERENCES businesses(id),provider text NOT NULL,network text NOT NULL,reference text NOT NULL UNIQUE,amount bigint NOT NULL CHECK(amount>0),unit text NOT NULL,policy jsonb NOT NULL,phase text NOT NULL,evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['businesses','ledger_accounts','ledger_transactions','ledger_postings','business_watchlist','business_config_history','treasury_fee_receipts'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); END LOOP; END $$;
-- The trusted backend owns financial writes. No browser/public journal grants.

CREATE TABLE economy_snapshots(observed_at date NOT NULL DEFAULT current_date,unit text NOT NULL,active_businesses integer NOT NULL,sustaining_businesses integer NOT NULL,PRIMARY KEY(observed_at,unit));
ALTER TABLE economy_snapshots ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION check_account_balance() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE actual bigint; cached bigint; BEGIN
 SELECT COALESCE(sum(CASE direction WHEN 'credit' THEN amount ELSE -amount END),0) INTO actual FROM ledger_postings WHERE account_id=NEW.id;
 SELECT balance INTO cached FROM ledger_accounts WHERE id=NEW.id;
 IF actual<>cached THEN RAISE EXCEPTION 'Account balance must match journal postings'; END IF; RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER account_matches_journal AFTER INSERT OR UPDATE ON ledger_accounts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_account_balance();
CREATE FUNCTION validate_posting() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE t ledger_transactions; a ledger_accounts; BEGIN
 SELECT * INTO t FROM ledger_transactions WHERE id=NEW.transaction_id; SELECT * INTO a FROM ledger_accounts WHERE id=NEW.account_id;
 IF NEW.amount<>t.amount OR a.unit<>t.unit OR NEW.account_id<>(CASE NEW.direction WHEN 'debit' THEN t.debit_account ELSE t.credit_account END) THEN RAISE EXCEPTION 'Posting must match its transaction'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER correct_posting BEFORE INSERT ON ledger_postings FOR EACH ROW EXECUTE FUNCTION validate_posting();
SET CONSTRAINTS ALL DEFERRED;
-- Existing open reservations were already deducted from legacy balances. Restore
-- their escrow backing without debiting the original payer a second time.
DO $$ DECLARE r record; clearing uuid; escrow uuid; debit uuid; BEGIN
 SELECT id INTO clearing FROM ledger_accounts WHERE account_key='platform:TEST_USDC:TREASURY_CLEARING';
 FOR r IN SELECT p.*,q.requester_agent_id,q.requester_profile_id FROM payments p JOIN service_requests q ON q.payment_id=p.id WHERE p.status='reserved' AND p.network='sandbox' LOOP
  SELECT id INTO debit FROM ledger_accounts WHERE account_key=CASE WHEN r.requester_agent_id IS NULL THEN 'customer:'||r.requester_profile_id||':TEST_USDC' ELSE 'business:'||r.requester_agent_id||':BUSINESS_COMPUTE:TEST_USDC' END;
  INSERT INTO ledger_accounts(account_key,kind,unit) VALUES('escrow:'||r.id||':TEST_USDC','SETTLEMENT_ESCROW','TEST_USDC') RETURNING id INTO escrow;
  PERFORM post_ledger_transfer('migration:reserve:'||r.id,clearing,escrow,r.amount,'TEST_USDC',NULL,'legacy-reservation',r.id::text,'{"legacy":true}',r.created_at);
  UPDATE payments SET debit_account=debit,escrow_account=escrow WHERE id=r.id;
 END LOOP;
 FOR r IN SELECT * FROM work_offers WHERE status='open' AND escrow_held LOOP
  SELECT id INTO debit FROM ledger_accounts WHERE account_key=CASE WHEN r.requester_agent_id IS NULL THEN 'customer:'||r.creator_profile_id||':TEST_USDC' ELSE 'business:'||r.requester_agent_id||':BUSINESS_COMPUTE:TEST_USDC' END;
  INSERT INTO ledger_accounts(account_key,kind,unit) VALUES('escrow:work:'||r.id||':TEST_USDC','SETTLEMENT_ESCROW','TEST_USDC') RETURNING id INTO escrow;
  PERFORM post_ledger_transfer('migration:work:'||r.id,clearing,escrow,r.budget_amount,'TEST_USDC',NULL,'legacy-work-reservation',r.id::text,'{"legacy":true}',r.created_at);
  UPDATE work_offers SET debit_account=debit,escrow_account=escrow WHERE id=r.id;
 END LOOP;
END $$;

SET CONSTRAINTS ALL IMMEDIATE;
CREATE FUNCTION preserve_ledger_account() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.account_key IS DISTINCT FROM OLD.account_key OR NEW.kind IS DISTINCT FROM OLD.kind OR NEW.unit IS DISTINCT FROM OLD.unit OR NEW.business_id IS DISTINCT FROM OLD.business_id OR NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN RAISE EXCEPTION 'Ledger account identity is immutable'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER immutable_account_identity BEFORE UPDATE ON ledger_accounts FOR EACH ROW EXECUTE FUNCTION preserve_ledger_account();

SET CONSTRAINTS ALL DEFERRED;
