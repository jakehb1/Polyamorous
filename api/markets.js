// api/markets.js
// Fetches markets from Polymarket Gamma API with proper category filtering

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { category = "trending", limit = "20" } = req.query;
  const limitNum = Math.min(Number(limit) || 20, 50);

  // Category keywords for filtering market questions
  const categoryKeywords = {
    politics: ["president", "trump", "biden", "election", "congress", "senate", "governor", "democrat", "republican", "vote", "government", "political", "administration", "white house", "cabinet", "impeach"],
    sports: ["nfl", "nba", "mlb", "nhl", "soccer", "football", "basketball", "baseball", "hockey", "championship", "playoffs", "super bowl", "world series", "finals", "game", "match", "team", "player", "coach", "mvp", "ufc", "boxing", "tennis", "golf"],
    crypto: ["bitcoin", "btc", "ethereum", "eth", "crypto", "blockchain", "token", "coin", "defi", "solana", "sol", "doge", "xrp", "binance", "coinbase", "sec"]
  };

  try {
    // Fetch all active markets
    const resp = await fetch(
      "https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=200"
    );
    let markets = await resp.json();
    if (!Array.isArray(markets)) markets = [];

    // Filter valid markets with proper prices
    markets = filterValidMarkets(markets);

    // Apply category filter
    if (category === "new") {
      // Sort by creation date for new markets
      markets.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (categoryKeywords[category]) {
      // Filter by category keywords
      const keywords = categoryKeywords[category];
      markets = markets.filter(m => {
        const q = (m.question || "").toLowerCase();
        return keywords.some(kw => q.includes(kw));
      });
      // Sort by volume within category
      markets.sort((a, b) => (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0));
    } else {
      // Trending: sort by volume
      markets.sort((a, b) => (parseFloat(b.volume) || 0) - (parseFloat(a.volume) || 0));
    }

    // Format and return results
    const result = markets.slice(0, limitNum).map(m => {
      let prices = m.outcomePrices;
      if (typeof prices === "string") {
        try { prices = JSON.parse(prices); } catch { prices = []; }
      }
      return {
        id: m.id || m.conditionId,
        question: m.question || "Unknown",
        volume: parseFloat(m.volume) || 0,
        outcomePrices: (prices || []).map(p => parseFloat(p) || 0),
      };
    });

    res.status(200).json({ 
      category,
      count: result.length,
      markets: result 
    });
  } catch (err) {
    console.error("Markets API error:", err);
    res.status(500).json({ error: err.message, markets: [] });
  }
};

function filterValidMarkets(markets) {
  return markets.filter(m => {
    if (!m || m.closed) return false;
    
    let prices = m.outcomePrices;
    if (typeof prices === "string") {
      try { prices = JSON.parse(prices); } catch { return false; }
    }
    
    // Must have valid prices between 0 and 1
    if (!Array.isArray(prices)) return false;
    const hasValidPrice = prices.some(p => {
      const n = parseFloat(p);
      return n > 0.01 && n < 0.99;
    });
    
    return hasValidPrice;
  });
}
