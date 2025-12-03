// api/test.js - Health check with Gamma API diagnostics
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  
  const results = {
    ok: true,
    time: new Date().toISOString(),
    env: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY,
      hasEncryptionKey: !!process.env.WALLET_ENCRYPTION_KEY,
    },
    gamma: null,
    tags: null,
  };

  // Test Gamma Markets API
  try {
    const marketsResp = await fetch("https://gamma-api.polymarket.com/markets?closed=false&active=true&limit=5");
    results.gamma = { status: marketsResp.status, ok: marketsResp.ok };
    
    if (marketsResp.ok) {
      const markets = await marketsResp.json();
      results.gamma.count = Array.isArray(markets) ? markets.length : 0;
      
      if (Array.isArray(markets) && markets[0]) {
        const m = markets[0];
        results.gamma.sample = {
          id: m.id,
          question: m.question?.substring(0, 50),
          volume24hr: m.volume24hr,
          outcomePrices: m.outcomePrices,
          priceType: typeof m.outcomePrices,
        };
      }
    }
  } catch (e) {
    results.gamma = { error: e.message };
  }

  // Get ALL tags to find sports-related ones
  try {
    const tagsResp = await fetch("https://gamma-api.polymarket.com/tags");
    if (tagsResp.ok) {
      const tags = await tagsResp.json();
      
      // Find sports-related tags
      const sportSlugs = ['sports', 'nfl', 'nba', 'mlb', 'nhl', 'soccer', 'football', 'basketball', 'baseball', 'mma', 'ufc'];
      const sportTags = tags.filter(t => {
        const slug = (t.slug || t.label || '').toLowerCase();
        return sportSlugs.some(s => slug.includes(s));
      });
      
      results.tags = {
        total: tags.length,
        allTags: tags.map(t => ({ id: t.id, slug: t.slug || t.label })),
        sportTags: sportTags.map(t => ({ id: t.id, slug: t.slug || t.label })),
      };
    }
  } catch (e) {
    results.tags = { error: e.message };
  }
  
  res.status(200).json(results);
};
