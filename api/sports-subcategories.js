// api/sports-subcategories.js
// Fetches sports subcategories (NFL, NBA, MLB, etc.) from Polymarket

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });

  const GAMMA_API = "https://gamma-api.polymarket.com";
  
  try {
    // Fetch all tags
    const tagsResp = await fetch(`${GAMMA_API}/tags`);
    
    if (!tagsResp.ok) {
      return res.status(500).json({ 
        error: "fetch_failed", 
        message: `Tags API returned ${tagsResp.status}`,
        subcategories: [] 
      });
    }

    const tags = await tagsResp.json();
    
    if (!Array.isArray(tags)) {
      return res.status(200).json({ 
        subcategories: [],
        meta: { total: 0 }
      });
    }

    // Sports subcategory keywords
    const sportsKeywords = [
      'nfl', 'nba', 'mlb', 'nhl', 'wnba', 'ufc', 'soccer', 'football', 'basketball', 
      'baseball', 'hockey', 'tennis', 'cricket', 'golf', 'boxing', 'formula', 'f1',
      'epl', 'la liga', 'bundesliga', 'serie a', 'ligue 1', 'mls', 'cbb', 'cfb',
      'college football', 'college basketball', 'ncaa', 'ncaaf', 'ncaab'
    ];

    // Map of known sports subcategories with icons
    const sportsMap = {
      'nfl': { label: 'NFL', icon: '' },
      'nba': { label: 'NBA', icon: '' },
      'mlb': { label: 'MLB', icon: '' },
      'nhl': { label: 'NHL', icon: '' },
      'wnba': { label: 'WNBA', icon: '' },
      'ufc': { label: 'UFC', icon: '' },
      'soccer': { label: 'Soccer', icon: '' },
      'football': { label: 'Football', icon: '' },
      'basketball': { label: 'Basketball', icon: '' },
      'baseball': { label: 'Baseball', icon: '' },
      'hockey': { label: 'Hockey', icon: '' },
      'tennis': { label: 'Tennis', icon: '' },
      'cricket': { label: 'Cricket', icon: '' },
      'golf': { label: 'Golf', icon: '' },
      'boxing': { label: 'Boxing', icon: '' },
      'formula': { label: 'Formula 1', icon: '' },
      'f1': { label: 'Formula 1', icon: '' },
      'epl': { label: 'EPL', icon: '' },
      'cbb': { label: 'College Basketball', icon: '' },
      'cfb': { label: 'College Football', icon: '' },
    };

    const subcategories = [];
    const seenSlugs = new Set();

    // Find sports-related tags
    for (const tag of tags) {
      if (!tag.id) continue;
      
      const slug = (tag.slug || tag.label || tag.name || "").toLowerCase();
      const label = tag.label || tag.name || slug;
      
      // Check if this tag matches any sports keyword
      const matchedKeyword = sportsKeywords.find(keyword => 
        slug.includes(keyword) || keyword.includes(slug)
      );
      
      if (matchedKeyword && !seenSlugs.has(slug)) {
        const sportsInfo = sportsMap[matchedKeyword] || sportsMap[slug] || {
          label: label.charAt(0).toUpperCase() + label.slice(1),
          icon: ''
        };
        
        subcategories.push({
          id: tag.id,
          label: sportsInfo.label,
          icon: sportsInfo.icon,
          slug: slug,
          tagId: tag.id,
        });
        
        seenSlugs.add(slug);
      }
    }

    // Sort by label
    subcategories.sort((a, b) => a.label.localeCompare(b.label));

    console.log(`[sports-subcategories] Returning ${subcategories.length} sports subcategories`);

    return res.status(200).json({ 
      subcategories: subcategories,
      meta: { total: subcategories.length }
    });
    
  } catch (err) {
    console.error("[sports-subcategories] Error:", err.message);
    return res.status(500).json({ 
      error: "fetch_failed", 
      message: err.message,
      subcategories: [] 
    });
  }
};

