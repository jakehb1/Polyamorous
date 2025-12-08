-- ============================================
-- Markets Table Migration
-- Adds markets storage to mimic Polymarket architecture
-- ============================================

-- Markets table - stores all market data from Polymarket
CREATE TABLE IF NOT EXISTS markets (
  id text PRIMARY KEY, -- Polymarket market ID
  condition_id text,
  question text NOT NULL,
  slug text,
  description text,
  
  -- Market metadata
  image text,
  icon text,
  outcomes jsonb, -- Array of outcome strings
  outcome_prices jsonb, -- Array of prices
  volume numeric DEFAULT 0,
  volume_24hr numeric DEFAULT 0,
  volume_1wk numeric DEFAULT 0,
  liquidity numeric DEFAULT 0,
  
  -- Market status
  active boolean DEFAULT true,
  closed boolean DEFAULT false,
  resolved boolean DEFAULT false,
  
  -- Event information (markets belong to events)
  event_id text,
  event_title text,
  event_slug text,
  event_image text,
  event_start_date timestamptz,
  event_end_date timestamptz,
  event_tags jsonb, -- Array of tag objects
  
  -- Category/tag information
  category text, -- Main category (politics, finance, crypto, etc.)
  tag_ids jsonb, -- Array of tag IDs this market belongs to
  
  -- Polymarket metadata
  resolution_source text,
  end_date timestamptz,
  start_date timestamptz,
  created_at_pm timestamptz, -- Created at on Polymarket
  updated_at_pm timestamptz, -- Updated at on Polymarket
  
  -- Our tracking
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Market events table - stores event data separately
CREATE TABLE IF NOT EXISTS market_events (
  id text PRIMARY KEY, -- Polymarket event ID
  title text NOT NULL,
  slug text,
  ticker text,
  description text,
  image text,
  icon text,
  
  -- Event metadata
  volume numeric DEFAULT 0,
  liquidity numeric DEFAULT 0,
  tags jsonb, -- Array of tag objects
  
  -- Dates
  start_date timestamptz,
  end_date timestamptz,
  closed boolean DEFAULT false,
  
  -- Our tracking
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS markets_category_idx ON markets(category);
CREATE INDEX IF NOT EXISTS markets_event_id_idx ON markets(event_id);
CREATE INDEX IF NOT EXISTS markets_active_closed_idx ON markets(active, closed);
CREATE INDEX IF NOT EXISTS markets_volume_24hr_idx ON markets(volume_24hr DESC);
CREATE INDEX IF NOT EXISTS markets_synced_at_idx ON markets(synced_at);
CREATE INDEX IF NOT EXISTS markets_tag_ids_idx ON markets USING GIN(tag_ids);
CREATE INDEX IF NOT EXISTS market_events_synced_at_idx ON market_events(synced_at);

-- Enable RLS
ALTER TABLE markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE market_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies (service_role has full access)
DROP POLICY IF EXISTS "Service role full access markets" ON markets;
CREATE POLICY "Service role full access markets"
  ON markets FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  )
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  );

DROP POLICY IF EXISTS "Service role full access market_events" ON market_events;
CREATE POLICY "Service role full access market_events"
  ON market_events FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  )
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  );

-- Auto-update triggers
DROP TRIGGER IF EXISTS update_markets_updated_at ON markets;
CREATE TRIGGER update_markets_updated_at
  BEFORE UPDATE ON markets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_market_events_updated_at ON market_events;
CREATE TRIGGER update_market_events_updated_at
  BEFORE UPDATE ON market_events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON markets TO service_role;
GRANT ALL ON market_events TO service_role;

-- Categories table - stores categories/tags from Polymarket
CREATE TABLE IF NOT EXISTS categories (
  id text PRIMARY KEY, -- Can be tag ID or custom ID (like "trending", "new")
  tag_id text, -- Polymarket tag ID (if applicable)
  label text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text,
  is_sort boolean DEFAULT false, -- true for sort modes like "trending", "new"
  is_category boolean DEFAULT false, -- true for actual categories
  description text,
  order_index integer DEFAULT 0, -- For custom ordering
  
  -- Polymarket metadata
  force_show boolean DEFAULT false,
  force_hide boolean DEFAULT false,
  published_at timestamptz,
  
  -- Our tracking
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for categories
CREATE INDEX IF NOT EXISTS categories_slug_idx ON categories(slug);
CREATE INDEX IF NOT EXISTS categories_tag_id_idx ON categories(tag_id);
CREATE INDEX IF NOT EXISTS categories_is_category_idx ON categories(is_category);
CREATE INDEX IF NOT EXISTS categories_is_sort_idx ON categories(is_sort);
CREATE INDEX IF NOT EXISTS categories_synced_at_idx ON categories(synced_at);
CREATE INDEX IF NOT EXISTS categories_order_idx ON categories(order_index);

-- Enable RLS
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Service role full access categories" ON categories;
CREATE POLICY "Service role full access categories"
  ON categories FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  )
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  );

-- Auto-update trigger
DROP TRIGGER IF EXISTS update_categories_updated_at ON categories;
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON categories TO service_role;

-- Market Price History table - tracks price changes over time
CREATE TABLE IF NOT EXISTS market_price_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  market_id text NOT NULL,
  condition_id text,
  outcome_index integer NOT NULL,
  outcome_name text,
  price numeric NOT NULL,
  volume numeric DEFAULT 0,
  liquidity numeric DEFAULT 0,
  timestamp timestamptz DEFAULT now(),
  
  -- Indexes for fast queries
  CONSTRAINT market_price_history_market_outcome_idx UNIQUE (market_id, outcome_index, timestamp)
);

-- Indexes for price history
CREATE INDEX IF NOT EXISTS market_price_history_market_id_idx ON market_price_history(market_id);
CREATE INDEX IF NOT EXISTS market_price_history_timestamp_idx ON market_price_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS market_price_history_market_timestamp_idx ON market_price_history(market_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS market_price_history_outcome_idx ON market_price_history(market_id, outcome_index, timestamp DESC);

-- Enable RLS
ALTER TABLE market_price_history ENABLE ROW LEVEL SECURITY;

-- RLS Policy
DROP POLICY IF EXISTS "Service role full access market_price_history" ON market_price_history;
CREATE POLICY "Service role full access market_price_history"
  ON market_price_history FOR ALL
  USING (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  )
  WITH CHECK (
    current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' OR
    current_setting('request.jwt.claims', true)::json IS NULL
  );

-- Auto-cleanup: Delete price history older than 90 days (optional, can be adjusted)
-- This prevents the table from growing indefinitely
CREATE OR REPLACE FUNCTION cleanup_old_price_history()
RETURNS void AS $$
BEGIN
  DELETE FROM market_price_history
  WHERE timestamp < now() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON market_price_history TO service_role;

-- Success message
SELECT 'Markets, categories, and price history tables created successfully!' AS status;

