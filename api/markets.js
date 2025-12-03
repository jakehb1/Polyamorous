// api/markets.js - Fetch markets from Polymarket Gamma API

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const { kind = "trending", limit = "20" } = req.query;
  const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const GAMMA_API = "https://gamma-api.polymarket.com";

  try {
    // Fetch markets
    const url = `${GAMMA_API}/markets?closed=false&active=true&limit=100`;
    const resp = await fetch(url);
    
    if (!resp.ok) {
      return res.status(502).json({ error: "API error", markets: [] });
    }

    let markets = await resp.json();
    if (!Array.isArray(markets)) markets = [];

    // Filter markets with valid prices
    markets = markets.filter(m => {
      if (!m || m.closed) return false;
      let prices = m.outcomePrices;
      if (typeof prices === 'string') {
        try { prices = JSON.parse(prices); } catch { return false; }
      }
      if (!Array.isArray(prices) || prices.length === 0) return false;
      return prices.some(p => {
        const n = parseFloat(p);
        return !isNaN(n) && n > 0 && n < 1;
      });
    });

    // Sort by volume
    markets.sort((a, b) => {
      const volA = parseFloat(a.volume24hr) || parseFloat(a.volume) || 0;
      const volB = parseFloat(b.volume24hr) || parseFloat(b.volume) || 0;
      return volB - volA;
    });

    // Transform
    const result = markets.slice(0, limitNum).map(m => {
      let prices = m.outcomePrices;
      if (typeof prices === 'string') {
        try { prices = JSON.parse(prices); } catch { prices = []; }
      }
      return {
        id: m.id || m.conditionId,
        question: m.question || "Unknown",
        slug: m.slug,
        image: m.image || m.icon,
        volume: parseFloat(m.volume) || 0,
        volume24hr: parseFloat(m.volume24hr) || 0,
        outcomePrices: (prices || []).map(p => parseFloat(p) || 0),
      };
    });

    return res.status(200).json({ markets: result });
  } catch (err) {
    console.error("[markets] Error:", err);
    return res.status(500).json({ error: err.message, markets: [] });
  }
};
