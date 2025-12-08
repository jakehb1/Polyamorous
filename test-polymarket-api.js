// Test script to verify Polymarket API connection and market fetching
// Run with: node test-polymarket-api.js

const GAMMA_API = "https://gamma-api.polymarket.com";

async function testPolymarketAPI() {
  console.log("=== Testing Polymarket Gamma API ===\n");
  
  // Test 1: Fetch all tags
  console.log("1. Testing /tags endpoint...");
  try {
    const tagsResp = await fetch(`${GAMMA_API}/tags`);
    if (tagsResp.ok) {
      const tags = await tagsResp.json();
      console.log(`   ✓ Found ${tags.length} tags`);
      
      // Find all tags that might be related to politics
      console.log("\n   Searching for politics-related tags...");
      const politicsRelated = tags.filter(tag => {
        const slug = (tag.slug || tag.label || tag.name || "").toLowerCase();
        return slug.includes('politic') || slug.includes('election') || slug.includes('president') || 
               slug.includes('senate') || slug.includes('congress') || slug === 'politics';
      });
      
      console.log(`   Found ${politicsRelated.length} politics-related tags:`);
      politicsRelated.forEach(t => {
        console.log(`     - ID: ${t.id}, slug: ${t.slug || t.label}, name: ${t.name || 'N/A'}`);
      });
      
      // Try to find the main "politics" tag - might be in label or name
      const politicsTag = tags.find(tag => {
        const slug = (tag.slug || tag.label || tag.name || "").toLowerCase();
        return slug === 'politics' || (tag.label && tag.label.toLowerCase() === 'politics') ||
               (tag.name && tag.name.toLowerCase() === 'politics');
      }) || politicsRelated[0]; // Use first related tag if no exact match
      
      if (politicsTag) {
        console.log(`\n   Using tag: ID=${politicsTag.id}, slug=${politicsTag.slug || politicsTag.label}, name=${politicsTag.name || 'N/A'}`);
        
        // Test 2: Fetch markets by politics tag ID
        console.log("\n2. Testing /markets?tag_id={politics_id} endpoint...");
        const marketsUrl = `${GAMMA_API}/markets?tag_id=${politicsTag.id}&closed=false&limit=100`;
        console.log(`   URL: ${marketsUrl}`);
        
        const marketsResp = await fetch(marketsUrl);
        if (marketsResp.ok) {
          const markets = await marketsResp.json();
          console.log(`   ✓ API returned ${Array.isArray(markets) ? markets.length : 'non-array'} markets`);
          
          if (Array.isArray(markets)) {
            const activeMarkets = markets.filter(m => !m.closed && m.active !== false);
            console.log(`   ✓ ${activeMarkets.length} active markets`);
            
            // Show top 10 by volume
            const sortedByVolume = activeMarkets
              .map(m => ({
                id: m.id,
                question: m.question,
                volume24hr: parseFloat(m.volume24hr) || 0,
                volume: parseFloat(m.volume) || 0,
                closed: m.closed,
                active: m.active,
                outcomePrices: m.outcomePrices
              }))
              .sort((a, b) => Math.max(b.volume24hr, b.volume) - Math.max(a.volume24hr, a.volume))
              .slice(0, 10);
            
            console.log("\n   Top 10 markets by volume:");
            sortedByVolume.forEach((m, i) => {
              const vol = Math.max(m.volume24hr, m.volume);
              console.log(`   ${i+1}. [${m.id}] ${m.question?.substring(0, 60)}...`);
              console.log(`      Volume: $${vol.toLocaleString()}, closed: ${m.closed}, active: ${m.active}`);
            });
            
            // Check volumes
            const volumes = activeMarkets.map(m => Math.max(parseFloat(m.volume24hr) || 0, parseFloat(m.volume) || 0));
            const maxVol = Math.max(...volumes);
            const marketsOver1M = volumes.filter(v => v >= 1000000).length;
            console.log(`\n   Volume stats: Max=$${maxVol.toLocaleString()}, Markets over $1M=${marketsOver1M}`);
            
            // Check price filter
            const withValidPrices = activeMarkets.filter(m => {
              let prices = m.outcomePrices;
              if (typeof prices === 'string') {
                try { prices = JSON.parse(prices); } catch(e) { return false; }
              }
              if (!prices || !Array.isArray(prices) || prices.length === 0) return false;
              return prices.some(p => {
                const num = parseFloat(p);
                return !isNaN(num) && num > 0 && num < 1;
              });
            });
            console.log(`   Markets with valid prices: ${withValidPrices.length}`);
            
            // Check volume filter ($0.01 minimum)
            const withVolume = activeMarkets.filter(m => {
              const vol = Math.max(parseFloat(m.volume24hr) || 0, parseFloat(m.volume) || 0);
              return vol > 0 && vol >= 0.01;
            });
            console.log(`   Markets with volume >= $0.01: ${withVolume.length}`);
            
            // Final count after all filters
            const finalMarkets = activeMarkets.filter(m => {
              // Price filter
              let prices = m.outcomePrices;
              if (typeof prices === 'string') {
                try { prices = JSON.parse(prices); } catch(e) { return false; }
              }
              if (!prices || !Array.isArray(prices) || prices.length === 0) return false;
              const hasValidPrice = prices.some(p => {
                const num = parseFloat(p);
                return !isNaN(num) && num > 0 && num < 1;
              });
              if (!hasValidPrice) return false;
              
              // Volume filter
              const vol = Math.max(parseFloat(m.volume24hr) || 0, parseFloat(m.volume) || 0);
              return vol > 0 && vol >= 0.01;
            });
            console.log(`\n   ✓ Final markets after all filters: ${finalMarkets.length}`);
            
          } else {
            console.log(`   ✗ API returned non-array:`, typeof markets);
          }
        } else {
          console.log(`   ✗ API returned status: ${marketsResp.status} ${marketsResp.statusText}`);
        }
      } else {
        console.log("   ✗ Politics tag not found");
        console.log("   Available tags with 'politic' in name:");
        tags.filter(t => {
          const slug = (t.slug || t.label || t.name || "").toLowerCase();
          return slug.includes('politic');
        }).forEach(t => {
          console.log(`     - ID: ${t.id}, slug: ${t.slug || t.label}, name: ${t.name}`);
        });
      }
    } else {
      console.log(`   ✗ Tags API returned status: ${tagsResp.status} ${tagsResp.statusText}`);
    }
  } catch (e) {
    console.log(`   ✗ Error: ${e.message}`);
  }
  
  // Test 3: Fetch all markets and check their tags
  console.log("\n3. Testing /markets endpoint (all markets)...");
  try {
    const allMarketsUrl = `${GAMMA_API}/markets?closed=false&limit=100`;
    console.log(`   URL: ${allMarketsUrl}`);
    const allMarketsResp = await fetch(allMarketsUrl);
    if (allMarketsResp.ok) {
      const allMarkets = await allMarketsResp.json();
      if (Array.isArray(allMarkets)) {
        console.log(`   ✓ Found ${allMarkets.length} total markets`);
        
        // Check what tags markets actually have
        const marketTags = new Set();
        allMarkets.forEach(m => {
          if (m.tags && Array.isArray(m.tags)) {
            m.tags.forEach(t => marketTags.add(t));
          }
          if (m.tagId) marketTags.add(m.tagId);
          if (m.tag_id) marketTags.add(m.tag_id);
        });
        console.log(`   Markets have ${marketTags.size} unique tag IDs`);
        
        // Find markets that might be politics-related by question
        const politicsMarkets = allMarkets.filter(m => {
          const q = (m.question || "").toLowerCase();
          return q.includes('trump') || q.includes('biden') || q.includes('election') || 
                 q.includes('president') || q.includes('senate') || q.includes('congress');
        });
        console.log(`   Found ${politicsMarkets.length} markets with politics keywords in question`);
        
        if (politicsMarkets.length > 0) {
          console.log("\n   Sample politics markets:");
          politicsMarkets.slice(0, 5).forEach((m, i) => {
            const vol = Math.max(parseFloat(m.volume24hr) || 0, parseFloat(m.volume) || 0);
            console.log(`   ${i+1}. [${m.id}] ${m.question?.substring(0, 60)}...`);
            console.log(`      Volume: $${vol.toLocaleString()}, tags: ${JSON.stringify(m.tags || m.tagId || m.tag_id)}`);
          });
        }
      }
    }
  } catch (e) {
    console.log(`   ✗ Error: ${e.message}`);
  }
  
  // Test 4: Try different query approaches
  console.log("\n4. Testing alternative query approaches...");
  try {
    // Try without tag_id - just closed=false
    const simpleUrl = `${GAMMA_API}/markets?closed=false&limit=50`;
    const simpleResp = await fetch(simpleUrl);
    if (simpleResp.ok) {
      const simpleMarkets = await simpleResp.json();
      if (Array.isArray(simpleMarkets)) {
        console.log(`   ✓ Simple query returned ${simpleMarkets.length} markets`);
        
        // Check volumes
        const volumes = simpleMarkets
          .filter(m => !m.closed && m.active !== false)
          .map(m => Math.max(parseFloat(m.volume24hr) || 0, parseFloat(m.volume) || 0));
        const maxVol = Math.max(...volumes, 0);
        const marketsOver1M = volumes.filter(v => v >= 1000000).length;
        console.log(`   Volume stats: Max=$${maxVol.toLocaleString()}, Markets over $1M=${marketsOver1M}`);
      }
    }
  } catch (e) {
    console.log(`   ✗ Error: ${e.message}`);
  }
  
  // Test 5: Check events endpoint - maybe categories are in events
  console.log("\n5. Testing /events endpoint for politics...");
  try {
    const eventsUrl = `${GAMMA_API}/events?closed=false&limit=100`;
    const eventsResp = await fetch(eventsUrl);
    if (eventsResp.ok) {
      const events = await eventsResp.json();
      if (Array.isArray(events)) {
        console.log(`   ✓ Found ${events.length} events`);
        
        // Find politics-related events
        const politicsEvents = events.filter(e => {
          const title = (e.title || "").toLowerCase();
          const slug = (e.slug || "").toLowerCase();
          const tags = e.tags || [];
          const hasPoliticsTag = tags.some(t => {
            const tagId = typeof t === 'object' ? t.id : t;
            return [375, 325, 359, 1026, 1022, 377, 1028, 1029, 343].includes(tagId);
          });
          return title.includes('trump') || title.includes('biden') || title.includes('election') ||
                 title.includes('president') || slug.includes('politic') || hasPoliticsTag;
        });
        
        console.log(`   Found ${politicsEvents.length} politics-related events`);
        
        if (politicsEvents.length > 0) {
          let totalMarkets = 0;
          politicsEvents.slice(0, 5).forEach((e, i) => {
            const markets = e.markets || [];
            totalMarkets += markets.length;
            const vol = parseFloat(e.volume) || 0;
            console.log(`   ${i+1}. [${e.id}] ${e.title?.substring(0, 60)}...`);
            console.log(`      Markets: ${markets.length}, Volume: $${vol.toLocaleString()}, Tags: ${JSON.stringify(e.tags)}`);
          });
          console.log(`   Total markets in politics events: ${totalMarkets}`);
        }
      }
    }
  } catch (e) {
    console.log(`   ✗ Error: ${e.message}`);
  }
  
  // Test 6: Check if there's a different way to query by category
  console.log("\n6. Checking market structure...");
  try {
    const sampleUrl = `${GAMMA_API}/markets?closed=false&limit=10`;
    const sampleResp = await fetch(sampleUrl);
    if (sampleResp.ok) {
      const sampleMarkets = await sampleResp.json();
      if (Array.isArray(sampleMarkets) && sampleMarkets.length > 0) {
        const sample = sampleMarkets[0];
        console.log("   Sample market structure:");
        console.log("   Keys:", Object.keys(sample).join(", "));
        console.log("   Has 'tags':", 'tags' in sample);
        console.log("   Has 'tagId':", 'tagId' in sample);
        console.log("   Has 'tag_id':", 'tag_id' in sample);
        console.log("   Has 'category':", 'category' in sample);
        console.log("   Has 'categories':", 'categories' in sample);
        if (sample.tags) console.log("   tags value:", JSON.stringify(sample.tags));
        if (sample.tagId) console.log("   tagId value:", sample.tagId);
        if (sample.tag_id) console.log("   tag_id value:", sample.tag_id);
      }
    }
  } catch (e) {
    console.log(`   ✗ Error: ${e.message}`);
  }
  
  console.log("\n=== Test Complete ===");
}

testPolymarketAPI().catch(console.error);

