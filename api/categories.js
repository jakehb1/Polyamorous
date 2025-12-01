// api/categories.js
// Build a live category list from Polymarket Gamma events.
// This is 100% driven by Polymarket data (no static list).

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

  // helper to normalize Polymarket category labels into slugs
  const toSlug = (s) =>
    String(s || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-");

  // optional: add emojis to known Polymarket categories
  const withEmoji = (slug, label) => {
    const lower = label.toLowerCase();
    if (lower.includes("politic")) return `🏛️ ${label}`;
    if (lower.includes("sport")) return `⚽ ${label}`;
    if (lower.includes("crypto") || lower.includes("defi")) return `₿ ${label}`;
    if (lower.includes("finance") || lower.includes("economy")) return `💰 ${label}`;
    if (lower.includes("world") || lower.includes("geopolitic")) return `🌍 ${label}`;
    if (lower.includes("tech")) return `💻 ${label}`;
    if (lower.includes("culture") || lower.includes("entertainment")) return `🎭 ${label}`;
    return label;
  };

  // pull a decent sample of live-ish events
  const params = new URLSearchParams();
  params.set("limit", "300");
  params.set("closed", "false");

  const url = `https://gamma-api.polymarket.com/events?${params.toString()}`;

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
    const events = Array.isArray(data) ? data : data.events || [];

    const bucket = new Map();

    for (const ev of events) {
      const names = [];

      // simple string category on the event
      if (ev.category) names.push(ev.category);

      // structured categories array on the event
      if (Array.isArray(ev.categories)) {
        for (const cat of ev.categories) {
          if (!cat) continue;
          if (typeof cat === "string") {
            names.push(cat);
          } else {
            if (cat.label) names.push(cat.label);
            else if (cat.slug) names.push(cat.slug);
            else if (cat.name) names.push(cat.name);
          }
        }
      }

      for (const raw of names) {
        const slug = toSlug(raw);
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
      .slice(0, 24) // top N
      .map((c) => ({
        slug: c.slug,
        label: withEmoji(c.slug, c.label),
      }));

    return res.status(200).json({ categories });
  } catch (err) {
    console.error("categories error", err);
    return res.status(500).json({ error: "failed_to_fetch" });
  }
};
