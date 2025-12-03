// api/test.js - Health check with sports event detection
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
    events: null,
    sportsEvents: [],
  };

  // Fetch ALL events and look for sports
  try {
    const eventsResp = await fetch("https://gamma-api.polymarket.com/events?closed=false&active=true&limit=100");
    if (eventsResp.ok) {
      const events = await eventsResp.json();
      results.events = { 
        total: events.length,
        // Show first 15 event titles to see what's there
        allEventTitles: events.slice(0, 15).map(e => e.title || e.slug || 'untitled'),
      };
      
      // Sports patterns
      const sportPatterns = [
        /nfl/i, /nba/i, /mlb/i, /nhl/i, /mls/i, /ufc/i, /mma/i,
        /chiefs|eagles|bills|ravens|lions|49ers|cowboys|packers/i,
        /lakers|celtics|warriors|bucks|76ers|suns|nuggets|heat/i,
        /yankees|dodgers|astros|braves|phillies/i,
        /super.?bowl/i, /playoff/i, /championship/i,
        /football|basketball|baseball|hockey|soccer/i,
        / vs\.? /i, / at /i,
      ];
      
      for (const event of events) {
        const title = event.title || '';
        const slug = event.slug || '';
        const combined = title + ' ' + slug;
        
        if (sportPatterns.some(p => p.test(combined))) {
          results.sportsEvents.push({
            title: title.substring(0, 70),
            slug: slug,
            marketsCount: event.markets?.length || 0,
            volume: event.volume24hr || event.volume,
          });
        }
      }
      
      results.sportsEventsFound = results.sportsEvents.length;
    }
  } catch (e) {
    results.events = { error: e.message };
  }
  
  res.status(200).json(results);
};
