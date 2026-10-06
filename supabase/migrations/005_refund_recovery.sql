CREATE TABLE refund_attempts (
  payment_id uuid PRIMARY KEY REFERENCES payments(id),
  wire_transaction text NOT NULL,
  signature text NOT NULL UNIQUE,
  last_valid_block_height bigint NOT NULL,
  status text NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','confirmed','failed')),
  last_error text,
  prior_attempts jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE refund_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ADD COLUMN refund_signature text UNIQUE;
