// api/markets.js
// Fetch live markets from Polymarket Gamma API.
// Groups related markets into events with multiple outcomes
// Only returns events with volume > $1M

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const { kind = "trending", limit = "20", tag_id = "" } = req.query;
  const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const MIN_VOLUME = 1_000_000; // $1M minimum

  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();

  // --- build gamma /markets query params
  const params = new URLSearchParams();
  params.set("closed", "false");
  params.set("limit", "200"); // Fetch more to group by event

  if (kind === "trending") {
    params.set("order", "volume24hr");
    params.set("ascending", "false");
  } else if (kind === "volume") {
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
      return res.status(resp.status).json({ error: "gamma_error", status: resp.status });
    }

    const data = await resp.json();
    const markets = Array.isArray(data) ? data : (data.markets || []);

    // Group markets by event
    const eventMap = new Map();

    markets.forEach((m) => {
      if (m.closed === true) return;
      if (m.active === false) return;

      const endStr = m.endDateIso || m.endDate;
      if (endStr) {
        const t = Date.parse(endStr);
        if (!Number.isNaN(t) && t < now - ONE_DAY_MS) return;
      }

      // Parse prices
      let prices = m.outcomePrices;
      if (typeof prices === "string") {
        try { prices = JSON.parse(prices); } catch { prices = []; }
      }
      const yesPrice = parseFloat(prices?.[0]) || 0;
      
      // Skip invalid prices
      if (yesPrice <= 0.01 || yesPrice >= 0.99) return;

      const volume = parseFloat(m.volume) || parseFloat(m.volumeNum) || 0;

      // Determine event grouping
      // Markets with groupItemTitle are part of a multi-outcome event
      let eventTitle = m.question;
      let outcomeName = "Yes";

      if (m.groupItemTitle) {
        // Extract event title by removing the outcome name
        eventTitle = m.question.replace(m.groupItemTitle, '').trim();
        eventTitle = eventTitle.replace(/^[-:?\s]+|[-:?\s]+$/g, '').trim() || m.question;
        outcomeName = m.groupItemTitle;
      }

      const eventKey = eventTitle.toLowerCase().substring(0, 60);

      if (!eventMap.has(eventKey)) {
        eventMap.set(eventKey, {
          question: eventTitle,
          title: eventTitle,
          image: m.image,
          volume: 0,
          volume24hr: 0,
          outcomes: [],
          clobTokenIds: m.clobTokenIds,
          negRisk: m.negRisk
        });
      }

      const event = eventMap.get(eventKey);
      event.volume += volume;
      event.volume24hr += parseFloat(m.volume24hr) || 0;
      if (m.image && !event.image) event.image = m.image;

      event.outcomes.push({
        id: m.id,
        name: outcomeName,
        percent: Math.round(yesPrice * 100),
        volume: volume,
        tokenId: m.clobTokenIds ? (typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds)[0] : m.clobTokenIds[0]) : null
      });
    });

    // Convert to array and filter by minimum volume
    let events = Array.from(eventMap.values())
      .filter(e => e.volume >= MIN_VOLUME)
      .map(e => {
        // Sort outcomes by probability (highest first)
        e.outcomes.sort((a, b) => b.percent - a.percent);
        // Limit to 5 outcomes per event
        e.outcomes = e.outcomes.slice(0, 5);
        return e;
      })
      .filter(e => e.outcomes.length > 0);

    // Sort by volume
    if (kind === "trending") {
      events.sort((a, b) => b.volume24hr - a.volume24hr);
    } else {
      events.sort((a, b) => b.volume - a.volume);
    }

    return res.status(200).json(events.slice(0, limitNum));
  } catch (err) {
    console.error("markets error", err);
    return res.status(500).json({ error: "failed_to_fetch" });
  }
};
