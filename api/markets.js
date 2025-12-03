// api/markets.js
// Fetches live markets from Polymarket Gamma API

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
    
    // Build URL based on kind
    let url = `${GAMMA_API}/markets?closed=false&active=true&limit=100`;
    
    // Add tag filter for sports
    if (kind === "sports") {
      // First get tags to find sports tag ID
      try {
        const tagsResp = await fetch(`${GAMMA_API}/tags`);
        if (tagsResp.ok) {
          const tags = await tagsResp.json();
          const sportsTag = tags.find(t => 
            t.slug?.toLowerCase() === 'sports' || 
            t.label?.toLowerCase() === 'sports'
          );
          if (sportsTag) {
            url = `${GAMMA_API}/markets?closed=false&active=true&tag_id=${sportsTag.id}&limit=100`;
            console.log("[markets] Using sports tag:", sportsTag.id);
          }
        }
      } catch (e) {
        console.log("[markets] Failed to get tags:", e.message);
      }
    }

    console.log("[markets] Fetching:", url);
    
    const resp = await fetch(url);
    
    if (!resp.ok) {
      console.error("[markets] API error:", resp.status);
      return res.status(502).json({ error: "gamma_api_error", markets: [] });
    }
    
    const data = await resp.json();
    markets = Array.isArray(data) ? data : [];
    
    console.log("[markets] Raw markets:", markets.length);

    // Filter: must have prices and not be closed
    markets = markets.filter(m => {
      if (!m || m.closed === true) return false;
      
      // Must have outcome prices
      let prices = m.outcomePrices;
      if (typeof prices === 'string') {
        try { prices = JSON.parse(prices); } catch(e) { prices = null; }
      }
      if (!prices || !Array.isArray(prices) || prices.length === 0) return false;
      
      // At least one price should be valid (not 0 or NaN)
      const hasValidPrice = prices.some(p => {
        const num = parseFloat(p);
        return !isNaN(num) && num > 0 && num < 1;
      });
      
      return hasValidPrice;
    });

    console.log("[markets] After price filter:", markets.length);

    // Sort based on kind
    if (kind === "trending" || kind === "volume") {
      markets.sort((a, b) => {
        const volA = parseFloat(a.volume24hr) || parseFloat(a.volume) || 0;
        const volB = parseFloat(b.volume24hr) || parseFloat(b.volume) || 0;
        return volB - volA;
      });
    } else if (kind === "new") {
      markets.sort((a, b) => {
        const dateA = new Date(a.createdAt || a.startDate || 0);
        const dateB = new Date(b.createdAt || b.startDate || 0);
        return dateB - dateA;
      });
    } else if (kind === "sports") {
      // For sports, sort by liquidity then volume
      markets.sort((a, b) => {
        const liqA = parseFloat(a.liquidity) || 0;
        const liqB = parseFloat(b.liquidity) || 0;
        if (liqB !== liqA) return liqB - liqA;
        const volA = parseFloat(a.volume24hr) || 0;
        const volB = parseFloat(b.volume24hr) || 0;
        return volB - volA;
      });
    }

    // Transform to frontend format
    const transformed = markets.slice(0, limitNum).map(m => {
      let outcomePrices = m.outcomePrices;
      if (typeof outcomePrices === 'string') {
        try { outcomePrices = JSON.parse(outcomePrices); } catch(e) { outcomePrices = []; }
      }
      outcomePrices = (outcomePrices || []).map(p => parseFloat(p) || 0);
      
      return {
        id: m.id || m.conditionId,
        conditionId: m.conditionId,
        question: m.question || "Unknown Market",
        slug: m.slug,
        image: m.image || m.icon,
        volume: parseFloat(m.volume) || 0,
        volume24hr: parseFloat(m.volume24hr) || 0,
        liquidity: parseFloat(m.liquidity) || 0,
        outcomes: m.outcomes || ["Yes", "No"],
        outcomePrices: outcomePrices,
        clobTokenIds: m.clobTokenIds || [],
      };
    });

    console.log("[markets] Returning", transformed.length, "markets for:", kind);
    if (transformed.length > 0) {
      console.log("[markets] Top market:", transformed[0].question, "Vol:", transformed[0].volume24hr);
    }

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
