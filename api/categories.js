// api/categories.js
// Derive a category list from open Polymarket markets (closed=false).
// Keeps it simple and in sync with api/markets.js.

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

  const params = new URLSearchParams();
  params.set("limit", "500");
  params.set("closed", "false"); // only open markets

  const url = `https://gamma-api.polymarket.com/markets?${params.toString()}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Gamma categories error", resp.status, text);
      return res
        .status(resp.status)
        .json({ error: "gamma_error", status: resp.status });
    }

    const data = await resp.json();
    const markets = Array.isArray(data) ? data : (data.markets || []);

    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    function normCategory(cat) {
      if (!cat) return "";
      return String(cat).trim().toLowerCase().replace(/\s+/g, "-");
    }

    const bucket = new Map();

    for (const m of markets) {
      // light "ended long ago" filter, same as markets.js
      const endStr = m.endDateIso || m.endDate;
      if (endStr) {
        const t = Date.parse(endStr);
        if (!Number.isNaN(t) && t < now - ONE_DAY_MS) continue;
      }

      const names = [];

      // simple category string
      if (m.category) names.push(m.category);

      // categories array with objects: { label, slug, ... } 
      if (Array.isArray(m.categories)) {
        for (const cat of m.categories) {
          if (!cat) continue;
          if (typeof cat === "string") {
            names.push(cat);
          } else {
            if (cat.slug) names.push(cat.slug);
            if (cat.label) names.push(cat.label);
          }
        }
      }

      for (const raw of names) {
        const slug = normCategory(raw);
        if (!slug) continue;
        const label = String(raw).trim();

        const existing = bucket.get(slug);
        if (existing) {
          existing.count += 1;
        } else {
          bucket.set(slug, { slug, label, count: 1 });
        }
      }
    }

    const categories = Array.from(bucket.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 25);

    return res.status(200).json({ categories });
  } catch (err) {
    console.error("categories error", err);
    return res.status(500).json({ error: "failed_to_fetch" });
  }
};
