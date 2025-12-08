# Market Details Captured

This document outlines all market details that are captured and stored in the database for each market in each category.

## Market Data Structure

### Basic Information
- **id**: Polymarket market ID (primary key)
- **condition_id**: Polymarket condition ID
- **question**: Market question/title
- **slug**: URL-friendly identifier
- **description**: Market description

### Media Assets
- **image**: Market image URL
- **icon**: Market icon URL
- Falls back to event image/icon if market doesn't have one

### Outcomes & Pricing
- **outcomes**: Array of outcome strings (e.g., ["Yes", "No"], ["Team A", "Team B"])
- **outcome_prices**: Array of prices corresponding to outcomes (0-1 range)
- Both arrays are stored as JSONB for flexible querying

### Volume Metrics
- **volume**: Total volume (all time)
- **volume_24hr**: Volume in last 24 hours
- **volume_1wk**: Volume in last week
- **liquidity**: Current liquidity

### Market Status
- **active**: Whether market is active
- **closed**: Whether market is closed
- **resolved**: Whether market is resolved

### Event Information
Markets can belong to events (e.g., "Week 13 NFL Games"):
- **event_id**: Event ID
- **event_title**: Event title
- **event_slug**: Event slug
- **event_image**: Event image
- **event_start_date**: When event starts
- **event_end_date**: When event ends
- **event_tags**: Tags associated with event

### Category & Tags
- **category**: Main category (politics, finance, crypto, sports, etc.)
- **tag_ids**: Array of all tag IDs (from both event and market)
  - Ensures markets are properly categorized
  - Allows for multi-tag filtering

### Polymarket Metadata
- **resolution_source**: Source for market resolution
- **start_date**: Market start date
- **end_date**: Market end date
- **created_at_pm**: When market was created on Polymarket
- **updated_at_pm**: When market was last updated on Polymarket

### Tracking Fields
- **synced_at**: When we last synced this market
- **created_at**: When we first stored this market
- **updated_at**: When we last updated this market

## Price History

Each market also has price history tracked in `market_price_history` table:
- **market_id**: Reference to market
- **outcome_index**: Which outcome (0, 1, 2, etc.)
- **outcome_name**: Name of outcome
- **price**: Price at snapshot time
- **volume**: Volume at snapshot time
- **liquidity**: Liquidity at snapshot time
- **timestamp**: When snapshot was taken

## Sync Strategy

The sync process uses a **dual-fetch strategy** to ensure no markets are missed:

### 1. Event-Based Fetching
- Fetches events from `/events` endpoint
- Filters by category tag
- Extracts all markets from each event
- Captures event context (title, dates, tags)

### 2. Direct Market Fetching
- Fetches markets directly from `/markets` endpoint
- Filters by category tag
- Catches markets that might not be in events
- Ensures standalone markets are captured

### 3. Deduplication
- Markets are upserted by ID
- Prevents duplicates if market appears in both sources
- Event-based markets take precedence (have more context)

## Data Completeness

✅ **All active markets** in each category are captured  
✅ **All market details** from Polymarket API are stored  
✅ **Event context** is preserved for grouped markets  
✅ **Price history** is tracked for all markets  
✅ **Tag information** from both events and markets is captured  

## Usage

After sync, you can query markets with all details:

```sql
-- Get all markets in a category
SELECT * FROM markets WHERE category = 'politics';

-- Get markets with specific tags
SELECT * FROM markets 
WHERE tag_ids @> '[2]'::jsonb; -- Politics tag

-- Get markets with price history
SELECT m.*, COUNT(ph.id) as history_points
FROM markets m
LEFT JOIN market_price_history ph ON m.id = ph.market_id
GROUP BY m.id;
```

## Notes

- Markets are synced every 5 minutes (if cron is set up)
- Only active, non-closed markets are synced
- Price history accumulates over time
- Old price history (>90 days) is auto-cleaned

