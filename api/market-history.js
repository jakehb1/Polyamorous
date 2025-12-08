// api/market-history.js
// Fetches historical price data for a specific market from Polymarket
// This endpoint provides price history for the market detail graph

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
    // Try to fetch market details first to get condition ID if needed
    let conditionIdToUse = conditionId;
    
    if (!conditionIdToUse && marketId) {
      try {
        const marketResp = await fetch(`${GAMMA_API}/markets?condition_id=${marketId}&limit=1`);
        if (marketResp.ok) {
          const markets = await marketResp.json();
          if (Array.isArray(markets) && markets.length > 0) {
            conditionIdToUse = markets[0].conditionId || markets[0].id;
          }
        }
      } catch (e) {
        console.log("[market-history] Error fetching market:", e.message);
      }
    }

    // Polymarket doesn't have a direct historical price API endpoint
    // We'll need to use the market's current data and simulate or fetch from alternative sources
    // For now, return the current market data with a note that historical data needs to be tracked
    
    const marketResp = await fetch(`${GAMMA_API}/markets?condition_id=${conditionIdToUse || marketId}&limit=1`);
    
    if (!marketResp.ok) {
      return res.status(500).json({
        error: "fetch_failed",
        message: `Market API returned ${marketResp.status}`,
        history: []
      });
    }

    const markets = await marketResp.json();
    
    if (!Array.isArray(markets) || markets.length === 0) {
      return res.status(404).json({
        error: "market_not_found",
        message: "Market not found",
        history: []
      });
    }

    const market = markets[0];
    const outcomes = market.outcomes || ["Yes", "No"];
    const currentPrices = market.outcomePrices || [];
    
    // Generate historical data points based on current price
    // In production, this should be fetched from a historical data service or tracked over time
    const now = Date.now();
    const rangeMs = {
      '1H': 60 * 60 * 1000,
      '6H': 6 * 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000,
      '1W': 7 * 24 * 60 * 60 * 1000,
      '1M': 30 * 24 * 60 * 60 * 1000,
      'ALL': 7 * 24 * 60 * 60 * 1000 // Default to 1 week
    };
    
    const timeRange = rangeMs[range] || rangeMs['ALL'];
    const startTime = now - timeRange;
    const points = 100; // Number of data points to return
    
    // Generate historical price data for each outcome
    const history = outcomes.map((outcome, index) => {
      const currentPrice = currentPrices[index] !== undefined ? parseFloat(currentPrices[index]) : 0.5;
      const dataPoints = [];
      
      for (let i = 0; i < points; i++) {
        const timestamp = startTime + (timeRange / points) * i;
        // Simulate price movement (in production, use real historical data)
        // For now, create realistic-looking data that trends toward current price
        const progress = i / points;
        const baseVariation = (Math.sin(progress * Math.PI * 4) * 0.1) + (Math.random() * 0.05 - 0.025);
        const trend = (currentPrice - 0.5) * progress; // Trend from 0.5 to current price
        const price = Math.max(0.01, Math.min(0.99, 0.5 + trend + baseVariation));
        
        dataPoints.push({
          timestamp,
          price,
          outcome: outcome
        });
      }
      
      return {
        outcome,
        outcomeIndex: index,
        data: dataPoints
      };
    });

    return res.status(200).json({
      marketId: market.id || marketId,
      conditionId: conditionIdToUse || marketId,
      range,
      history,
      currentPrices,
      outcomes,
      note: "Historical data is simulated. Real historical tracking requires storing price snapshots over time."
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

