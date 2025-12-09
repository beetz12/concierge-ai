# Quick Reference: Google Maps Grounding Data Fields

## TL;DR

**Maps Grounding gives you**: Name, Place ID, Maps URI
**Maps Grounding does NOT give you**: Phone, hours, ratings, distance

**Solution**: Use Places API to enrich the data using the Place ID from grounding.

---

## Available Fields in groundingChunks.maps

```typescript
chunk.maps {
  uri: string;           // ✅ Maps URL
  title: string;         // ✅ Business name
  placeId: string;       // ✅ Unique identifier (use this!)
  text?: string;         // ✅ Optional description
}
```

---

## Missing Fields (Requires Places API)

```typescript
// ❌ NOT in grounding - must fetch from Places API:
{
  phone: string;
  rating: number;
  reviewCount: number;
  hours: OpeningHours;
  distance: Distance;
  address: string;
  website: string;
  priceLevel: string;
}
```

---

## Implementation Steps

### 1. Add Environment Variable

```bash
# apps/api/.env
GOOGLE_MAPS_API_KEY=your-maps-api-key-here
```

Get key from: https://console.cloud.google.com/google/maps-apis/credentials

### 2. Use the Places API Service

```typescript
import { fetchPlaceDetails, calculateDistance } from "./services/places-api";

// After getting grounding chunks:
const placeDetails = await fetchPlaceDetails(
  chunk.maps.placeId,
  process.env.GOOGLE_MAPS_API_KEY!,
);

const distance = calculateDistance(
  userLat,
  userLon,
  placeDetails.location.latitude,
  placeDetails.location.longitude,
);
```

### 3. Update Provider Interface

```typescript
export interface Provider {
  // From grounding
  id: string;
  name: string;
  placeId?: string;
  mapsUri?: string;

  // From Places API
  phone?: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  website?: string;
  openingHours?: {
    openNow: boolean;
    todayHours?: string;
  };
  distance?: {
    meters: number;
    text: string;
  };

  enriched: boolean;
}
```

---

## Cost Estimate

| API                         | Per Request | Notes                          |
| --------------------------- | ----------- | ------------------------------ |
| Gemini with Maps Grounding  | ~$0.000125  | Per 1K input tokens            |
| Places API - Basic fields   | $0.017      | displayName, location, address |
| Places API - Contact fields | $0.003      | phone, website                 |
| Places API - Atmosphere     | $0.005      | rating, reviews                |
| **Total per provider**      | **~$0.025** | All fields                     |

**For 3 providers per search**: ~$0.075

---

## Optimized Prompt

```typescript
const prompt = `You are a local business research assistant with access to Google Maps data.

Task: Find the top 3-4 ${query} near ${location} (${lat}, ${lng}).

Search Criteria:
- Only include businesses that are currently operational
- Prioritize higher-rated businesses (4.0+ stars)
- Include businesses with recent reviews
- Focus on businesses within 10 miles

For each business, provide the name and why it's a good match.`;
```

---

## Files Created

1. `/Users/dave/Work/concierge-ai/GOOGLE_MAPS_GROUNDING_ANALYSIS.md`
   - Complete analysis with documentation links
   - Detailed API structure breakdown
   - Cost analysis and optimization strategies

2. `/Users/dave/Work/concierge-ai/apps/api/src/services/places-api.ts`
   - Production-ready Places API service
   - TypeScript types for all responses
   - Distance calculation utilities
   - Helper functions for formatting data

3. `/Users/dave/Work/concierge-ai/PLACES_API_INTEGRATION_EXAMPLE.ts`
   - Complete working example
   - Shows how to integrate with existing code
   - Includes error handling and fallbacks
   - Console logging for debugging

---

## Next Steps

1. **Get API Key**: https://console.cloud.google.com/google/maps-apis/credentials
2. **Add to .env**: `GOOGLE_MAPS_API_KEY=your-key`
3. **Update gemini.ts**: Import and use `places-api.ts` functions
4. **Update Provider type**: Add new fields to interface
5. **Update frontend**: Display enriched data

---

## Key Insights

1. **Grounding is minimal**: Only provides place identification (ID, name, URI)
2. **Enrichment is essential**: You MUST use Places API for useful data
3. **Place ID is the key**: This connects grounding → enrichment
4. **Distance is local**: Calculate using Haversine (free, fast)
5. **Caching is important**: Places data doesn't change often (24hr TTL)

---

## Testing

```bash
# Test the Places API service
cd apps/api
pnpm dev

# In another terminal, test the enrichment
curl -X POST http://localhost:8000/api/v1/gemini/search-providers \
  -H "Content-Type: application/json" \
  -d '{
    "query": "plumbers",
    "location": "Greenville, SC",
    "coordinates": {
      "latitude": 34.8526,
      "longitude": -82.394
    }
  }'
```

Expected response with enriched data:

```json
{
  "providers": [
    {
      "id": "prov-...",
      "name": "Bob's Plumbing",
      "placeId": "places/ChIJ...",
      "phone": "(864) 555-1234",
      "rating": 4.7,
      "reviewCount": 142,
      "address": "123 Main St, Greenville, SC 29601",
      "distance": {
        "meters": 1234,
        "text": "0.8 mi"
      },
      "openingHours": {
        "openNow": true,
        "todayHours": "Monday: 8:00 AM – 5:00 PM"
      },
      "enriched": true
    }
  ]
}
```

---

## Documentation Links

- [Grounding with Google Maps](https://ai.google.dev/gemini-api/docs/maps-grounding)
- [Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [GroundingMetadata Reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/GroundingMetadata)
- [Google Maps Platform Pricing](https://mapsplatform.google.com/pricing/)

---

**Last Updated**: 2025-12-09
