// api/markets.js
// Fetches live markets from Polymarket Gamma API
// Docs: https://docs.polymarket.com/

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const { kind = "trending", limit = "20" } = req.query;
  const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);

  const GAMMA_API = "https://gamma-api.polymarket.com";
  
  try {
    // Try fetching events first (more reliable), then extract markets
    let markets = [];
    
    // Method 1: Try the events endpoint with active filter
    const eventsUrl = `${GAMMA_API}/events?closed=false&active=true&limit=${limitNum}`;
    console.log("[markets] Trying events endpoint:", eventsUrl);
    
    let resp = await fetch(eventsUrl, {
      headers: { "Accept": "application/json" }
    });
    
    if (resp.ok) {
      const events = await resp.json();
      console.log("[markets] Events response:", Array.isArray(events) ? events.length : typeof events);
      
      if (Array.isArray(events) && events.length > 0) {
        // Extract markets from events
        for (const event of events) {
          if (event.markets && Array.isArray(event.markets)) {
            for (const market of event.markets) {
              markets.push({
                ...market,
                eventTitle: event.title,
                eventSlug: event.slug,
              });
            }
          }
        }
        console.log("[markets] Extracted", markets.length, "markets from events");
      }
    }
    
    // Method 2: If no markets from events, try direct markets endpoint
    if (markets.length === 0) {
      let marketsUrl = `${GAMMA_API}/markets?closed=false&limit=${limitNum}`;
      
      if (kind === "volume" || kind === "trending") {
        marketsUrl += "&order=volume24hr&ascending=false";
      } else if (kind === "new") {
        marketsUrl += "&order=startDate&ascending=false";
      }

      console.log("[markets] Trying markets endpoint:", marketsUrl);
      
      resp = await fetch(marketsUrl, {
        headers: { "Accept": "application/json" }
      });
      
      if (resp.ok) {
        const data = await resp.json();
        markets = Array.isArray(data) ? data : (data.markets || []);
        console.log("[markets] Direct markets:", markets.length);
      }
    }
    
    // Method 3: Try CLOB API for pricing data
    if (markets.length === 0) {
      const clobUrl = "https://clob.polymarket.com/markets";
      console.log("[markets] Trying CLOB endpoint:", clobUrl);
      
      resp = await fetch(clobUrl, {
        headers: { "Accept": "application/json" }
      });
      
      if (resp.ok) {
        const clobData = await resp.json();
        if (clobData && clobData.data) {
          markets = clobData.data.slice(0, limitNum);
          console.log("[markets] CLOB markets:", markets.length);
        }
      }
    }

    if (markets.length === 0) {
      console.log("[markets] No markets found from any endpoint");
      return res.status(200).json({ 
        markets: [],
        meta: { total: 0, kind, error: "no_markets_found" }
      });
    }

    // Sort by volume if needed
    if (kind === "volume" || kind === "trending") {
      markets.sort((a, b) => {
        const volA = parseFloat(a.volume24hr || a.volume || 0);
        const volB = parseFloat(b.volume24hr || b.volume || 0);
        return volB - volA;
      });
    }

    // Filter active markets only
    const activeMarkets = markets.filter(m => {
      return m && m.closed !== true && m.active !== false;
    });

    // Transform to frontend format
    const transformed = activeMarkets.slice(0, limitNum).map(m => {
      // Parse outcome prices - handle different formats
      let outcomePrices = [];
      if (m.outcomePrices && Array.isArray(m.outcomePrices)) {
        outcomePrices = m.outcomePrices.map(p => parseFloat(p) || 0);
      } else if (m.tokens && Array.isArray(m.tokens)) {
        // CLOB format has tokens with price
        outcomePrices = m.tokens.map(t => parseFloat(t.price) || 0);
      } else if (m.bestBid || m.bestAsk) {
        outcomePrices = [parseFloat(m.bestAsk) || 0.5];
      }
      
      return {
        id: m.id || m.condition_id || m.conditionId || m.questionID || `market-${Math.random()}`,
        conditionId: m.condition_id || m.conditionId,
        question: m.question || m.title || m.eventTitle || "Unknown Market",
        slug: m.slug || m.market_slug || m.marketSlug,
        description: m.description,
        image: m.image || m.icon || m.market_image,
        icon: m.icon,
        active: m.active !== false,
        closed: m.closed === true,
        volume: parseFloat(m.volume) || parseFloat(m.volumeNum) || 0,
        volume24hr: parseFloat(m.volume24hr) || 0,
        liquidity: parseFloat(m.liquidity) || parseFloat(m.liquidityNum) || 0,
        outcomes: m.outcomes || ["Yes", "No"],
        outcomePrices: outcomePrices,
        clobTokenIds: m.clobTokenIds || m.tokens?.map(t => t.token_id) || [],
      };
    });

    console.log("[markets] Returning", transformed.length, "markets");
    if (transformed.length > 0) {
      console.log("[markets] Sample:", transformed[0].question, transformed[0].outcomePrices);
    }

    return res.status(200).json({ 
      markets: transformed,
      meta: {
        total: transformed.length,
        kind,
        fetched: new Date().toISOString()
      }
    });
    
  } catch (err) {
    console.error("[markets] Error:", err.message);
    return res.status(500).json({ 
      error: "fetch_failed", 
      message: err.message,
      markets: [] 
    });
  }
};
