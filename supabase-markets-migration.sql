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

-- Success message
SELECT 'Markets tables created successfully!' AS status;

