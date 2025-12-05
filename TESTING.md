# Testing Guide

## Quick Test

### 1. Test Health Check Endpoint

```bash
# Local
curl http://localhost:3000/api/test

# Production
curl https://your-app.vercel.app/api/test
```

Expected response:
```json
{
  "ok": true,
  "supabase": {
    "configured": true,
    "connected": true
  },
  "encryption": {
    "keySet": true,
    "valid": true
  }
}
```

### 2. Run Full Test Suite

```bash
# Install dependencies (if not already)
npm install

# Test against local server
npm run test:local

# Test against production (update URL first)
npm run test:prod

# Or test against any URL
TEST_URL=https://your-app.vercel.app node test-setup.js
```

## Manual Testing

### Test Wallet Creation

```bash
curl "https://your-app.vercel.app/api/wallet?telegram_id=test_user_123"
```

Expected:
- Status: 200
- `success: true`
- `wallet.polygon` and `wallet.solana` addresses
- `isNew: true` (first time) or `isNew: false` (subsequent calls)

### Test Wallet Retrieval

```bash
# Call again with same user_id
curl "https://your-app.vercel.app/api/wallet?telegram_id=test_user_123"
```

Expected:
- Status: 200
- `isNew: false` (should retrieve existing wallet)
- Same addresses as before

### Test Balances

```bash
curl "https://your-app.vercel.app/api/balances?telegram_id=test_user_123"
```

Expected:
- Status: 200
- `success: true`
- `usdc`, `sol`, `positions`, `total` values
- `walletStatus.exists: true`

### Test Markets

```bash
curl "https://your-app.vercel.app/api/markets?kind=trending&limit=5"
```

Expected:
- Status: 200
- `markets` array with market data

## Verify Supabase Setup

### 1. Check Tables Exist

In Supabase Dashboard → Table Editor:
- ✅ `custody_wallets` table exists
- ✅ `user_balances` table exists
- ✅ `positions` table exists

### 2. Check RLS is Enabled

In Supabase Dashboard → Table Editor:
- Each table should show "RLS enabled" badge
- If you see "RLS disabled", run the setup SQL again

### 3. Verify Wallet Creation

1. Create a test wallet via API
2. Go to Supabase → Table Editor → `custody_wallets`
3. You should see a new row with:
   - `user_id` matching your test user
   - `polygon_address` and `solana_address` populated
   - `polygon_secret_enc` and `solana_secret_enc` encrypted (not plain text)

### 4. Verify Balance Record

1. After creating wallet, check `user_balances` table
2. Should see a row with:
   - `user_id` matching your test user
   - `usdc_available: 0`
   - `usdc_locked: 0`
   - `sol_balance: 0`

## Troubleshooting

### "ENCRYPTION_KEY is required" error

**Problem**: Encryption key not set or invalid

**Solution**:
```bash
# Generate a key
openssl rand -hex 32

# Set in Vercel
# Settings → Environment Variables → Add ENCRYPTION_KEY
```

### "Supabase not configured" error

**Problem**: Supabase credentials missing

**Solution**:
1. Get your Supabase URL and service_role key
2. Set in Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`

### "RLS disabled" warning

**Problem**: Row Level Security not enabled

**Solution**:
1. Run `supabase-setup.sql` in Supabase SQL Editor
2. Or manually enable:
   ```sql
   ALTER TABLE custody_wallets ENABLE ROW LEVEL SECURITY;
   ALTER TABLE user_balances ENABLE ROW LEVEL SECURITY;
   ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
   ```

### Wallet creation returns error

**Problem**: Database connection or permissions issue

**Solution**:
1. Verify `SUPABASE_SERVICE_KEY` is the `service_role` key (not `anon`)
2. Check Supabase logs for errors
3. Verify tables exist and have correct schema
4. Test Supabase connection in Supabase dashboard

### Balance query returns 0

**Problem**: Wallet not found or not funded

**Solution**:
1. Verify wallet was created (check `custody_wallets` table)
2. If wallet exists but balance is 0, that's normal for new wallets
3. Fund the wallet with USDC on Polygon to see balance update

## Test Checklist

Before deploying to production:

- [ ] Health check endpoint returns `ok: true`
- [ ] Supabase connection test passes
- [ ] Wallet creation works
- [ ] Wallet retrieval works (same user_id returns existing wallet)
- [ ] Balance query works
- [ ] Markets API works
- [ ] Wallet appears in Supabase `custody_wallets` table
- [ ] Balance record appears in `user_balances` table
- [ ] RLS is enabled on all tables
- [ ] Encryption key is set and valid (64 hex chars)
- [ ] Private keys are encrypted in database (not plain text)

## Continuous Testing

For ongoing testing, you can:

1. **Set up monitoring**: Use Vercel Analytics or external monitoring
2. **Health checks**: Set up cron job to ping `/api/test` endpoint
3. **Error tracking**: Integrate Sentry or similar for error monitoring
4. **Database monitoring**: Monitor Supabase usage and performance

