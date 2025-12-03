// api/categories.js
// Fetches all available categories/tags from Polymarket Gamma API

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const GAMMA_API = "https://gamma-api.polymarket.com";
  
  try {
    // Fetch all tags/categories
    const tagsResp = await fetch(`${GAMMA_API}/tags`);
    
    if (!tagsResp.ok) {
      return res.status(500).json({ 
        error: "fetch_failed", 
        message: `Tags API returned ${tagsResp.status}`,
        categories: [] 
      });
    }

    const tags = await tagsResp.json();
    
    if (!Array.isArray(tags)) {
      return res.status(200).json({ 
        categories: [],
        meta: { total: 0 }
      });
    }

    // Map Polymarket categories to our format
    // Common categories based on Polymarket's structure
    const categoryMap = {
      "trending": { label: "Trending", icon: "🔥", slug: "trending", isSort: true },
      "breaking": { label: "Breaking", icon: "⚡", slug: "breaking", isSort: true },
      "new": { label: "New", icon: "🆕", slug: "new", isSort: true },
      "politics": { label: "Politics", icon: "🏛️", slug: "politics", isCategory: true },
      "sports": { label: "Sports", icon: "⚽", slug: "sports", isCategory: true },
      "finance": { label: "Finance", icon: "💰", slug: "finance", isCategory: true },
      "crypto": { label: "Crypto", icon: "₿", slug: "crypto", isCategory: true },
      "geopolitics": { label: "Geopolitics", icon: "🌍", slug: "geopolitics", isCategory: true },
      "earnings": { label: "Earnings", icon: "📊", slug: "earnings", isCategory: true },
      "tech": { label: "Tech", icon: "💻", slug: "tech", isCategory: true },
      "culture": { label: "Culture", icon: "🎭", slug: "culture", isCategory: true },
      "world": { label: "World", icon: "🌎", slug: "world", isCategory: true },
      "economy": { label: "Economy", icon: "📈", slug: "economy", isCategory: true },
      "elections": { label: "Elections", icon: "🗳️", slug: "elections", isCategory: true },
    };

    // Extract unique categories from tags
    const categories = [];
    const seenSlugs = new Set();
    
    // Add predefined categories first
    for (const [key, cat] of Object.entries(categoryMap)) {
      categories.push({
        id: key,
        label: cat.label,
        icon: cat.icon,
        slug: cat.slug,
        isSort: cat.isSort || false,
        isCategory: cat.isCategory || false,
      });
      seenSlugs.add(cat.slug);
    }

    // Add additional categories from tags that aren't already included
    for (const tag of tags) {
      const slug = (tag.slug || tag.label || tag.name || "").toLowerCase();
      const label = tag.label || tag.name || slug;
      
      // Skip if we already have this category or if it's too generic
      if (seenSlugs.has(slug) || !tag.id) continue;
      
      // Only add if it looks like a main category (not too specific)
      const isMainCategory = !slug.includes("-") || slug.split("-").length <= 2;
      
      if (isMainCategory && categories.length < 30) {
        categories.push({
          id: tag.id,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          icon: "📌",
          slug: slug,
          isSort: false,
          isCategory: true,
        });
        seenSlugs.add(slug);
      }
    }

    console.log("[categories] Returning", categories.length, "categories");

    return res.status(200).json({ 
      categories: categories,
      meta: { total: categories.length }
    });
    
  } catch (err) {
    console.error("[categories] Error:", err.message);
    return res.status(500).json({ 
      error: "fetch_failed", 
      message: err.message,
      categories: [] 
    });
  }
};

