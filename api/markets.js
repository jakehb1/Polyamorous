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
    
    if (kind === "sports") {
      // Try multiple approaches to get sports markets
      console.log("[markets] Fetching sports markets...");
      
      // Approach 1: Try to get tags and find sports-related ones
      let sportTagIds = [];
      try {
        const tagsResp = await fetch(`${GAMMA_API}/tags`);
        if (tagsResp.ok) {
          const tags = await tagsResp.json();
          // Look for sports-related tags
          const sportSlugs = ['sports', 'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football', 'basketball', 'baseball', 'mma', 'ufc', 'boxing', 'tennis', 'golf', 'f1', 'formula-1'];
          for (const tag of tags) {
            const slug = (tag.slug || tag.label || '').toLowerCase();
            if (sportSlugs.some(s => slug.includes(s))) {
              sportTagIds.push(tag.id);
              console.log("[markets] Found sport tag:", tag.slug, tag.id);
            }
          }
        }
      } catch (e) {
        console.log("[markets] Failed to get tags:", e.message);
      }
      
      // Fetch markets for each sport tag
      for (const tagId of sportTagIds.slice(0, 5)) { // Limit to 5 tags
        try {
          const url = `${GAMMA_API}/markets?closed=false&active=true&tag_id=${tagId}&limit=50`;
          console.log("[markets] Fetching tag:", tagId);
          const resp = await fetch(url);
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data)) {
              markets.push(...data);
            }
          }
        } catch (e) {
          console.log("[markets] Tag fetch error:", e.message);
        }
      }
      
      // Approach 2: If no tag results, fetch all and filter by keywords
      if (markets.length === 0) {
        console.log("[markets] No tag results, trying keyword filter...");
        const url = `${GAMMA_API}/markets?closed=false&active=true&limit=200`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data)) {
            // Filter by sports keywords in question
            const sportKeywords = [
              'nfl', 'nba', 'mlb', 'nhl', 'ufc', 'mma',
              'super bowl', 'championship', 'playoffs', 'finals',
              'win the', 'beat', 'vs', 'match', 'game',
              'touchdown', 'quarterback', 'mvp',
              'lakers', 'celtics', 'warriors', 'chiefs', 'eagles', 'cowboys',
              'yankees', 'dodgers', 'patriots', 'bills', 'ravens',
              'boxing', 'tennis', 'golf', 'f1', 'formula',
              'world series', 'stanley cup', 'world cup'
            ];
            
            markets = data.filter(m => {
              const q = (m.question || '').toLowerCase();
              const slug = (m.slug || '').toLowerCase();
              return sportKeywords.some(kw => q.includes(kw) || slug.includes(kw));
            });
            
            console.log("[markets] Keyword filtered:", markets.length);
          }
        }
      }
      
      // Remove duplicates by id
      const seen = new Set();
      markets = markets.filter(m => {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
        return true;
      });
      
    } else {
      // Regular fetch for trending/volume/new
      const url = `${GAMMA_API}/markets?closed=false&active=true&limit=100`;
      console.log("[markets] Fetching:", url);
      
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        markets = Array.isArray(data) ? data : [];
      }
    }
    
    console.log("[markets] Raw markets:", markets.length);

    // Filter: must have valid prices
    markets = markets.filter(m => {
      if (!m || m.closed === true) return false;
      
      let prices = m.outcomePrices;
      if (typeof prices === 'string') {
        try { prices = JSON.parse(prices); } catch(e) { return false; }
      }
      if (!prices || !Array.isArray(prices) || prices.length === 0) return false;
      
      const hasValidPrice = prices.some(p => {
        const num = parseFloat(p);
        return !isNaN(num) && num > 0 && num < 1;
      });
      
      return hasValidPrice;
    });

    console.log("[markets] After filter:", markets.length);

    // Sort
    if (kind === "trending" || kind === "volume" || kind === "sports") {
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
    }

    // Transform
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

    console.log("[markets] Returning", transformed.length, "for:", kind);

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
