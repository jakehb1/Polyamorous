// api/markets.js
// Live-ish Polymarket markets, with defensive local filtering for:
// - recency / end date
// - 24h volume for "volume" / "trending"
// - category matching (via ?category=slug)
// - textual year heuristics (hide obviously past-year elections etc.)
//
// kind=new        -> newest upcoming-ish markets
// kind=trending   -> markets by 24h volume desc (with 24h volume > 0)
// kind=volume     -> markets by total volume desc (but must have 24h volume > 0)
// kind=category   -> markets in a category (use &category=slug)

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

  const categorySlug = String(categorySlugRaw || "").toLowerCase();

  const params = new URLSearchParams();
  params.set("limit", String(limit));

  // Ask Gamma for markets ordered different ways depending on "kind"
  if (kind === "trending") {
    params.set("order", "volume24hr");
    params.set("ascending", "false");
  } else if (kind === "volume") {
    params.set("order", "volumeNum");
    params.set("ascending", "false");
  } else {
    // "new" and "category" -> newest created
    params.set("order", "createdAt");
    params.set("ascending", "false");
  }

  const url = `https://gamma-api.polymarket.com/markets?${params.toString()}`;

  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      console.error("Gamma error", resp.status, text);
      return res
        .status(resp.status)
        .json({ error: "gamma_error", status: resp.status });
    }

    const data = await resp.json();
    const markets = Array.isArray(data) ? data : (data.markets || []);

    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const MAX_AGE_DAYS = 365; // hard cap: ignore markets older than ~1 year
    const maxAgeMs = MAX_AGE_DAYS * ONE_DAY_MS;

    function normCategory(cat) {
      if (!cat) return "";
      return String(cat).trim().toLowerCase().replace(/\s+/g, "-");
    }

    function pickEndDate(m) {
      // Try a bunch of likely field names
      return (
        m.endDateIso ||
        m.endDateISO ||
        m.endDateUtc ||
        m.endDateUTC ||
        m.endDate ||
        m.closeDate ||
        m.closesAt ||
        m.endTime ||
        m.end_time ||
        m.expiresAt ||
        null
      );
    }

    function pickCreatedDate(m) {
      return (
        m.createdAt ||
        m.created_at ||
        m.creationTime ||
        m.openedAt ||
        null
      );
    }

    function yearFromQuestion(m) {
      const q = String(m.question || m.title || "");
      const match = q.match(/20\d{2}/); // 2000–2099
      if (!match) return null;
      return parseInt(match[0], 10);
    }

    const currentYear = new Date().getFullYear();

    const filtered = markets.filter((m) => {
      // 1) Basic "is it live-ish" filters

      // closed / inactive flags
      if (typeof m.closed === "boolean" && m.closed) return false;
      if (typeof m.active === "boolean" && !m.active) return false;

      // end date window: keep markets that end in the future, or within last 24h
      const endStr = pickEndDate(m);
      if (endStr) {
        const t = Date.parse(endStr);
        if (!Number.isNaN(t)) {
          if (t < now - ONE_DAY_MS) return false;
        }
      }

      // createdAt window: drop things older than ~1 year
      const createdStr = pickCreatedDate(m);
      if (createdStr) {
        const t = Date.parse(createdStr);
        if (!Number.isNaN(t)) {
          if (t < now - maxAgeMs) return false;
        }
      }

      // textual year heuristic: if question clearly references a past year,
      // treat it as dead. e.g. "Will X win the 2024 election?" when we're in 2025+.
      const year = yearFromQuestion(m);
      if (year && year < currentYear) {
        return false;
      }

      // 2) Volume-specific filters
      const vol24 = Number(m.volume24hr ?? m.volume24Hrs ?? m.volume24h ?? 0);
      if (kind === "trending" || kind === "volume") {
        // ignore markets that had no trading in last 24h
        if (!Number.isFinite(vol24) || vol24 <= 0) return false;
      }

      // 3) Category filter (if provided)
      if (categorySlug) {
        const candidates = [];

        if (m.category) candidates.push(m.category);
        if (Array.isArray(m.categories)) candidates.push(...m.categories);
        if (m.categorySlug) candidates.push(m.categorySlug);
        if (m.category_slug) candidates.push(m.category_slug);

        if (!candidates.length) return false;

        const hasMatch = candidates.some((c) => {
          const slug = normCategory(c);
          return slug === categorySlug;
        });

        if (!hasMatch) return false;
      }

      return true;
    });

    // Finally: enforce limit after filtering
    const limited = filtered.slice(0, Number(limit) || 10);
    return res.status(200).json(limited);
  } catch (err) {
    console.error("markets error", err);
    return res.status(500).json({ error: "failed_to_fetch" });
  }
};
