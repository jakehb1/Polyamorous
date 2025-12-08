// api/categories.js
// Fetches categories from Supabase database (synced from Polymarket)
// Falls back to Polymarket Gamma API if database is not configured or empty

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const GAMMA_API = "https://gamma-api.polymarket.com";
  
  try {
    // Try to fetch from Supabase database first
    let useDatabase = false;
    let categories = [];
    
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      try {
        const { createClient } = require("@supabase/supabase-js");
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_KEY
        );
        
        // Check if we have categories synced within last hour
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        
        const { data: dbCategories, error } = await supabase
          .from('categories')
          .select('*')
          .gte('synced_at', oneHourAgo)
          .order('order_index', { ascending: true });
        
        if (!error && dbCategories && dbCategories.length > 0) {
          console.log(`[categories] Serving ${dbCategories.length} categories from database`);
          
          // Transform database format to API format
          categories = dbCategories.map(cat => ({
            id: cat.id,
            label: cat.label,
            icon: cat.icon || "",
            slug: cat.slug,
            isSort: cat.is_sort || false,
            isCategory: cat.is_category || false,
            tagId: cat.tag_id ? Number(cat.tag_id) : null
          }));
          
          useDatabase = true;
        }
      } catch (dbError) {
        console.log("[categories] Database fetch failed, falling back to API:", dbError.message);
        useDatabase = false;
      }
    }
    
    // If database fetch failed or returned no results, fall back to live API
    if (!useDatabase || categories.length === 0) {
      console.log("[categories] Fetching from Polymarket API (database not available or empty)");
      
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
    // Tag IDs verified from actual Polymarket events (see markets.js for source)
    const categoryTagIds = {
      "politics": 2,           // Politics - 267 events
      "finance": 120,          // Finance - 22 events
      "crypto": 21,            // Crypto - 59 events
      "sports": 1,             // Sports - 47 events
      "tech": 1401,           // Tech - 49 events
      "geopolitics": 100265,   // Geopolitics - 100 events
      "culture": 596,          // Culture (pop-culture) - 66 events
      "world": 101970,         // World - 134 events
      "economy": 100328,       // Economy - 26 events
      "elections": 377,        // Elections 2024
      "breaking": 198,         // Breaking News
    };
    
    const categoryMap = {
      "trending": { label: "Trending", icon: "", slug: "trending", isSort: true },
      "breaking": { label: "Breaking", icon: "", slug: "breaking", isSort: true, tagId: categoryTagIds["breaking"] },
      "new": { label: "New", icon: "", slug: "new", isSort: true },
      "politics": { label: "Politics", icon: "", slug: "politics", isCategory: true, tagId: categoryTagIds["politics"] },
      "sports": { label: "Sports", icon: "", slug: "sports", isCategory: true, tagId: categoryTagIds["sports"] },
      "finance": { label: "Finance", icon: "", slug: "finance", isCategory: true, tagId: categoryTagIds["finance"] },
      "crypto": { label: "Crypto", icon: "", slug: "crypto", isCategory: true, tagId: categoryTagIds["crypto"] },
      "geopolitics": { label: "Geopolitics", icon: "", slug: "geopolitics", isCategory: true, tagId: categoryTagIds["geopolitics"] },
      "earnings": { label: "Earnings", icon: "", slug: "earnings", isCategory: true },
      "tech": { label: "Tech", icon: "", slug: "tech", isCategory: true, tagId: categoryTagIds["tech"] },
      "culture": { label: "Culture", icon: "", slug: "culture", isCategory: true, tagId: categoryTagIds["culture"] },
      "world": { label: "World", icon: "", slug: "world", isCategory: true, tagId: categoryTagIds["world"] },
      "economy": { label: "Economy", icon: "", slug: "economy", isCategory: true, tagId: categoryTagIds["economy"] },
      "elections": { label: "Elections", icon: "", slug: "elections", isCategory: true, tagId: categoryTagIds["elections"] },
    };

    // Extract unique categories from tags
    const categories = [];
    const seenSlugs = new Set();
    
    // List of country names and other non-category terms to exclude
    const excludeTerms = new Set([
      'saudi arabia', 'united states', 'russia', 'china', 'india', 'brazil', 'japan',
      'germany', 'france', 'uk', 'united kingdom', 'canada', 'australia', 'south korea',
      'italy', 'spain', 'mexico', 'indonesia', 'netherlands', 'turkey', 'switzerland',
      'poland', 'belgium', 'sweden', 'norway', 'denmark', 'finland', 'ireland',
      'portugal', 'greece', 'czech republic', 'romania', 'hungary', 'ukraine',
      'israel', 'egypt', 'south africa', 'argentina', 'chile', 'colombia', 'peru',
      'philippines', 'vietnam', 'thailand', 'malaysia', 'singapore', 'new zealand',
      'saudi', 'arabia', 'arab', 'emirates', 'qatar', 'kuwait', 'bahrain', 'oman'
    ]);
    
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
    // Use exact slug matching to get the same tag IDs Polymarket uses
    for (const [key, cat] of Object.entries(categoryMap)) {
      // Use predefined tagId if available (from verified mapping), otherwise look up
      let tagId = cat.tagId || null;
      
      if (cat.isCategory && !cat.isSort && !tagId) {
        // Fallback: look up the tagId by exact slug match
        tagId = tagSlugToId.get(cat.slug) || null;
        
        // If exact match fails, try to find by label/name
        if (!tagId) {
          for (const tag of tags) {
            const tagSlug = (tag.slug || tag.label || tag.name || "").toLowerCase();
            if (tagSlug === cat.slug.toLowerCase() && tag.id) {
              tagId = tag.id;
              break;
            }
          }
        }
        
        if (tagId) {
          console.log(`[categories] Found tag ID for ${cat.slug}: ${tagId}`);
        } else {
          console.log(`[categories] WARNING: No tag ID found for ${cat.slug}`);
        }
      } else if (tagId) {
        console.log(`[categories] Using verified tag ID for ${cat.slug}: ${tagId}`);
      }
      
      // Always add predefined categories - they should match Polymarket's structure
      categories.push({
        id: key,
        label: cat.label,
        icon: cat.icon,
        slug: cat.slug,
        isSort: cat.isSort || false,
        isCategory: cat.isCategory || false,
        tagId: tagId, // Exact tag ID from Polymarket's /tags endpoint
      });
      seenSlugs.add(cat.slug);
    }

    // Add additional categories from tags that aren't already included
    // Only add well-known category types, exclude countries and specific entities
    for (const tag of tags) {
      const slug = (tag.slug || tag.label || tag.name || "").toLowerCase();
      const label = tag.label || tag.name || slug;
      
      // Skip if we already have this category or if it's too generic
      if (seenSlugs.has(slug) || !tag.id) continue;
      
      // Exclude country names and other non-category terms
      if (excludeTerms.has(slug)) continue;
      
      // Exclude if it contains country-like patterns (multiple words, proper nouns)
      const words = slug.split(/\s+/);
      if (words.length > 2) continue; // Too specific
      
      // Only add if it looks like a main category (not too specific)
      const isMainCategory = !slug.includes("-") || slug.split("-").length <= 2;
      
      // Additional check: exclude if it looks like a person name or specific entity
      const isProperNoun = /^[A-Z]/.test(label) && words.length === 1;
      if (isProperNoun && !['nfl', 'nba', 'mlb', 'nhl', 'ufc', 'wnba', 'cbb', 'cfb'].includes(slug)) {
        continue;
      }
      
      if (isMainCategory && categories.length < 25) {
        categories.push({
          id: tag.id,
          label: label.charAt(0).toUpperCase() + label.slice(1),
          icon: "",
          slug: slug,
          isSort: false,
          isCategory: true,
          tagId: tag.id,
        });
        seenSlugs.add(slug);
      }
    }

      console.log(`[categories] Returning ${categories.length} categories from API`);
    } else {
      console.log(`[categories] Returning ${categories.length} categories from database`);
    }

    return res.status(200).json({ 
      categories: categories,
      meta: { 
        total: categories.length,
        source: useDatabase ? 'database' : 'api'
      }
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

