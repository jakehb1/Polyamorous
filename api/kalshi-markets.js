// api/kalshi-markets.js
// Fetches markets from Kalshi API and normalizes to match Polymarket format
// NOTE: Kalshi API requires authentication for all endpoints
// API credentials must be configured via environment variables:
// KALSHI_ACCESS_KEY and KALSHI_PRIVATE_KEY

const KALSHI_API_BASE = "https://trading-api.kalshi.com/trade-api/v2";
const crypto = require("crypto");

/**
 * Generates Kalshi API authentication signature
 */
function generateKalshiSignature(timestamp, method, path, privateKey) {
  const message = `${timestamp}${method}${path}`;
  const key = crypto.createPrivateKey({
    key: privateKey,
    format: "pem",
  });
  const signature = crypto.sign("RSA-SHA256", Buffer.from(message), {
    key,
    padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
    saltLength: crypto.constants.RSA_PSS_SALTLEN_MAX_SIGN,
  });
  return signature.toString("base64");
}

/**
 * Fetches markets from Kalshi API
 * Kalshi API structure may differ - this is a flexible implementation
 */
async function fetchKalshiMarkets(options = {}) {
  const { kind = "trending", limit = 1000, sportType = null } = options;
  
  // Check if API credentials are configured
  const accessKey = process.env.KALSHI_ACCESS_KEY;
  const privateKey = process.env.KALSHI_PRIVATE_KEY;
  
  if (!accessKey || !privateKey) {
    throw new Error("Kalshi API credentials not configured. Please set KALSHI_ACCESS_KEY and KALSHI_PRIVATE_KEY environment variables.");
  }
  
  try {
    // Kalshi API endpoint - adjust based on actual API structure
    // Common endpoints: /markets, /events/{event_id}/markets, /series/{series_id}/markets
    const path = "/trade-api/v2/markets"; // Path for signature (without query params)
    let apiUrl = `${KALSHI_API_BASE}/markets`;
    
    // Build query parameters based on options
    const params = new URLSearchParams();
    params.append("limit", Math.min(limit, 1000).toString());
    params.append("status", "open"); // Only open markets
    
    // Map our category "kind" to Kalshi's category system
    // Kalshi may use different category names
    if (kind && kind !== "trending" && kind !== "volume" && kind !== "new") {
      // Try to map category (this may need adjustment based on Kalshi's actual categories)
      params.append("category", kind);
    }
    
    apiUrl += `?${params.toString()}`;
    
    // Generate authentication headers
    const timestamp = Date.now().toString();
    const method = "GET";
    const signature = generateKalshiSignature(timestamp, method, path, privateKey);
    
    console.log("[kalshi-markets] Fetching from:", apiUrl);
    
    const response = await fetch(apiUrl, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "KALSHI-ACCESS-KEY": accessKey,
        "KALSHI-ACCESS-TIMESTAMP": timestamp,
        "KALSHI-ACCESS-SIGNATURE": signature,
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[kalshi-markets] API error:", response.status, errorText);
      
      if (response.status === 401) {
        throw new Error("Kalshi API authentication failed. Please check your API credentials.");
      }
      
      throw new Error(`Kalshi API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    // Kalshi response structure (adjust based on actual API response)
    // Expected format might be: { markets: [...] } or just [...]
    let kalshiMarkets = Array.isArray(data) ? data : (data.markets || data.items || []);
    
    console.log("[kalshi-markets] Fetched", kalshiMarkets.length, "markets from Kalshi");
    
    // Normalize Kalshi markets to Polymarket format
    const normalizedMarkets = kalshiMarkets.map(normalizeKalshiMarket);
    
    // Apply filtering
    let filteredMarkets = normalizedMarkets;
    
    // Filter by sportType if provided (for NFL games/props)
    if (sportType === "games" && kind === "nfl") {
      filteredMarkets = filteredMarkets.filter(m => {
        // Filter out props, keep only game markets
        const question = (m.question || "").toLowerCase();
        return !question.includes("mvp") && 
               !question.includes("leader") && 
               !question.includes("award");
      });
    }
    
    // Sort by volume (highest first)
    filteredMarkets.sort((a, b) => {
      const volA = parseFloat(a.volume24hr) || parseFloat(a.volume) || 0;
      const volB = parseFloat(b.volume24hr) || parseFloat(b.volume) || 0;
      return volB - volA;
    });
    
    // Limit results
    return filteredMarkets.slice(0, limit);
    
  } catch (error) {
    console.error("[kalshi-markets] Error fetching markets:", error.message);
    throw error;
  }
}

/**
 * Normalizes a Kalshi market to match Polymarket's format
 * Adjust field mappings based on actual Kalshi API response structure
 */
function normalizeKalshiMarket(kalshiMarket) {
  // Kalshi field names (adjust based on actual API):
  // - ticker or market_id → id
  // - title or event_title → question
  // - yes_bid, no_bid → outcomePrices (need to convert to probability)
  // - volume → volume24hr
  // - open_time → startDate
  // - close_time → endDate
  
  // Convert Kalshi prices to probabilities
  // Kalshi uses cents (0-100), we need 0-1 range
  const yesPrice = kalshiMarket.yes_bid !== undefined 
    ? (parseFloat(kalshiMarket.yes_bid) || 50) / 100 
    : 0.5;
  const noPrice = kalshiMarket.no_bid !== undefined
    ? (parseFloat(kalshiMarket.no_bid) || 50) / 100
    : 0.5;
  
  // Normalize prices so they sum to 1 (if needed)
  const totalPrice = yesPrice + noPrice;
  const normalizedYes = totalPrice > 0 ? yesPrice / totalPrice : 0.5;
  const normalizedNo = totalPrice > 0 ? noPrice / totalPrice : 0.5;
  
  return {
    id: kalshiMarket.ticker || kalshiMarket.market_id || kalshiMarket.event_ticker,
    conditionId: kalshiMarket.event_ticker || kalshiMarket.market_id,
    question: kalshiMarket.title || kalshiMarket.event_title || kalshiMarket.subtitle || "Unknown Market",
    slug: kalshiMarket.ticker || kalshiMarket.series_ticker,
    image: kalshiMarket.image_url || null,
    icon: null,
    volume: parseFloat(kalshiMarket.volume) || 0,
    volume24hr: parseFloat(kalshiMarket.volume_24h) || parseFloat(kalshiMarket.volume) || 0,
    liquidity: parseFloat(kalshiMarket.liquidity) || 0,
    outcomes: ["Yes", "No"],
    outcomePrices: [normalizedYes, normalizedNo],
    active: kalshiMarket.status === "open" || kalshiMarket.status === "active",
    closed: kalshiMarket.status === "closed" || kalshiMarket.status === "resolved",
    resolved: kalshiMarket.status === "resolved",
    eventId: kalshiMarket.event_id || null,
    eventTitle: kalshiMarket.event_title || null,
    eventSlug: kalshiMarket.series_ticker || null,
    eventImage: kalshiMarket.image_url || null,
    eventStartDate: kalshiMarket.open_time || null,
    eventEndDate: kalshiMarket.close_time || null,
    eventTags: [],
    createdAt: kalshiMarket.created_time || null,
    updatedAt: kalshiMarket.updated_time || null,
  };
}

/**
 * Fetches categories from Kalshi API
 */
async function fetchKalshiCategories() {
  try {
    // Kalshi might have a categories/series endpoint
    // Adjust endpoint based on actual API
    const response = await fetch(`${KALSHI_API_BASE}/series`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });
    
    if (!response.ok) {
      console.log("[kalshi-markets] Categories endpoint not available or requires auth");
      return [];
    }
    
    const data = await response.json();
    const series = Array.isArray(data) ? data : (data.series || data.items || []);
    
    // Normalize to our category format
    return series.map(s => ({
      id: s.series_ticker || s.id,
      label: s.title || s.name || "Unknown",
      icon: "",
      slug: s.series_ticker || s.slug || s.id,
      tagId: s.id,
    }));
    
  } catch (error) {
    console.error("[kalshi-markets] Error fetching categories:", error.message);
    return [];
  }
}

module.exports = {
  fetchKalshiMarkets,
  fetchKalshiCategories,
  normalizeKalshiMarket,
};

