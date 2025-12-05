# Wallet System - Telegram User ID Integration

## How It Works

### 1. User Identification
- Each user is identified by their **Telegram User ID**
- The Telegram User ID is extracted from `window.Telegram.WebApp.initDataUnsafe.user.id`
- This ID is unique per Telegram user and persists across sessions

### 2. Wallet Creation Flow

1. **User opens app** → Frontend calls `initTelegram()`
2. **Telegram ID extracted** → Stored in `state.telegramId`
3. **Wallet API called** → `/api/wallet?telegram_id={telegramId}`
4. **API checks Supabase** → Looks for existing wallet with `user_id = telegramId`
5. **If exists** → Returns existing wallet addresses
6. **If not exists** → Creates new wallet and saves to Supabase with `user_id = telegramId`

### 3. Database Storage

Wallets are stored in Supabase `custody_wallets` table:

```sql
user_id (text) - Telegram User ID (UNIQUE, PRIMARY KEY)
polygon_address (text) - Polygon wallet address
polygon_secret_enc (text) - Encrypted private key
solana_address (text) - Solana wallet address  
solana_secret_enc (text) - Encrypted private key
```

**Key Points:**
- `user_id` is the Telegram User ID (e.g., "123456789")
- Each Telegram user gets exactly ONE wallet (enforced by UNIQUE constraint)
- Wallets are retrieved by matching `user_id = telegramId`

### 4. Balance Storage

Balances are stored in `user_balances` table:

```sql
user_id (text) - Telegram User ID (UNIQUE, PRIMARY KEY)
usdc_available (numeric) - Available USDC balance
usdc_locked (numeric) - Locked USDC (in positions)
sol_balance (numeric) - SOL balance
```

### 5. Positions Storage

Trades/positions are stored in `positions` table:

```sql
user_id (text) - Telegram User ID (indexed for fast queries)
market_id (text) - Market identifier
side (text) - 'yes' or 'no'
shares (numeric) - Number of shares
current_value (numeric) - Current position value
```

## Verification

### Check Wallet Creation

1. **Create a wallet via API:**
   ```bash
   curl "https://your-app.vercel.app/api/wallet?telegram_id=123456789"
   ```

2. **Check Supabase:**
   - Go to Supabase → Table Editor → `custody_wallets`
   - Look for row where `user_id = '123456789'`
   - Verify wallet addresses are stored

3. **Check Balance Record:**
   - Go to `user_balances` table
   - Look for row where `user_id = '123456789'`
   - Should have initial balance of 0

### Test Multiple Users

1. **User 1:**
   ```bash
   curl "https://your-app.vercel.app/api/wallet?telegram_id=111111111"
   ```

2. **User 2:**
   ```bash
   curl "https://your-app.vercel.app/api/wallet?telegram_id=222222222"
   ```

3. **Verify in Supabase:**
   - Should see TWO separate rows in `custody_wallets`
   - Each with different `user_id` and different wallet addresses
   - Each user gets their own unique wallet

## Security

- **User Isolation**: Each Telegram user can only access their own wallet
- **Unique Wallets**: Database UNIQUE constraint ensures one wallet per user
- **Encrypted Keys**: Private keys are encrypted before storage
- **RLS Policies**: Row Level Security (if enabled) provides additional protection

## Troubleshooting

### "Wallet already exists" error
- This is normal - means user already has a wallet
- API will return the existing wallet instead of creating a new one

### Multiple wallets for same user
- Should not happen due to UNIQUE constraint
- If it does, check for data integrity issues

### Wallet not found
- Verify Telegram User ID is being passed correctly
- Check Supabase for the `user_id` value
- Ensure user_id matches exactly (case-sensitive)

## Example Flow

```
User A (Telegram ID: 123456789)
  → Opens app
  → Wallet API called with telegram_id=123456789
  → Supabase: Check for user_id='123456789'
  → Not found → Create new wallet
  → Save to Supabase with user_id='123456789'
  → Return wallet addresses

User A (Telegram ID: 123456789) - Next login
  → Opens app
  → Wallet API called with telegram_id=123456789
  → Supabase: Check for user_id='123456789'
  → Found → Return existing wallet addresses
  → Same wallet addresses as before

User B (Telegram ID: 987654321)
  → Opens app
  → Wallet API called with telegram_id=987654321
  → Supabase: Check for user_id='987654321'
  → Not found → Create new wallet
  → Save to Supabase with user_id='987654321'
  → Different wallet addresses than User A
```

## Summary

✅ **Each Telegram user gets ONE unique wallet**  
✅ **Wallet is stored with Telegram User ID as the key**  
✅ **Wallets persist across sessions**  
✅ **Each user's data is isolated**  
✅ **Automatic wallet creation on first use**

