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
    const allCategories = [];
    const seenSlugs = new Set();
    const MIN_VOLUME = 1000000; // $1M minimum
    
    // First, build a map of tag slugs to tag IDs for lookup
    const tagSlugToId = new Map();
    for (const tag of tags) {
      if (tag.id) {
        const slug = (tag.slug || tag.label || tag.name || "").toLowerCase();
        if (slug) {
          tagSlugToId.set(slug, tag.id);
        }
      }
    }
    
    // Add predefined categories first, looking up tagId from API tags
    for (const [key, cat] of Object.entries(categoryMap)) {
      // For sort modes, tagId stays null. For categories, look up the tagId
      let tagId = null;
      if (cat.isCategory && !cat.isSort) {
        tagId = tagSlugToId.get(cat.slug) || null;
      }
      
      allCategories.push({
        id: key,
        label: cat.label,
        icon: cat.icon,
        slug: cat.slug,
        isSort: cat.isSort || false,
        isCategory: cat.isCategory || false,
        tagId: tagId,
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
      
      if (isMainCategory && allCategories.length < 30) {
        allCategories.push({
          id: tag.id,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          icon: "📌",
          slug: slug,
          isSort: false,
          isCategory: true,
          tagId: tag.id,
        });
        seenSlugs.add(slug);
      }
    }

    // Filter categories: check if they have markets with $1M+ volume
    // Sort modes (trending, breaking, new) are always included
    const categories = [];
    
    // Check each category in parallel
    const categoryChecks = allCategories.map(async (cat) => {
      // Sort modes are always included
      if (cat.isSort) {
        return { ...cat, hasVolume: true };
      }
      
      // For categories, check if they have markets with $1M+ volume
      if (!cat.tagId) {
        return null; // Skip if no tag ID
      }
      
      try {
        const url = `${GAMMA_API}/markets?tag_id=${cat.tagId}&closed=false&active=true&limit=20`;
        const resp = await fetch(url);
        if (resp.ok) {
          const data = await resp.json();
          if (Array.isArray(data)) {
            // Check if any market has $1M+ volume
            const hasHighVolume = data.some(m => {
              if (m.closed || m.active === false) return false;
              const volume24hr = parseFloat(m.volume24hr) || 0;
              const volume = parseFloat(m.volume) || 0;
              const totalVolume = Math.max(volume24hr, volume);
              return totalVolume >= MIN_VOLUME;
            });
            return hasHighVolume ? { ...cat, hasVolume: true } : null;
          }
        }
      } catch (e) {
        console.log(`[categories] Error checking volume for ${cat.slug}:`, e.message);
      }
      
      return null; // Exclude if check failed or no high-volume markets
    });
    
    const checkedCategories = await Promise.all(categoryChecks);
    const filteredCategories = checkedCategories.filter(cat => cat !== null);
    
    console.log(`[categories] Filtered ${allCategories.length} categories to ${filteredCategories.length} with $1M+ volume markets`);

    return res.status(200).json({ 
      categories: filteredCategories,
      meta: { total: filteredCategories.length }
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

