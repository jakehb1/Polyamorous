// api/sync-markets.js
// Background job to sync markets from Polymarket to Supabase
// This mimics Polymarket's architecture by storing markets in our database

const GAMMA_API = "https://gamma-api.polymarket.com";

// Category tag IDs (verified from Polymarket events)
const CATEGORY_TAG_IDS = {
  'politics': 2,
  'finance': 120,
  'crypto': 21,
  'sports': 1,
  'tech': 1401,
  'geopolitics': 100265,
  'culture': 596,
  'world': 101970,
  'economy': 100328,
  'elections': 377,
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  
  // Optional: Add authentication/API key check for production
  // const apiKey = req.headers['x-api-key'];
  // if (apiKey !== process.env.SYNC_API_KEY) {
  //   return res.status(401).json({ error: "unauthorized" });
  // }

  const { category = null, full = false } = req.query;
  
  try {
    // Check Supabase connection
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ 
        error: "supabase_not_configured",
        message: "Supabase not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_KEY."
      });
    }

    const { createClient } = require("@supabase/supabase-js");
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    let syncedCount = 0;
    let eventCount = 0;

    if (category) {
      // Sync specific category
      const tagId = CATEGORY_TAG_IDS[category.toLowerCase()];
      if (!tagId) {
        return res.status(400).json({ error: "invalid_category", message: `Unknown category: ${category}` });
      }
      
      const result = await syncCategory(supabase, category, tagId, full);
      syncedCount = result.markets;
      eventCount = result.events;
    } else if (full) {
      // Full sync: all categories
      console.log("[sync-markets] Starting full sync of all categories...");
      for (const [cat, tagId] of Object.entries(CATEGORY_TAG_IDS)) {
        console.log(`[sync-markets] Syncing category: ${cat} (tag ID: ${tagId})`);
        const result = await syncCategory(supabase, cat, tagId, true);
        syncedCount += result.markets;
        eventCount += result.events;
      }
    } else {
      // Default: sync all categories (incremental)
      for (const [cat, tagId] of Object.entries(CATEGORY_TAG_IDS)) {
        const result = await syncCategory(supabase, cat, tagId, false);
        syncedCount += result.markets;
        eventCount += result.events;
      }
    }

    return res.status(200).json({
      success: true,
      synced_markets: syncedCount,
      synced_events: eventCount,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("[sync-markets] Error:", err);
    return res.status(500).json({
      error: "sync_failed",
      message: err.message
    });
  }
};

async function syncCategory(supabase, category, tagId, fullSync = false) {
  console.log(`[sync-markets] Syncing category: ${category} (tag ID: ${tagId})`);
  
  let marketsSynced = 0;
  let eventsSynced = 0;

  try {
    // Fetch events from Polymarket
    const eventsUrl = `${GAMMA_API}/events?closed=false&order=id&ascending=false&limit=5000`;
    const eventsResp = await fetch(eventsUrl);
    
    if (!eventsResp.ok) {
      throw new Error(`Events API returned ${eventsResp.status}`);
    }

    const events = await eventsResp.json();
    if (!Array.isArray(events)) {
      throw new Error("Events API returned non-array");
    }

    // Filter events by category tag
    const normalizedTagId = Number(tagId);
    const categoryEvents = events.filter(event => {
      const eventTags = event.tags || [];
      return eventTags.some(tag => {
        const tagId = typeof tag === 'object' ? tag.id : tag;
        return Number(tagId) === normalizedTagId;
      });
    });

    console.log(`[sync-markets] Found ${categoryEvents.length} events for ${category}`);

    // Sync events first
    for (const event of categoryEvents) {
      const eventData = {
        id: String(event.id),
        title: event.title,
        slug: event.slug,
        ticker: event.ticker,
        description: event.description,
        image: event.image || event.icon,
        icon: event.icon,
        volume: parseFloat(event.volume) || 0,
        liquidity: parseFloat(event.liquidity) || 0,
        tags: event.tags || [],
        start_date: event.startDate ? new Date(event.startDate).toISOString() : null,
        end_date: event.endDate ? new Date(event.endDate).toISOString() : null,
        closed: event.closed || false,
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Upsert event
      const { error: eventError } = await supabase
        .from('market_events')
        .upsert(eventData, { onConflict: 'id' });

      if (eventError) {
        console.error(`[sync-markets] Error upserting event ${event.id}:`, eventError);
      } else {
        eventsSynced++;
      }

      // Sync markets from this event
      if (event.markets && Array.isArray(event.markets)) {
        for (const market of event.markets) {
          // Only sync active, non-closed markets
          if (market.closed || market.active === false) continue;

          // Extract tag IDs from event
          const tagIds = (event.tags || []).map(t => typeof t === 'object' ? t.id : t);

          const marketData = {
            id: String(market.id || market.conditionId),
            condition_id: market.conditionId ? String(market.conditionId) : null,
            question: market.question,
            slug: market.slug,
            description: market.description,
            image: market.image || event.image || event.icon,
            icon: market.icon || event.icon,
            outcomes: market.outcomes || [],
            outcome_prices: market.outcomePrices || [],
            volume: parseFloat(market.volume) || 0,
            volume_24hr: parseFloat(market.volume24hr) || 0,
            volume_1wk: parseFloat(market.volume1wk) || 0,
            liquidity: parseFloat(market.liquidity) || 0,
            active: market.active !== false,
            closed: market.closed || false,
            resolved: market.resolved || false,
            event_id: String(event.id),
            event_title: event.title,
            event_slug: event.slug,
            event_image: event.image || event.icon,
            event_start_date: event.startDate ? new Date(event.startDate).toISOString() : null,
            event_end_date: event.endDate ? new Date(event.endDate).toISOString() : null,
            event_tags: event.tags || [],
            category: category,
            tag_ids: tagIds,
            resolution_source: market.resolutionSource,
            end_date: market.endDate ? new Date(market.endDate).toISOString() : null,
            start_date: market.startDate ? new Date(market.startDate).toISOString() : null,
            created_at_pm: market.createdAt ? new Date(market.createdAt).toISOString() : null,
            updated_at_pm: market.updatedAt ? new Date(market.updatedAt).toISOString() : null,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          // Upsert market
          const { error: marketError } = await supabase
            .from('markets')
            .upsert(marketData, { onConflict: 'id' });

          if (marketError) {
            console.error(`[sync-markets] Error upserting market ${market.id}:`, marketError);
          } else {
            marketsSynced++;
          }
        }
      }
    }

    console.log(`[sync-markets] Synced ${marketsSynced} markets and ${eventsSynced} events for ${category}`);
    
    return { markets: marketsSynced, events: eventsSynced };

  } catch (err) {
    console.error(`[sync-markets] Error syncing category ${category}:`, err);
    throw err;
  }
}

