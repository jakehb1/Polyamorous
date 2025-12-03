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
      console.log("[markets] Fetching sports events...");
      
      // Approach 1: Fetch events and look for sports-related ones
      // Sports events usually have slugs like "nfl-week-X", "nba-YYYY", etc.
      const eventsUrl = `${GAMMA_API}/events?closed=false&active=true&limit=100`;
      console.log("[markets] Fetching events:", eventsUrl);
      
      const eventsResp = await fetch(eventsUrl);
      if (eventsResp.ok) {
        const events = await eventsResp.json();
        console.log("[markets] Total events:", events.length);
        
        // Sports event patterns
        const sportPatterns = [
          /nfl/i, /nba/i, /mlb/i, /nhl/i, /mls/i,
          /ufc/i, /mma/i, /boxing/i,
          /premier.?league/i, /la.?liga/i, /bundesliga/i, /serie.?a/i, /champions.?league/i,
          /super.?bowl/i, /world.?series/i, /stanley.?cup/i, /nba.?finals/i,
          /ncaa/i, /march.?madness/i, /college.?football/i,
          /f1/i, /formula/i, /nascar/i,
          /tennis/i, /wimbledon/i, /us.?open/i,
          /golf/i, /pga/i, /masters/i,
          / vs\.? /i, / at /i,  // "Team A vs Team B" or "Team A at Team B"
        ];
        
        // Team name patterns for more specific matching
        const nflTeams = /\b(chiefs|eagles|bills|ravens|lions|49ers|cowboys|packers|dolphins|jets|patriots|bengals|browns|steelers|titans|colts|texans|jaguars|broncos|raiders|chargers|seahawks|rams|cardinals|saints|falcons|panthers|buccaneers|bears|vikings|commanders|giants)\b/i;
        const nbaTeams = /\b(lakers|celtics|warriors|bucks|76ers|suns|nuggets|heat|knicks|nets|clippers|mavericks|grizzlies|cavaliers|hawks|bulls|raptors|kings|pelicans|timberwolves|thunder|rockets|spurs|magic|pacers|pistons|hornets|wizards|blazers|jazz)\b/i;
        const mlbTeams = /\b(yankees|dodgers|astros|braves|phillies|padres|mets|guardians|mariners|orioles|rangers|rays|twins|blue.?jays|red.?sox|cubs|brewers|cardinals|giants|diamondbacks|marlins|pirates|reds|rockies|royals|tigers|white.?sox|angels|athletics|nationals)\b/i;
        
        if (Array.isArray(events)) {
          for (const event of events) {
            const title = (event.title || '').toLowerCase();
            const slug = (event.slug || '').toLowerCase();
            const combined = title + ' ' + slug;
            
            // Check if this is a sports event
            const isSportsEvent = sportPatterns.some(p => p.test(combined)) ||
                                  nflTeams.test(combined) ||
                                  nbaTeams.test(combined) ||
                                  mlbTeams.test(combined);
            
            if (isSportsEvent && event.markets && Array.isArray(event.markets)) {
              console.log("[markets] Found sports event:", event.title);
              for (const market of event.markets) {
                if (!market.closed) {
                  markets.push({
                    ...market,
                    eventTitle: event.title,
                    eventSlug: event.slug,
                  });
                }
              }
            }
          }
        }
      }
      
      console.log("[markets] Sports markets from events:", markets.length);
      
      // Approach 2: If still no results, try direct markets with stricter sports matching
      if (markets.length === 0) {
        console.log("[markets] Trying direct markets search...");
        const marketsUrl = `${GAMMA_API}/markets?closed=false&active=true&limit=200`;
        const marketsResp = await fetch(marketsUrl);
        
        if (marketsResp.ok) {
          const allMarkets = await marketsResp.json();
          
          // Very strict sports game matching - must look like an actual game
          const gamePatterns = [
            /will .+ (win|beat|defeat)/i,
            /\b(chiefs|eagles|bills|ravens|lions|49ers|cowboys|packers|dolphins|jets|patriots|bengals|browns|steelers|lakers|celtics|warriors|bucks|76ers|yankees|dodgers|astros)\b.*\b(win|championship|playoff|game|series)\b/i,
            /nfl.*week/i,
            /nba.*game/i,
            /super bowl/i,
          ];
          
          // Exclude patterns (not actual sports games)
          const excludePatterns = [
            /competitor/i,
            /ceo/i,
            /company/i,
            /stock/i,
            /raise.*\$/i,
            /funding/i,
            /valuation/i,
            /ipo/i,
          ];
          
          markets = allMarkets.filter(m => {
            const q = (m.question || '').toLowerCase();
            const isGame = gamePatterns.some(p => p.test(q));
            const isExcluded = excludePatterns.some(p => p.test(q));
            return isGame && !isExcluded;
          });
        }
      }
      
      // Remove duplicates
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

    console.log("[markets] After price filter:", markets.length);

    // Sort by volume (highest first)
    markets.sort((a, b) => {
      const volA = parseFloat(a.volume24hr) || parseFloat(a.volume) || 0;
      const volB = parseFloat(b.volume24hr) || parseFloat(b.volume) || 0;
      return volB - volA;
    });
    
    // For "new", re-sort by date
    if (kind === "new") {
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
        question: m.question || m.eventTitle || "Unknown Market",
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
