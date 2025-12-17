-- ============================================
-- Epic 6.2: Transaction History / Ledger System
-- Complete audit trail for all user transactions
-- ============================================

-- Main ledger table - tracks all transaction types
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  entry_type text NOT NULL, -- 'deposit', 'withdrawal', 'trade', 'bridge', 'fee', 'payout'
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'USDC', -- 'USDC', 'TON', 'SOL'
  direction text NOT NULL, -- 'credit' or 'debit'
  status text DEFAULT 'pending', -- 'pending', 'completed', 'failed', 'cancelled'
  
  -- Transaction references
  deposit_id uuid REFERENCES ton_deposits(id),
  withdrawal_id uuid REFERENCES withdrawals(id),
  trade_id text, -- References trades/positions
  
  -- Transaction hashes (for on-chain verification)
  source_tx_hash text, -- TON tx hash for deposits, Polygon tx for trades
  destination_tx_hash text, -- Polygon tx for deposits, TON tx for withdrawals
  bridge_tx_hash text, -- Bridge transaction hash
  
  -- Metadata (JSONB for flexibility)
  metadata jsonb, -- Additional data: market_id, outcome, price, fees, etc.
  
  -- Balances at time of transaction
  balance_before numeric,
  balance_after numeric,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  failed_at timestamptz,
  
  -- Error tracking
  error_message text,
  retry_count integer DEFAULT 0
);

-- Create indexes for ledger queries
CREATE INDEX IF NOT EXISTS ledger_entries_user_id_idx ON ledger_entries(user_id);
CREATE INDEX IF NOT EXISTS ledger_entries_entry_type_idx ON ledger_entries(entry_type);
CREATE INDEX IF NOT EXISTS ledger_entries_status_idx ON ledger_entries(status);
CREATE INDEX IF NOT EXISTS ledger_entries_created_at_idx ON ledger_entries(created_at);
CREATE INDEX IF NOT EXISTS ledger_entries_user_type_created_idx ON ledger_entries(user_id, entry_type, created_at DESC);
CREATE INDEX IF NOT EXISTS ledger_entries_deposit_id_idx ON ledger_entries(deposit_id);
CREATE INDEX IF NOT EXISTS ledger_entries_withdrawal_id_idx ON ledger_entries(withdrawal_id);

-- Enable RLS on ledger
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for ledger
DROP POLICY IF EXISTS "Service role full access ledger_entries" ON ledger_entries;
CREATE POLICY "Service role full access ledger_entries"
  ON ledger_entries FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  );

-- Grant permissions
GRANT ALL ON ledger_entries TO service_role;

-- Function to create ledger entry (helper for consistency)
CREATE OR REPLACE FUNCTION create_ledger_entry(
  p_user_id text,
  p_entry_type text,
  p_amount numeric,
  p_currency text DEFAULT 'USDC',
  p_direction text,
  p_status text DEFAULT 'pending',
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_deposit_id uuid DEFAULT NULL,
  p_withdrawal_id uuid DEFAULT NULL,
  p_trade_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_entry_id uuid;
  v_balance_before numeric;
  v_balance_after numeric;
BEGIN
  -- Get current balance
  SELECT usdc_available INTO v_balance_before
  FROM user_balances
  WHERE user_id = p_user_id;
  
  v_balance_before := COALESCE(v_balance_before, 0);
  
  -- Calculate balance after
  IF p_direction = 'credit' THEN
    v_balance_after := v_balance_before + p_amount;
  ELSE
    v_balance_after := v_balance_before - p_amount;
  END IF;
  
  -- Create ledger entry
  INSERT INTO ledger_entries (
    user_id,
    entry_type,
    amount,
    currency,
    direction,
    status,
    metadata,
    deposit_id,
    withdrawal_id,
    trade_id,
    balance_before,
    balance_after
  ) VALUES (
    p_user_id,
    p_entry_type,
    p_amount,
    p_currency,
    p_direction,
    p_status,
    p_metadata,
    p_deposit_id,
    p_withdrawal_id,
    p_trade_id,
    v_balance_before,
    v_balance_after
  ) RETURNING id INTO v_entry_id;
  
  RETURN v_entry_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION create_ledger_entry TO service_role;

-- Function to update ledger entry status
CREATE OR REPLACE FUNCTION update_ledger_entry_status(
  p_entry_id uuid,
  p_status text,
  p_tx_hash text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE ledger_entries
  SET 
    status = p_status,
    source_tx_hash = COALESCE(p_tx_hash, source_tx_hash),
    destination_tx_hash = CASE WHEN p_status = 'completed' THEN p_tx_hash ELSE destination_tx_hash END,
    error_message = COALESCE(p_error_message, error_message),
    completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE completed_at END,
    failed_at = CASE WHEN p_status = 'failed' THEN now() ELSE failed_at END
  WHERE id = p_entry_id;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION update_ledger_entry_status TO service_role;

-- Success message
SELECT 'Ledger system created successfully!' AS status;
