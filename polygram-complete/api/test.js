// api/test.js - Health check endpoint with Gamma API test
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  
  if (req.method === "OPTIONS") return res.status(200).end();
  
  // Test Gamma Events API
  let eventsStatus = { ok: false };
  try {
    const eventsResp = await fetch("https://gamma-api.polymarket.com/events?limit=2&closed=false&active=true");
    eventsStatus.httpStatus = eventsResp.status;
    
    if (eventsResp.ok) {
      const data = await eventsResp.json();
      eventsStatus.ok = true;
      eventsStatus.count = Array.isArray(data) ? data.length : 0;
      
      if (Array.isArray(data) && data[0]) {
        eventsStatus.sampleEvent = data[0].title?.substring(0, 60);
        eventsStatus.marketsInEvent = data[0].markets?.length || 0;
        if (data[0].markets?.[0]) {
          eventsStatus.sampleMarket = {
            question: data[0].markets[0].question?.substring(0, 60),
            hasOutcomePrices: !!data[0].markets[0].outcomePrices,
          };
        }
      }
    } else {
      eventsStatus.error = (await eventsResp.text()).substring(0, 100);
    }
  } catch (err) {
    eventsStatus.error = err.message;
  }

  // Test Gamma Markets API
  let marketsStatus = { ok: false };
  try {
    const marketsResp = await fetch("https://gamma-api.polymarket.com/markets?limit=2&closed=false");
    marketsStatus.httpStatus = marketsResp.status;
    
    if (marketsResp.ok) {
      const data = await marketsResp.json();
      marketsStatus.ok = true;
      marketsStatus.isArray = Array.isArray(data);
      marketsStatus.count = Array.isArray(data) ? data.length : 'n/a';
      
      if (Array.isArray(data) && data[0]) {
        marketsStatus.sampleMarket = {
          id: data[0].id,
          question: data[0].question?.substring(0, 60),
          hasOutcomePrices: !!data[0].outcomePrices,
        };
      }
    } else {
      marketsStatus.error = (await marketsResp.text()).substring(0, 100);
    }
  } catch (err) {
    marketsStatus.error = err.message;
  }
  
  res.status(200).json({ 
    ok: true, 
    time: new Date().toISOString(),
    env: {
      hasSupabaseUrl: !!process.env.SUPABASE_URL,
      hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY,
      hasEncryptionKey: !!process.env.WALLET_ENCRYPTION_KEY,
    },
    gammaEvents: eventsStatus,
    gammaMarkets: marketsStatus,
  });
};
