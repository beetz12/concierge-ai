# How to Update gemini.ts to Include Places API Enrichment

## Step 1: Add Environment Variable

Add to `/Users/dave/Work/concierge-ai/apps/api/.env`:

```bash
GOOGLE_MAPS_API_KEY=your-maps-api-key-here
```

## Step 2: Update Provider Interface

In `/Users/dave/Work/concierge-ai/apps/api/src/services/gemini.ts`, replace the Provider interface:

```typescript
// OLD (lines 4-11)
export interface Provider {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  address?: string;
  source?: "Google Maps" | "User Input";
}

// NEW
export interface Provider {
  // Basic info
  id: string;
  name: string;
  placeId?: string;
  mapsUri?: string;

  // Contact information
  phone?: string;
  internationalPhone?: string;
  website?: string;

  // Business information
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";

  // Location & Distance
  address?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  distance?: {
    meters: number;
    text: string;
  };

  // Hours of operation
  openingHours?: {
    openNow: boolean;
    todayHours?: string;
    weekdayText?: string[];
  };

  // Metadata
  source: "Google Maps" | "User Input";
  enriched?: boolean;
}
```

## Step 3: Add Import

At the top of `gemini.ts`, add:

```typescript
import {
  fetchPlaceDetails,
  calculateDistance,
  isOpenNow,
  getTodayHours,
  formatPriceLevel,
  type PlaceDetails,
} from "./places-api";
```

## Step 4: Update searchProviders Function

Replace the `searchProviders` function (lines 54-143) with this enhanced version:

```typescript
export const searchProviders = async (
  query: string,
  location: string,
  coordinates?: { latitude: number; longitude: number },
): Promise<SearchProvidersResult> => {
  try {
    const ai = getAiClient();

    // Verify Maps API key is configured
    const mapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
    if (!mapsApiKey) {
      console.warn(
        "⚠️  GOOGLE_MAPS_API_KEY not configured. Provider data will not be enriched.",
      );
    }

    // Optimized prompt for better Maps grounding results
    const latLng = coordinates || { latitude: 34.8526, longitude: -82.394 };
    const prompt = `You are a local business research assistant with access to Google Maps data.

Task: Find the top 3-4 ${query} near ${location} (${latLng.latitude}, ${latLng.longitude}).

Search Criteria:
- Only include businesses that are currently operational
- Prioritize higher-rated businesses (4.0+ stars preferred)
- Include businesses with recent reviews
- Focus on businesses within 10 miles of the specified location

For each business you find, provide:
1. The official business name
2. A brief explanation of why this business is a good match
3. Any standout features or specialties

Use Google Maps to find accurate, up-to-date information about local businesses.`;

    // Step 1: Get grounded results from Gemini
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: { latLng },
        },
      },
    });

    const groundingChunks =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const providers: Provider[] = [];

    // Step 2: Process grounding chunks and enrich with Places API
    if (groundingChunks && mapsApiKey) {
      for (let i = 0; i < groundingChunks.length; i++) {
        const chunk = groundingChunks[i];

        if (!chunk.maps?.placeId) continue;

        const { placeId, uri, title } = chunk.maps;

        try {
          // Fetch detailed information from Places API
          const placeDetails: PlaceDetails = await fetchPlaceDetails(
            placeId,
            mapsApiKey,
          );

          // Calculate distance from user location
          const distance = calculateDistance(
            latLng.latitude,
            latLng.longitude,
            placeDetails.location.latitude,
            placeDetails.location.longitude,
          );

          // Build enriched provider object
          providers.push({
            id: `prov-${Date.now()}-${i}`,
            name: placeDetails.displayName.text,
            placeId,
            mapsUri: uri,

            // Contact info
            phone: placeDetails.nationalPhoneNumber,
            internationalPhone: placeDetails.internationalPhoneNumber,
            website: placeDetails.websiteUri,

            // Business info
            rating: placeDetails.rating,
            reviewCount: placeDetails.userRatingCount,
            priceLevel: formatPriceLevel(placeDetails.priceLevel),
            businessStatus: placeDetails.businessStatus,

            // Location
            address: placeDetails.formattedAddress,
            location: placeDetails.location,
            distance,

            // Hours
            openingHours: placeDetails.currentOpeningHours
              ? {
                  openNow: isOpenNow(placeDetails.currentOpeningHours),
                  todayHours:
                    getTodayHours(placeDetails.currentOpeningHours) ||
                    undefined,
                  weekdayText:
                    placeDetails.currentOpeningHours.weekdayDescriptions,
                }
              : undefined,

            // Metadata
            source: "Google Maps",
            enriched: true,
          });
        } catch (error) {
          console.error(`Failed to enrich ${title}:`, error);

          // Fallback to basic data from grounding
          providers.push({
            id: `prov-${Date.now()}-${i}`,
            name: title,
            placeId,
            mapsUri: uri,
            source: "Google Maps",
            enriched: false,
          });
        }
      }
    } else if (groundingChunks) {
      // No Maps API key - use basic grounding data only
      groundingChunks.forEach((chunk: any, index: number) => {
        if (chunk.maps) {
          providers.push({
            id: `prov-${Date.now()}-${index}`,
            name: chunk.maps.title || "Unknown Provider",
            placeId: chunk.maps.placeId,
            mapsUri: chunk.maps.uri,
            address: chunk.maps.text || "Address not available",
            source: "Google Maps",
            enriched: false,
          });
        }
      });
    }

    // Fallback to parsing text response if no grounding chunks
    if (providers.length === 0 && response.text) {
      try {
        const cleanedText = cleanJson(response.text);
        const parsed = JSON.parse(cleanedText);
        if (Array.isArray(parsed)) {
          parsed.forEach((p, idx) => {
            providers.push({
              id: `prov-${Date.now()}-${idx}`,
              name: p.name,
              address: p.address,
              rating: p.rating,
              source: "Google Maps",
              enriched: false,
            });
          });
        }
      } catch (e) {
        console.error("Failed to parse JSON fallback", e, response.text);
      }
    }

    // Sort by distance (if available), otherwise keep original order
    providers.sort((a, b) => {
      if (!a.distance || !b.distance) return 0;
      return a.distance.meters - b.distance.meters;
    });

    // Limit to top 3 providers
    const uniqueProviders = providers
      .filter((v, i, a) => a.findIndex((v2) => v2.name === v.name) === i)
      .slice(0, 3);

    // Generate enhanced log detail
    const enrichedCount = uniqueProviders.filter((p) => p.enriched).length;
    const avgRating =
      uniqueProviders
        .filter((p) => p.rating)
        .reduce((sum, p) => sum + (p.rating || 0), 0) /
      (uniqueProviders.filter((p) => p.rating).length || 1);

    const detail =
      enrichedCount > 0
        ? `Found ${uniqueProviders.length} providers. ${enrichedCount} enriched with ratings, hours, and contact info. Average rating: ${avgRating.toFixed(1)}★`
        : `Identified ${uniqueProviders.length} potential candidates in ${location}.`;

    return {
      providers: uniqueProviders,
      logs: {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail,
        status: uniqueProviders.length > 0 ? "success" : "warning",
      },
    };
  } catch (error: any) {
    console.error("searchProviders error:", error);
    return {
      providers: [],
      logs: {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail: `Failed to find providers: ${error.message}`,
        status: "error",
      },
    };
  }
};
```

## Step 5: Update .env.example

Add to `/Users/dave/Work/concierge-ai/apps/api/.env.example`:

```bash
# Google Maps Platform API Key
# Get from: https://console.cloud.google.com/google/maps-apis/credentials
# Required for enriching provider data with phone, hours, ratings, etc.
GOOGLE_MAPS_API_KEY=your-maps-api-key-here
```

## Step 6: Test the Changes

```bash
# Start the backend
cd apps/api
pnpm dev

# In another terminal, test the endpoint
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

## Expected Response

```json
{
  "providers": [
    {
      "id": "prov-1702345678901-0",
      "name": "ABC Plumbing Services",
      "placeId": "places/ChIJAbC123...",
      "mapsUri": "https://maps.google.com/?cid=...",
      "phone": "(864) 555-1234",
      "internationalPhone": "+1 864-555-1234",
      "website": "https://abcplumbing.com",
      "rating": 4.7,
      "reviewCount": 142,
      "priceLevel": "$$",
      "businessStatus": "OPERATIONAL",
      "address": "123 Main St, Greenville, SC 29601",
      "location": {
        "latitude": 34.8526,
        "longitude": -82.394
      },
      "distance": {
        "meters": 1234,
        "text": "0.8 mi"
      },
      "openingHours": {
        "openNow": true,
        "todayHours": "Monday: 8:00 AM – 5:00 PM",
        "weekdayText": [
          "Monday: 8:00 AM – 5:00 PM",
          "Tuesday: 8:00 AM – 5:00 PM",
          ...
        ]
      },
      "source": "Google Maps",
      "enriched": true
    }
  ],
  "logs": {
    "timestamp": "2025-12-09T10:30:00.000Z",
    "stepName": "Market Research",
    "detail": "Found 3 providers. 3 enriched with ratings, hours, and contact info. Average rating: 4.6★",
    "status": "success"
  }
}
```

## Backward Compatibility

The changes are backward compatible:

- If `GOOGLE_MAPS_API_KEY` is not set, the service falls back to basic grounding data
- All new fields are optional, so existing code won't break
- The response structure remains the same, just with more data

## Frontend Updates

To display the new fields in the frontend, update `/Users/dave/Work/concierge-ai/apps/web/lib/types.ts`:

```typescript
export interface Provider {
  id: string;
  name: string;
  placeId?: string;
  mapsUri?: string;
  phone?: string;
  internationalPhone?: string;
  website?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";
  address?: string;
  location?: {
    latitude: number;
    longitude: number;
  };
  distance?: {
    meters: number;
    text: string;
  };
  openingHours?: {
    openNow: boolean;
    todayHours?: string;
    weekdayText?: string[];
  };
  source: "Google Maps" | "User Input";
  enriched?: boolean;
}
```

Then update your components to display the rich data:

```tsx
// Example: ProviderCard.tsx
<div className="provider-card">
  <h3>{provider.name}</h3>

  {provider.rating && (
    <div className="rating">
      ⭐ {provider.rating} ({provider.reviewCount} reviews)
    </div>
  )}

  {provider.distance && (
    <div className="distance">📍 {provider.distance.text} away</div>
  )}

  {provider.phone && <a href={`tel:${provider.phone}`}>📞 {provider.phone}</a>}

  {provider.openingHours && (
    <div className={provider.openingHours.openNow ? "open" : "closed"}>
      {provider.openingHours.openNow ? "🟢 Open now" : "🔴 Closed"}
      {provider.openingHours.todayHours && (
        <span> • {provider.openingHours.todayHours}</span>
      )}
    </div>
  )}

  {provider.address && <div className="address">{provider.address}</div>}

  {provider.website && (
    <a href={provider.website} target="_blank" rel="noopener noreferrer">
      🌐 Visit website
    </a>
  )}
</div>
```

## Summary

1. ✅ Add `GOOGLE_MAPS_API_KEY` to `.env`
2. ✅ Copy `places-api.ts` to `apps/api/src/services/`
3. ✅ Update `Provider` interface in `gemini.ts`
4. ✅ Add import for Places API functions
5. ✅ Replace `searchProviders` function
6. ✅ Update frontend types
7. ✅ Update UI components to display rich data
8. ✅ Test the integration

The service now provides:

- Phone numbers
- Ratings and review counts
- Business hours (including "open now" status)
- Accurate addresses
- Distance from user
- Website URLs
- Price levels
- Business operational status

All while maintaining backward compatibility!
