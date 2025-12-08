# Database-Backed Architecture

This app now uses a database-backed architecture that mimics Polymarket's structure while keeping the same UI/UX.

## Architecture Overview

```
┌─────────────┐
│   Frontend  │ (Same UI/UX - no changes)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  /api/markets│
└──────┬──────┘
       │
       ├───► Try Supabase Database (fast, cached)
       │     └─► If data < 5 min old → return
       │
       └───► Fallback to Polymarket API (if DB empty/old)
             └─► Return live data
```

## Setup

### 1. Run Database Migration

Execute the SQL migration in your Supabase SQL Editor:

```sql
-- Run: supabase-markets-migration.sql
```

This creates:
- `markets` table - stores all market data
- `market_events` table - stores event data
- Indexes for performance
- RLS policies

### 2. Sync Markets

Call the sync endpoint to populate the database:

```bash
# Sync all categories
GET /api/sync-markets?full=true

# Sync specific category
GET /api/sync-markets?category=politics

# Incremental sync (default)
GET /api/sync-markets
```

### 3. Set Up Cron Job (Optional)

For automatic syncing, set up a cron job:

**Vercel Cron:**
```json
// vercel.json
{
  "crons": [{
    "path": "/api/sync-markets?full=true",
    "schedule": "*/5 * * * *"  // Every 5 minutes
  }]
}
```

**External Cron (cron-job.org, etc.):**
```
URL: https://your-app.vercel.app/api/sync-markets?full=true
Schedule: Every 5 minutes
```

## How It Works

### Market Fetching Flow

1. **Frontend Request**: User clicks a category
2. **API Check**: `/api/markets` checks Supabase first
3. **Database Query**: 
   - Fetches markets synced within last 5 minutes
   - Filters by category, active, closed status
   - Orders by volume
4. **Fallback**: If DB is empty/old, fetches from Polymarket API
5. **Response**: Returns markets in same format (UI unchanged)

### Sync Process

1. **Fetch Events**: Gets events from Polymarket `/events` endpoint
2. **Filter by Category**: Matches events by tag IDs
3. **Extract Markets**: Pulls markets from matching events
4. **Upsert to DB**: Stores/updates markets and events
5. **Track Sync Time**: Records `synced_at` timestamp

## Benefits

✅ **Faster Responses**: Database queries are faster than API calls  
✅ **More Reliable**: Works even if Polymarket API is down  
✅ **Reduced API Calls**: Only syncs periodically, not on every request  
✅ **Better Rate Limiting**: Avoids hitting Polymarket rate limits  
✅ **Same UI/UX**: Frontend code unchanged - transparent to users  

## Database Schema

### Markets Table
- Stores all market data (question, prices, volume, etc.)
- Links to events via `event_id`
- Categorized by `category` field
- Indexed for fast queries

### Market Events Table
- Stores event metadata
- Contains tags for filtering
- Links to markets via `id`

## Monitoring

Check sync status:
```bash
GET /api/sync-markets?category=politics
# Returns: { synced_markets: 150, synced_events: 25 }
```

Check database freshness:
```sql
SELECT 
  category, 
  COUNT(*) as market_count,
  MAX(synced_at) as last_sync
FROM markets
GROUP BY category
ORDER BY last_sync DESC;
```

## Troubleshooting

**No markets showing:**
1. Check if database is populated: `SELECT COUNT(*) FROM markets;`
2. Run sync: `GET /api/sync-markets?full=true`
3. Check sync logs for errors

**Stale data:**
- Sync runs every 5 minutes by default
- Adjust cron schedule if needed
- Check `synced_at` timestamps

**Database errors:**
- Verify Supabase connection in `/api/test`
- Check RLS policies are set correctly
- Ensure service_role key has access

