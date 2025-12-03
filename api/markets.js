// api/markets.js
// Fetches live markets from Polymarket Gamma API with category filtering

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
    let markets = [];
    
    // Handle sports category
    if (kind === "sports") {
      console.log("[markets] Fetching sports markets...");
      
      // Get the sports tag ID
      const tagsResp = await fetch(`${GAMMA_API}/tags`);
      let sportsTagId = null;
      
      if (tagsResp.ok) {
        const tags = await tagsResp.json();
        const sportsTag = tags.find(t => 
          (t.slug && t.slug.toLowerCase() === 'sports') ||
          (t.label && t.label.toLowerCase() === 'sports') ||
          (t.name && t.name.toLowerCase() === 'sports')
        );
        if (sportsTag) {
          sportsTagId = sportsTag.id;
          console.log("[markets] Found sports tag ID:", sportsTagId);
        }
      }
      
      if (sportsTagId) {
        // Fetch events with sports tag
        const eventsUrl = `${GAMMA_API}/events?tag_id=${sportsTagId}&closed=false&active=true&limit=50`;
        console.log("[markets] Fetching sports events:", eventsUrl);
        
        const eventsResp = await fetch(eventsUrl);
        if (eventsResp.ok) {
          const events = await eventsResp.json();
          console.log("[markets] Sports events found:", Array.isArray(events) ? events.length : 0);
          
          if (Array.isArray(events)) {
            for (const event of events) {
              if (event.markets && Array.isArray(event.markets)) {
                for (const market of event.markets) {
                  if (!market.closed) {
                    markets.push({
                      ...market,
                      eventTitle: event.title,
                    });
                  }
                }
              }
            }
          }
        }
      }
      
      // Fallback: try direct markets with tag
      if (markets.length === 0 && sportsTagId) {
        const marketsUrl = `${GAMMA_API}/markets?tag_id=${sportsTagId}&closed=false&active=true&limit=${limitNum}`;
        const marketsResp = await fetch(marketsUrl);
        if (marketsResp.ok) {
          const data = await marketsResp.json();
          markets = Array.isArray(data) ? data.filter(m => !m.closed) : [];
        }
      }
      
    } else {
      // For trending/volume/new
      let eventsUrl = `${GAMMA_API}/events?closed=false&active=true&limit=50`;
      
      if (kind === "volume" || kind === "trending") {
        eventsUrl += "&order=volume24hr&ascending=false";
      } else if (kind === "new") {
        eventsUrl += "&order=startDate&ascending=false";
      }

      console.log("[markets] Fetching events:", eventsUrl);
      
      const eventsResp = await fetch(eventsUrl);
      
      if (eventsResp.ok) {
        const events = await eventsResp.json();
        
        if (Array.isArray(events)) {
          for (const event of events) {
            if (event.markets && Array.isArray(event.markets)) {
              for (const market of event.markets) {
                if (!market.closed) {
                  markets.push({
                    ...market,
                    eventTitle: event.title,
                  });
                }
              }
            }
          }
        }
      }
      
      // Fallback to direct markets
      if (markets.length === 0) {
        let marketsUrl = `${GAMMA_API}/markets?closed=false&active=true&limit=${limitNum}`;
        
        if (kind === "volume" || kind === "trending") {
          marketsUrl += "&order=volume24hr&ascending=false";
        } else if (kind === "new") {
          marketsUrl += "&order=startDate&ascending=false";
        }
        
        const marketsResp = await fetch(marketsUrl);
        if (marketsResp.ok) {
          const data = await marketsResp.json();
          markets = Array.isArray(data) ? data.filter(m => !m.closed) : [];
        }
      }
    }

    // Sort by volume for trending/volume
    if (kind === "volume" || kind === "trending") {
      markets.sort((a, b) => {
        const volA = parseFloat(a.volume24hr || a.volume || 0);
        const volB = parseFloat(b.volume24hr || b.volume || 0);
        return volB - volA;
      });
    }
    
    // Sort by date for new
    if (kind === "new") {
      markets.sort((a, b) => {
        const dateA = new Date(a.startDate || a.createdAt || 0);
        const dateB = new Date(b.startDate || b.createdAt || 0);
        return dateB - dateA;
      });
    }

    // Transform to frontend format
    const transformed = markets.slice(0, limitNum).map(m => {
      let outcomePrices = [];
      if (m.outcomePrices) {
        if (Array.isArray(m.outcomePrices)) {
          outcomePrices = m.outcomePrices.map(p => parseFloat(p) || 0);
        } else if (typeof m.outcomePrices === 'string') {
          try {
            outcomePrices = JSON.parse(m.outcomePrices).map(p => parseFloat(p) || 0);
          } catch (e) {}
        }
      }
      
      return {
        id: m.id || m.conditionId || `market-${Date.now()}`,
        conditionId: m.conditionId,
        question: m.question || m.title || m.eventTitle || "Unknown",
        slug: m.slug,
        volume: parseFloat(m.volume) || 0,
        volume24hr: parseFloat(m.volume24hr) || 0,
        liquidity: parseFloat(m.liquidity) || 0,
        outcomes: m.outcomes || ["Yes", "No"],
        outcomePrices: outcomePrices,
        clobTokenIds: m.clobTokenIds || [],
      };
    });

    console.log("[markets] Returning", transformed.length, "markets for:", kind);

    return res.status(200).json({ 
      markets: transformed,
      meta: { total: transformed.length, kind }
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
