# Polygram

Telegram Mini App for trading on Polymarket with custodial wallets.

## Setup

### 1. Create Supabase Tables

Run this SQL in your Supabase SQL Editor:

```sql
-- Custody wallets table (supports both Solana and Polygon)
CREATE TABLE IF NOT EXISTS custody_wallets (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text UNIQUE NOT NULL,
  polygon_address text NOT NULL,
  polygon_secret_enc text NOT NULL,
  solana_address text,
  solana_secret_enc text,
  clob_api_key_enc text,
  clob_api_secret_enc text,
  clob_api_passphrase_enc text,
  clob_registered boolean DEFAULT false,
  usdc_approved boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add Solana columns if table already exists
ALTER TABLE custody_wallets ADD COLUMN IF NOT EXISTS solana_address text;
ALTER TABLE custody_wallets ADD COLUMN IF NOT EXISTS solana_secret_enc text;

-- User balances table
CREATE TABLE IF NOT EXISTS user_balances (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text UNIQUE NOT NULL,
  usdc_available numeric DEFAULT 0,
  usdc_locked numeric DEFAULT 0,
  sol_balance numeric DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

-- Add sol_balance column if table already exists
ALTER TABLE user_balances ADD COLUMN IF NOT EXISTS sol_balance numeric DEFAULT 0;

-- Positions table
CREATE TABLE IF NOT EXISTS positions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id text NOT NULL,
  market_id text,
  market_slug text,
  clob_token_id text,
  side text,
  shares numeric DEFAULT 0,
  avg_price numeric,
  current_value numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS custody_wallets_user_id_idx ON custody_wallets(user_id);
CREATE INDEX IF NOT EXISTS user_balances_user_id_idx ON user_balances(user_id);
CREATE INDEX IF NOT EXISTS positions_user_id_idx ON positions(user_id);
```

### 2. Set Environment Variables in Vercel

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJI...  (use service_role key)
WALLET_ENCRYPTION_KEY=any-random-32-character-string
POLYGON_RPC=https://polygon-rpc.com
```

### 3. Deploy to Vercel

Via GitHub:
1. Push this repo to GitHub
2. Connect to Vercel
3. Deploy

Via CLI:
```bash
npm install -g vercel
vercel --prod
```

### 4. Test

1. Visit: `https://your-app.vercel.app/api/test`
   - Should return `{"ok":true,...}`

2. Visit: `https://your-app.vercel.app/api/markets?kind=trending&limit=5`
   - Should return Polymarket data

3. Main app: `https://your-app.vercel.app/?bypass=true`
   - Bypasses passkey for testing

## Passkeys

Valid passkeys: `EARLYBIRD`, `POLYGRAM2024`, `TRADEPRO`, `BETAACCESS`, `PUBLICLABS`

Edit in `index.html` to change.

## Project Structure

```
/
├── index.html          # Frontend
├── api/
│   ├── test.js         # Health check
│   ├── markets.js      # Polymarket Gamma API
│   ├── wallet.js       # Wallet management
│   └── balances.js     # Balance queries
├── vercel.json         # Vercel config
└── package.json
```
