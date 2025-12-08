// api/market-history.js
// Fetches historical price data from database (tracked over time)
// Falls back to simulated data if database is empty or not configured

const GAMMA_API = "https://gamma-api.polymarket.com";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const { marketId, conditionId, range = 'ALL' } = req.query;

  if (!marketId && !conditionId) {
    return res.status(400).json({ 
      error: "missing_parameters",
      message: "marketId or conditionId is required"
    });
  }

  try {
    const marketIdToUse = marketId || conditionId;
    
    // Calculate time range
    const now = new Date();
    const rangeMs = {
      '1H': 60 * 60 * 1000,
      '6H': 6 * 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000,
      '1W': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000,
      'ALL': 90 * 24 * 60 * 60 * 1000 // 90 days (matches cleanup interval)
    };
    
    const timeRange = rangeMs[range] || rangeMs['ALL'];
    const startTime = new Date(now.getTime() - timeRange);
    
    // Try to fetch from database first
    let useDatabase = false;
    let history = [];
    let outcomes = ["Yes", "No"];
    let currentPrices = [0.5, 0.5];
    
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      try {
        const { createClient } = require("@supabase/supabase-js");
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );
        
        // Fetch price history from database
        const { data: priceHistory, error } = await supabase
          .from('market_price_history')
          .select('*')
          .eq('market_id', marketIdToUse)
          .gte('timestamp', startTime.toISOString())
          .order('timestamp', { ascending: true });
        
        if (!error && priceHistory && priceHistory.length > 0) {
          console.log(`[market-history] Found ${priceHistory.length} price history records from database`);
          
          // Get unique outcomes
          const outcomeMap = new Map();
          priceHistory.forEach(record => {
            if (!outcomeMap.has(record.outcome_index)) {
              outcomeMap.set(record.outcome_index, {
                outcomeIndex: record.outcome_index,
                outcome: record.outcome_name || `Outcome ${record.outcome_index}`,
                data: []
              });
            }
            outcomeMap.get(record.outcome_index).data.push({
              timestamp: new Date(record.timestamp).getTime(),
              price: parseFloat(record.price),
              volume: parseFloat(record.volume) || 0,
              liquidity: parseFloat(record.liquidity) || 0
            });
          });
          
          history = Array.from(outcomeMap.values());
          
          // Get current prices from most recent records
          const latestRecords = priceHistory
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .filter((record, index, self) => 
              index === self.findIndex(r => r.outcome_index === record.outcome_index)
            );
          
          outcomes = latestRecords.map(r => r.outcome_name || `Outcome ${r.outcome_index}`).sort((a, b) => {
            const aIdx = latestRecords.find(r => (r.outcome_name || `Outcome ${r.outcome_index}`) === a)?.outcome_index || 0;
            const bIdx = latestRecords.find(r => (r.outcome_name || `Outcome ${r.outcome_index}`) === b)?.outcome_index || 0;
            return aIdx - bIdx;
          });
          currentPrices = latestRecords
            .sort((a, b) => a.outcome_index - b.outcome_index)
            .map(r => parseFloat(r.price));
          
          useDatabase = true;
        } else {
          console.log(`[market-history] No price history in database for market ${marketIdToUse}, falling back to simulated data`);
        }
      } catch (dbError) {
        console.log("[market-history] Database fetch failed, falling back to simulated data:", dbError.message);
      }
    }
    
    // If database has no data, fetch current market data and generate simulated history
    if (!useDatabase || history.length === 0) {
      console.log("[market-history] Using simulated historical data");
      
      try {
        const marketResp = await fetch(`${GAMMA_API}/markets?condition_id=${marketIdToUse}&limit=1`);
        
        if (marketResp.ok) {
          const markets = await marketResp.json();
          
          if (Array.isArray(markets) && markets.length > 0) {
            const market = markets[0];
            outcomes = market.outcomes || ["Yes", "No"];
            currentPrices = market.outcomePrices || [];
            
            // Generate simulated historical data based on current price
            const points = 100;
            history = outcomes.map((outcome, index) => {
              const currentPrice = currentPrices[index] !== undefined ? parseFloat(currentPrices[index]) : 0.5;
              const dataPoints = [];
              
              for (let i = 0; i < points; i++) {
                const timestamp = startTime.getTime() + (timeRange / points) * i;
                // Simulate price movement that trends toward current price
                const progress = i / points;
                const baseVariation = (Math.sin(progress * Math.PI * 4) * 0.1) + (Math.random() * 0.05 - 0.025);
                const trend = (currentPrice - 0.5) * progress;
                const price = Math.max(0.01, Math.min(0.99, 0.5 + trend + baseVariation));
                
                dataPoints.push({
                  timestamp,
                  price,
                  volume: 0,
                  liquidity: 0
                });
              }
              
              return {
                outcome,
                outcomeIndex: index,
                data: dataPoints
              };
            });
          }
        }
      } catch (apiError) {
        console.error("[market-history] Error fetching market from API:", apiError);
      }
    }

    return res.status(200).json({
      marketId: marketIdToUse,
      conditionId: conditionId || marketIdToUse,
      range,
      history,
      currentPrices,
      outcomes,
      source: useDatabase ? 'database' : 'simulated',
      note: useDatabase 
        ? "Real historical data from database" 
        : "Simulated data. Price tracking will begin after first sync."
    });

  } catch (err) {
    console.error("[market-history] Error:", err);
    return res.status(500).json({
      error: "fetch_failed",
      message: err.message,
      history: []
    });
  }
};
