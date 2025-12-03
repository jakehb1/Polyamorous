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

  // Test Tags API
  try {
    const tagsResp = await fetch("https://gamma-api.polymarket.com/tags");
    if (tagsResp.ok) {
      const tags = await tagsResp.json();
      const sportsTag = tags.find(t => t.slug?.toLowerCase() === 'sports');
      results.tags = {
        total: tags.length,
        sports: sportsTag ? { id: sportsTag.id, slug: sportsTag.slug } : null,
        sample: tags.slice(0, 5).map(t => t.slug || t.label),
      };
    }
  } catch (e) {
    results.tags = { error: e.message };
  }
  
  res.status(200).json(results);
};
