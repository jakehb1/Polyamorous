# Polymarket Category Tag ID Mappings

This document contains the verified tag IDs for each category, extracted directly from Polymarket's events API.

## Verified Tag IDs (from Events)

These tag IDs are verified from actual Polymarket events and match exactly what they use:

| Category | Tag ID | Label | Slug | Events Count |
|----------|--------|-------|------|--------------|
| **Politics** | 2 | Politics | politics | 267 events |
| **Finance** | 120 | Finance | finance | 22 events |
| **Crypto** | 21 | Crypto | crypto | 59 events |
| **Sports** | 1 | Sports | sports | 47 events |
| **Tech** | 1401 | Tech | tech | 49 events |
| **Geopolitics** | 100265 | Geopolitics | geopolitics | 100 events |
| **Culture** | 596 | Culture | pop-culture | 66 events |
| **World** | 101970 | World | world | 134 events |
| **Economy** | 100328 | Economy | economy | 26 events |
| **Elections** | 377 | Elections 2024 | elections-2024 | - |
| **Breaking** | 198 | Breaking News | breaking-news | 2 events |

## Sort Modes (No Tag IDs)

These are sort/filter modes, not categories, so they don't have tag IDs:
- **Trending** - Sort mode
- **New** - Sort mode

## Implementation

These tag IDs are used in:
- `api/markets.js` - `knownTagIds` object for fetching category markets
- `api/categories.js` - `categoryTagIds` object for category metadata

## Verification Method

Tag IDs were verified by:
1. Fetching 2000 events from `/events?closed=false&limit=2000`
2. Extracting all unique tags from events
3. Matching category names to tag labels/slugs
4. Selecting the most frequently used tag for each category

## Notes

- Tag IDs are on **events**, not markets directly
- Markets are nested inside events
- To fetch category markets, filter events by tag ID, then extract markets from matching events
- The `/markets?tag_id=X` endpoint returns 0 results (markets don't have tags directly)

