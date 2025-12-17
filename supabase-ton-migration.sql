-- ============================================
-- Polygram TON Wallet Support Migration
-- Run this in your Supabase SQL Editor
-- ============================================

-- Add TON wallet address column to custody_wallets table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'custody_wallets' AND column_name = 'ton_address') THEN
    ALTER TABLE custody_wallets ADD COLUMN ton_address text;
    RAISE NOTICE 'Added ton_address column to custody_wallets';
  ELSE
    RAISE NOTICE 'ton_address column already exists in custody_wallets';
  END IF;
END $$;

-- Add TON balance column to user_balances table
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'user_balances' AND column_name = 'ton_balance') THEN
    ALTER TABLE user_balances ADD COLUMN ton_balance numeric DEFAULT 0;
    RAISE NOTICE 'Added ton_balance column to user_balances';
  ELSE
    RAISE NOTICE 'ton_balance column already exists in user_balances';
  END IF;
END $$;

-- Create bridge_transactions table for tracking bridge operations
CREATE TABLE IF NOT EXISTS bridge_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  bridge_type text NOT NULL, -- 'other_to_ton' or 'ton_to_polygon'
  source_network text NOT NULL, -- e.g., 'ethereum', 'ton'
  destination_network text NOT NULL, -- e.g., 'ton', 'polygon'
  source_token text, -- e.g., 'ETH', 'USDC', 'TON'
  destination_token text, -- e.g., 'TON', 'USDC'
  amount numeric NOT NULL,
  bridge_provider text, -- e.g., 'stargate', 'symbiosis', 'meson'
  transaction_hash text,
  bridge_transaction_id text, -- Bridge provider's transaction ID
  status text DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  error_message text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create indexes for bridge_transactions
CREATE INDEX IF NOT EXISTS bridge_transactions_user_id_idx ON bridge_transactions(user_id);
CREATE INDEX IF NOT EXISTS bridge_transactions_status_idx ON bridge_transactions(status);
CREATE INDEX IF NOT EXISTS bridge_transactions_bridge_transaction_id_idx ON bridge_transactions(bridge_transaction_id);

-- Enable RLS on bridge_transactions
ALTER TABLE bridge_transactions ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for bridge_transactions
DROP POLICY IF EXISTS "Service role full access bridge_transactions" ON bridge_transactions;
CREATE POLICY "Service role full access bridge_transactions"
  ON bridge_transactions FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  )
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  );

-- Create trigger for auto-updating updated_at on bridge_transactions
DROP TRIGGER IF EXISTS update_bridge_transactions_updated_at ON bridge_transactions;
CREATE TRIGGER update_bridge_transactions_updated_at
  BEFORE UPDATE ON bridge_transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON bridge_transactions TO service_role;

-- Success message
SELECT 'TON wallet support migration completed successfully!' AS status;
