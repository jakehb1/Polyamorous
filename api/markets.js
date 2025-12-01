// api/markets.js
// Live Polymarket markets with local filtering & text-based categories.
//
// kind=new        -> newest open markets
// kind=trending   -> open markets by 24h volume desc
// kind=volume     -> open markets by total volume desc
// kind=category   -> open markets in a text-derived category
//
// category slugs supported: politics, sports, finance, crypto,
// geopolitics, world, tech, culture

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function classifyMarketSlugs(market) {
  const slugs = new Set();
  const q = String(market.question || market.slug || "")
    .toLowerCase();

  const hasAny = (words) => words.some((w) => q.includes(w));

  // Politics
  if (
    hasAny([
      "election",
      "president",
      "prime minister",
      "parliament",
      "senate",
      "congress",
      "democrat",
      "republican",
      "biden",
      "trump",
      "harris",
      "gop",
      "labour",
      "conservative",
      "vote",
      "poll",
    ])
  ) {
    slugs.add("politics");
  }

  // Sports
  if (
    hasAny([
      "nba",
      "nfl",
      "mlb",
      "nhl",
      "premier league",
      "champions league",
      "world cup",
      "fifa",
      "uefa",
      "tennis",
      "wimbledon",
      "grand slam",
      "olympic",
      "super bowl",
      "finals",
      "playoffs",
      "league",
      " vs ",
      " vs.",
    ])
  ) {
    slugs.add("sports");
  }

  // Finance / macro
  if (
    hasAny([
      "fed ",
      "federal reserve",
      "interest rate",
      "rate hike",
      "rate cut",
      "recession",
      "gdp",
      "inflation",
      "cpi",
      "unemployment",
      "nasdaq",
      "s&p",
      "dow jones",
      "treasury",
      "bond",
      "stock",
      "equity",
      "yield",
      "market cap",
    ])
  ) {
    slugs.add("finance");
  }

  // Crypto
  if (
    hasAny([
      "bitcoin",
      "btc",
      "ethereum",
      "eth",
      "solana",
      "sol",
      "tether",
      "usdt",
      "stablecoin",
      "crypto",
      "token",
      "coin",
      "defi",
      "etf",
      "binance",
      "coinbase",
    ])
  ) {
    slugs.add("crypto");
  }

  // Geopolitics
  if (
    hasAny([
      "war",
      "conflict",
      "invasion",
      "russia",
      "ukraine",
      "gaza",
      "israel",
      "palestine",
      "taiwan",
      "china",
      "north korea",
      "sanction",
      "nato",
      "geopolitic",
    ])
  ) {
    slugs.add("geopolitics");
  }

  // World / global
  if (
    hasAny([
      "global",
      "world",
      "united nations",
      "un ",
      "who ",
      "pandemic",
      "climate",
      "emissions",
      "europe",
      "asia",
      "africa",
      "latin america",
      "migration",
      "immigration",
    ])
  ) {
    slugs.add("world");
  }

  // Tech
  if (
    hasAny([
      "apple",
      "iphone",
      "google",
      "alphabet",
      "meta",
      "facebook",
      "amazon",
      "microsoft",
      "openai",
      "chatgpt",
      "nvidia",
      "ai ",
      "artificial intelligence",
      "chip",
      "semiconductor",
      "tesla",
      "spacex",
      "x.com",
      "social media",
      "startup",
    ])
  ) {
    slugs.add("tech");
  }

  // Culture / entertainment
  if (
    hasAny([
      "oscars",
      "academy awards",
      "emmys",
      "grammys",
      "box office",
      "movie",
      "film",
      "tv series",
      "tv show",
      "streaming",
      "celebrity",
      "taylor swift",
      "music",
      "album",
      "tour",
      "festival",
    ])
  ) {
    slugs.add("culture");
  }

  return slugs;
}

function filterByEndDate(markets) {
  const now = Date.now();
  return markets.filter((m) => {
    const endStr = m.endDateIso || m.endDate;
    if (!endStr) return true;
    const t = Date.parse(endStr);
    if (Number.isNaN(t)) return true;
    // keep if ends in future or within last 24h
    return t >= now - ONE_DAY_MS;
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  if (req.method !== "GET") {
    return res.status(405).json({ error: "method_not_allowed" });
  }

  const {
    kind = "new",
    limit = "10",
    category: categorySlugRaw = "",
  } = req.query;

  const limitNum = Number(limit) || 10;
  const requestedKind = String(kind || "new").toLowerCase();
  const categorySlug = String(categorySlugRaw || "").trim().toLowerCase();

  // Always hit Gamma /markets (live data)
  const params = new URLSearchParams();
  params.set("limit", String(Math.max(limitNum, 200))); // pull a big sample
  params.set("closed", "false"); // open markets only

  if (requestedKind === "trending") {
    params.set("order", "volume24hr");
    params.set("ascending", "false");
  } else if (requestedKind === "volume") {
    params.set("order", "volumeNum");
    params.set("ascending", "false");
  } else {
    params.set("order", "createdAt");
    params.set("ascending", "false");
  }

  const url = `https://gamma-api.polymarket.com/markets?${params.toString()}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Gamma markets error", resp.status, text);
      return res
        .status(resp.status)
        .json({ error: "gamma_error", status: resp.status });
    }

    const data = await resp.json();
    let markets = Array.isArray(data) ? data : data.markets || [];

    // basic “live-ish” filter
    markets = markets.filter((m) => !m.closed && m.active !== false);
    markets = filterByEndDate(markets);

    // category mode: text classifier
    if (requestedKind === "category" && categorySlug) {
      markets = markets.filter((m) =>
        classifyMarketSlugs(m).has(categorySlug)
      );
    }

    // Gamma already sorted by our order; just enforce limit
    return res.status(200).json(markets.slice(0, limitNum));
  } catch (err) {
    console.error("markets error", err);
    return res.status(500).json({ error: "failed_to_fetch" });
  }
};
