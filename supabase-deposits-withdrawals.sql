-- ============================================
-- Deposits and Withdrawals Schema
-- Epic 3.1: Deposit Funds from TON
-- Epic 5.1: Withdraw Funds to TON
-- ============================================

-- TON Deposits table
CREATE TABLE IF NOT EXISTS ton_deposits (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  ton_address text NOT NULL, -- User's TON address
  ton_tx_hash text UNIQUE NOT NULL,
  amount_ton numeric NOT NULL, -- Amount in TON
  amount_usdc numeric, -- Converted USDC amount (after bridge)
  status text DEFAULT 'pending', -- 'pending', 'confirmed', 'bridging', 'completed', 'failed'
  confirmations integer DEFAULT 0,
  required_confirmations integer DEFAULT 1, -- Minimum confirmations needed
  bridge_tx_hash text, -- Bridge transaction hash (TON -> Polygon USDC)
  polygon_tx_hash text, -- Final Polygon USDC deposit tx hash
  error_message text,
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  completed_at timestamptz
);

-- Create indexes for deposits
CREATE INDEX IF NOT EXISTS ton_deposits_user_id_idx ON ton_deposits(user_id);
CREATE INDEX IF NOT EXISTS ton_deposits_status_idx ON ton_deposits(status);
CREATE INDEX IF NOT EXISTS ton_deposits_ton_tx_hash_idx ON ton_deposits(ton_tx_hash);
CREATE INDEX IF NOT EXISTS ton_deposits_created_at_idx ON ton_deposits(created_at);

-- Enable RLS on deposits
ALTER TABLE ton_deposits ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for deposits
DROP POLICY IF EXISTS "Service role full access ton_deposits" ON ton_deposits;
CREATE POLICY "Service role full access ton_deposits"
  ON ton_deposits FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  );

-- Withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  request_id text UNIQUE NOT NULL, -- Unique request ID for tracking
  amount_usdc numeric NOT NULL, -- Amount to withdraw in USDC
  amount_ton numeric, -- Amount after conversion to TON
  ton_destination_address text NOT NULL,
  status text DEFAULT 'pending', -- 'pending', 'processing', 'bridging', 'completed', 'failed', 'cancelled'
  polygon_tx_hash text, -- Polygon USDC withdrawal tx
  bridge_tx_hash text, -- Bridge transaction (Polygon USDC -> TON)
  ton_tx_hash text, -- Final TON payout tx
  conversion_rate numeric, -- USDC to TON conversion rate
  fees_usdc numeric DEFAULT 0, -- Withdrawal fees in USDC
  fees_ton numeric DEFAULT 0, -- Bridge fees in TON
  error_message text,
  risk_check_passed boolean DEFAULT false,
  risk_check_details jsonb, -- Details of risk checks performed
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  completed_at timestamptz
);

-- Create indexes for withdrawals
CREATE INDEX IF NOT EXISTS withdrawals_user_id_idx ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx ON withdrawals(status);
CREATE INDEX IF NOT EXISTS withdrawals_request_id_idx ON withdrawals(request_id);
CREATE INDEX IF NOT EXISTS withdrawals_created_at_idx ON withdrawals(created_at);

-- Enable RLS on withdrawals
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for withdrawals
DROP POLICY IF EXISTS "Service role full access withdrawals" ON withdrawals;
CREATE POLICY "Service role full access withdrawals"
  ON withdrawals FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  );

-- Withdrawal address confirmations table (Epic 5.2: Secure Withdrawal Controls)
CREATE TABLE IF NOT EXISTS withdrawal_address_confirmations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  ton_address text NOT NULL,
  signature text NOT NULL, -- TON signature confirming address ownership
  public_key text, -- Public key used for signature
  confirmed_at timestamptz DEFAULT now(),
  expires_at timestamptz, -- Address confirmation expires after some time
  is_active boolean DEFAULT true
);

-- Create indexes for address confirmations
CREATE INDEX IF NOT EXISTS withdrawal_address_confirmations_user_id_idx ON withdrawal_address_confirmations(user_id);
CREATE INDEX IF NOT EXISTS withdrawal_address_confirmations_ton_address_idx ON withdrawal_address_confirmations(ton_address);

-- Enable RLS on address confirmations
ALTER TABLE withdrawal_address_confirmations ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for address confirmations
DROP POLICY IF EXISTS "Service role full access withdrawal_address_confirmations" ON withdrawal_address_confirmations;
CREATE POLICY "Service role full access withdrawal_address_confirmations"
  ON withdrawal_address_confirmations FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  );

-- Grant permissions
GRANT ALL ON ton_deposits TO service_role;
GRANT ALL ON withdrawals TO service_role;
GRANT ALL ON withdrawal_address_confirmations TO service_role;

-- Success message
SELECT 'Deposits and withdrawals schema created successfully!' AS status;
