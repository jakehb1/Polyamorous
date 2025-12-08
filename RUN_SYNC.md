# Running the Migration and Sync

## ✅ Migration Status

The database migration has been **successfully applied** to your Supabase project!

The following tables have been created:
- `markets` - Stores market data from Polymarket
- `market_events` - Stores event data
- `categories` - Stores category/tag data
- `market_price_history` - Tracks price snapshots over time

## 🔄 Next Step: Run the Sync

To populate the database with market data, you need to call the sync endpoint:

### Option 1: Using Production URL (if deployed)

```bash
curl "https://your-app.vercel.app/api/sync-markets?full=true&sync_categories=true"
```

### Option 2: Using Local Server

1. **Start the server:**
   ```bash
   npm run dev
   ```

2. **In another terminal, run the sync:**
   ```bash
   curl "http://localhost:3000/api/sync-markets?full=true&sync_categories=true"
   ```

### Option 3: Using Browser

Visit in your browser:
```
https://your-app.vercel.app/api/sync-markets?full=true&sync_categories=true
```

## 📊 Sync Options

- **Full sync (all categories):**
  ```
  /api/sync-markets?full=true&sync_categories=true
  ```

- **Sync specific category:**
  ```
  /api/sync-markets?category=politics&sync_categories=true
  ```

- **Sync categories only:**
  ```
  /api/sync-markets?sync_categories=true
  ```

## ⏱️ Expected Duration

- **Full sync:** 5-10 minutes (syncs all categories)
- **Single category:** 1-2 minutes
- **Categories only:** 30 seconds

## ✅ Verification

After sync completes, verify data in Supabase:

```sql
-- Check markets count
SELECT COUNT(*) FROM markets;

-- Check price history
SELECT COUNT(*) FROM market_price_history;

-- Check categories
SELECT COUNT(*) FROM categories;

-- View recent price history
SELECT * FROM market_price_history 
ORDER BY timestamp DESC 
LIMIT 10;
```

## 🔄 Automatic Syncing

For production, set up a cron job to sync every 5 minutes:

```bash
# Example cron (every 5 minutes)
*/5 * * * * curl "https://your-app.vercel.app/api/sync-markets?full=true"
```

Or use Vercel Cron Jobs:
```json
{
  "crons": [{
    "path": "/api/sync-markets?full=true",
    "schedule": "*/5 * * * *"
  }]
}
```

## 📝 Notes

- First sync will take longer as it populates all tables
- Price tracking begins immediately after first sync
- Historical graphs will show real data after a few syncs
- Database auto-cleans price history older than 90 days

