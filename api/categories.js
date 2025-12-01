// api/categories.js
// Derive a category list from current Polymarket markets.

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
  params.set("limit", "500"); // pull a decent sample

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
    const MAX_AGE_DAYS = 90;

    function normCategory(cat) {
      if (!cat) return "";
      return String(cat).trim().toLowerCase().replace(/\s+/g, "-");
    }

    const bucket = new Map();

    for (const m of markets) {
      // reuse same recency filters as markets.js
      if (typeof m.closed === "boolean" && m.closed) continue;
      if (typeof m.active === "boolean" && !m.active) continue;

      const endStr = m.endDateIso || m.endDate;
      if (endStr) {
        const t = Date.parse(endStr);
        if (!Number.isNaN(t) && t < now - ONE_DAY_MS) continue;
      }

      const createdStr = m.createdAt || m.created_at;
      if (createdStr) {
        const t = Date.parse(createdStr);
        if (!Number.isNaN(t)) {
          const maxAgeMs = MAX_AGE_DAYS * ONE_DAY_MS;
          if (t < now - maxAgeMs) continue;
        }
      }

      const names = [];
      if (m.category) names.push(m.category);
      if (Array.isArray(m.categories)) names.push(...m.categories);
      if (m.categorySlug) names.push(m.categorySlug);
      if (m.category_slug) names.push(m.category_slug);

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
      .slice(0, 20);

    return res.status(200).json({ categories });
  } catch (err) {
    console.error("categories error", err);
    return res.status(500).json({ error: "failed_to_fetch" });
  }
};
