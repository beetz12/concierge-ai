# Research API Enhancement Summary

## Overview
Updated the research system to support 10+ providers with comprehensive data using Google Places API as the primary search method, with fallback to Gemini Maps grounding.

## Files Modified

### 1. `/apps/api/src/services/research/types.ts`
**Changes:**
- Updated `ResearchRequest` interface:
  - Added `coordinates?: { latitude: number; longitude: number }` - User location for distance calculations
  - Added `maxDistance?: number` - Maximum distance filter in miles
  - Added `requirePhone?: boolean` - Filter for providers with phone numbers
  - Added `minReviewCount?: number` - Minimum review count filter

- Updated `ResearchResult` interface:
  - Changed status type to include `'partial'` status
  - Added `'google_places'` and `'hybrid'` to method types
  - Added `totalFound?: number` - Total results before filtering
  - Added `filteredCount?: number` - Count after filtering

- Updated `Provider` interface:
  - Added `'google_places'` to source types
  - Added `reviewCount?: number` - Total number of reviews
  - Added `distance?: number` - Miles from user location
  - Added `distanceText?: string` - Human-readable distance (e.g., "2.3 miles")
  - Added `hoursOfOperation?: string[]` - Array of weekday hours
  - Added `isOpenNow?: boolean` - Current open status
  - Added `placeId?: string` - Google Place ID
  - Added `googleMapsUri?: string` - Direct Google Maps link
  - Added `website?: string` - Business website URL
  - Added `internationalPhone?: string` - E.164 format phone number

### 2. `/apps/api/src/services/places/google-places.service.ts`
**Changes:**
- Exported `Provider` and `EnrichedProvider` interfaces to fix TypeScript errors
- Service provides:
  - `textSearch()` - Search for up to 20 places with location bias
  - `getPlaceDetails()` - Get full details including phone, hours, website
  - `calculateDistance()` - Calculate distance in miles using Haversine formula
  - `enrichProviders()` - Batch enrich providers with full details

### 3. `/apps/api/src/services/research/direct-research.client.ts`
**Major Updates:**

#### Initialization
- Added `GooglePlacesService` as optional class property
- Lazy-initializes Places API (graceful degradation if API key missing)
- Logs availability status

#### Primary Search Flow (research method)
1. **PRIMARY:** Try Google Places API (if available)
   - Call `searchWithPlacesAPI()` method
   - Return results if found
   - Log warning and fallback if no results

2. **FALLBACK:** Use Gemini Maps grounding
   - Call `searchWithMapsGrounding()`
   - Try JSON fallback if no results
   - Return with appropriate status

#### New Methods

**`searchWithPlacesAPI()`**
- Builds search query: `"${service} near ${location}"`
- Gets user coordinates (provided or from lookup)
- Calls Places API textSearch with 50km radius
- Enriches results with phone, hours, website for each place
- Calculates distance from user location
- Transforms to Provider format with all fields
- Applies filters (minRating, maxDistance, requirePhone, minReviewCount)
- Sorts by distance (closest first)
- Returns top 10 providers
- Includes comprehensive logging

**`filterProviders(providers, criteria)`**
- Filters by minimum rating (skips if rating < minRating)
- Filters by maximum distance (skips if distance > maxDistance)
- Filters by phone requirement (skips if no phone)
- Filters by minimum review count (skips if reviewCount < minReviewCount)
- Returns filtered array

**Updated Methods:**
- `searchWithMapsGrounding()` - Now requests top 10 (was 3-4)
- `searchWithJsonFallback()` - Now requests top 10 (was 3-4)
- `deduplicateProviders()` - Now returns top 10 (was 4)

## Key Features

### 1. Comprehensive Provider Data
Each provider now includes:
- ✅ Basic info (name, address, rating)
- ✅ Contact details (phone, international phone, website)
- ✅ Reviews count
- ✅ Distance from user (in miles with text format)
- ✅ Hours of operation (weekday descriptions)
- ✅ Current open/closed status
- ✅ Google Place ID for future enrichment
- ✅ Direct Google Maps link

### 2. Advanced Filtering
Supports filtering by:
- Minimum rating (e.g., 4.0+)
- Maximum distance (e.g., within 10 miles)
- Phone requirement (only providers with phone numbers)
- Minimum review count (e.g., 50+ reviews)

### 3. Intelligent Fallback
```
Google Places API (primary)
    ↓ (if fails or unavailable)
Gemini Maps Grounding (secondary)
    ↓ (if no results)
Gemini JSON Fallback (tertiary)
```

### 4. Distance-Based Sorting
Results sorted by proximity to user location (closest first)

### 5. Increased Result Count
Now returns up to **10 providers** (previously 4)

## Environment Variables

Required for full functionality:
```bash
# Existing (required)
GEMINI_API_KEY=...

# New (optional, enables Places API)
GOOGLE_PLACES_API_KEY=...
```

**Note:** If `GOOGLE_PLACES_API_KEY` is not set, system automatically falls back to Maps grounding without errors.

## API Response Example

```json
{
  "status": "success",
  "method": "google_places",
  "providers": [
    {
      "id": "places/ChIJ...",
      "name": "ABC Plumbing Services",
      "phone": "(864) 123-4567",
      "internationalPhone": "+1 864-123-4567",
      "rating": 4.8,
      "reviewCount": 127,
      "address": "123 Main St, Greenville, SC 29601",
      "distance": 2.3,
      "distanceText": "2.3 mi",
      "hoursOfOperation": [
        "Mon: 8:00 AM - 6:00 PM",
        "Tue: 8:00 AM - 6:00 PM",
        "Wed: 8:00 AM - 6:00 PM",
        "Thu: 8:00 AM - 6:00 PM",
        "Fri: 8:00 AM - 6:00 PM",
        "Sat: 9:00 AM - 2:00 PM",
        "Sun: Closed"
      ],
      "isOpenNow": true,
      "placeId": "places/ChIJ...",
      "googleMapsUri": "https://maps.google.com/?cid=...",
      "website": "https://abcplumbing.com",
      "source": "google_places",
      "reason": "Highly rated plumbers in Greenville SC (2.3 mi)"
    }
    // ... up to 9 more providers
  ],
  "reasoning": "Found 10 providers via Google Places API (18 total, 12 after filtering)",
  "totalFound": 18,
  "filteredCount": 10
}
```

## Usage Example

```typescript
const request: ResearchRequest = {
  service: 'plumbers',
  location: 'Greenville SC',
  minRating: 4.5,
  maxDistance: 10,        // NEW: Within 10 miles
  requirePhone: true,     // NEW: Must have phone
  minReviewCount: 25,     // NEW: At least 25 reviews
  coordinates: {          // NEW: Optional explicit coordinates
    latitude: 34.8526,
    longitude: -82.394
  }
};

const result = await directResearchClient.research(request);
// Returns up to 10 comprehensive provider results
```

## Backward Compatibility

✅ **Fully backward compatible**
- All existing fields preserved
- New fields are optional
- Falls back to Maps grounding if Places API unavailable
- Existing API calls continue to work without changes

## Testing

All types pass TypeScript compilation:
```bash
✓ pnpm check-types  # All packages pass
✓ pnpm build        # API builds successfully
```

## Next Steps

1. Add `GOOGLE_PLACES_API_KEY` to environment variables
2. Test with real searches to verify Places API integration
3. Monitor logs for API usage and fallback frequency
4. Consider adding rate limiting for Places API calls
5. Update frontend to display new provider fields (hours, website, etc.)
