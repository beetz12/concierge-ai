# Google Maps Grounding API Analysis

## Overview

This document analyzes the Google GenAI SDK with Google Maps grounding to understand available provider data fields and optimal data enrichment strategies for the AI Concierge application.

**Current Implementation**: `/Users/dave/Work/concierge-ai/apps/api/src/services/gemini.ts`

---

## 1. Available Fields in groundingChunks.maps

### Current Gemini API Maps Grounding Structure

Based on official documentation research, the `groundingChunks.maps` object provides **LIMITED** fields:

```typescript
interface MapsGroundingChunk {
  maps: {
    uri: string; // Link to Google Maps place page
    title: string; // Display name of the location
    placeId: string; // Unique identifier (format: "places/ChIJ...")
    text?: string; // Additional descriptive text
  };
}
```

### Complete GroundingMetadata Structure

```typescript
interface GroundingMetadata {
  groundingChunks: Array<{
    maps?: {
      uri: string;
      title: string;
      placeId: string;
      text?: string;
      placeAnswerSources?: PlaceAnswerSources; // Review snippets
    };
  }>;
  groundingSupports: Array<{
    segment: {
      startIndex: number;
      endIndex: number;
      text: string;
    };
    groundingChunkIndices: number[];
  }>;
  webSearchQueries?: string[];
  googleMapsWidgetContextToken?: string; // For rendering Maps widget
}
```

**Key Limitations**:

- ❌ No phone number
- ❌ No hours of operation
- ❌ No rating or review count
- ❌ No distance from user location
- ❌ No full address details
- ✅ Only provides: name, placeId, URI, and review snippets

---

## 2. Missing Data From Grounding

The following critical fields are **NOT available** directly from Google Maps grounding:

| Field              | Available in Grounding? | Notes                              |
| ------------------ | ----------------------- | ---------------------------------- |
| Distance from user | ❌ No                   | Must be calculated separately      |
| Full address       | ❌ No                   | Only basic address in `text` field |
| Phone number       | ❌ No                   | Not included in grounding          |
| Hours of operation | ❌ No                   | Not included in grounding          |
| Average rating     | ❌ No                   | Not included in grounding          |
| Number of reviews  | ❌ No                   | Only review snippets available     |
| Website            | ❌ No                   | Not included in grounding          |
| Price level        | ❌ No                   | Not included in grounding          |

---

## 3. Data Enrichment Strategy

### Recommended Approach: Google Places API (New)

Since grounding only provides `placeId`, we should use the **Google Places API (New)** to enrich provider data.

#### Why Google Places API?

1. **Official Integration**: Direct continuation from Maps grounding
2. **Comprehensive Data**: All missing fields available
3. **Single Request**: Efficient batch enrichment
4. **Cost Effective**: Only pay for fields requested (Field Mask)

### Implementation Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Concierge Workflow                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
          ┌────────────────────────────────────────┐
          │  Step 1: Gemini + Maps Grounding       │
          │  Returns: name, placeId, uri           │
          └────────────────────────────────────────┘
                              │
                              ▼
          ┌────────────────────────────────────────┐
          │  Step 2: Places API Enrichment         │
          │  Input: placeId from grounding         │
          │  Returns: phone, hours, rating, etc.   │
          └────────────────────────────────────────┘
                              │
                              ▼
          ┌────────────────────────────────────────┐
          │  Step 3: Distance Calculation          │
          │  Use Haversine formula or              │
          │  Distance Matrix API                   │
          └────────────────────────────────────────┘
```

---

## 4. Google Places API Implementation

### Required Environment Variable

Add to `/Users/dave/Work/concierge-ai/apps/api/.env`:

```bash
# Google Maps Platform API Key
# Get from: https://console.cloud.google.com/google/maps-apis/credentials
GOOGLE_MAPS_API_KEY=your-maps-api-key-here
```

### Places API (New) - Field Mask

Request only needed fields to optimize cost:

```typescript
const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "internationalPhoneNumber",
  "nationalPhoneNumber",
  "currentOpeningHours",
  "rating",
  "userRatingCount",
  "websiteUri",
  "priceLevel",
  "businessStatus",
].join(",");
```

### Sample Code: Enrich Provider Data

```typescript
interface PlaceDetails {
  id: string;
  displayName: { text: string };
  formattedAddress: string;
  location: { latitude: number; longitude: number };
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  currentOpeningHours?: {
    openNow: boolean;
    weekdayDescriptions: string[];
  };
  rating?: number;
  userRatingCount?: number;
  websiteUri?: string;
  priceLevel?: string;
  businessStatus?: string;
}

async function enrichProviderData(
  placeId: string,
  apiKey: string,
): Promise<PlaceDetails> {
  const url = `https://places.googleapis.com/v1/${placeId}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": PLACE_FIELDS,
    },
  });

  if (!response.ok) {
    throw new Error(`Places API error: ${response.statusText}`);
  }

  return await response.json();
}
```

### Enhanced Provider Interface

Update `/Users/dave/Work/concierge-ai/apps/api/src/services/gemini.ts`:

```typescript
export interface Provider {
  id: string;
  name: string;

  // From Maps Grounding
  placeId?: string;
  mapsUri?: string;

  // From Places API Enrichment
  phone?: string;
  internationalPhone?: string;
  rating?: number;
  reviewCount?: number;
  address?: string;
  website?: string;
  priceLevel?: string;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY";

  // Opening Hours
  openingHours?: {
    openNow: boolean;
    weekdayText: string[];
  };

  // Location & Distance
  location?: {
    latitude: number;
    longitude: number;
  };
  distance?: {
    meters: number;
    text: string; // e.g., "2.3 km"
  };

  source: "Google Maps" | "User Input";
  enriched?: boolean;
}
```

---

## 5. Distance Calculation

### Option A: Haversine Formula (Client-Side)

Free and fast for straight-line distance:

```typescript
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): { meters: number; text: string } {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const meters = R * c;

  // Format distance text
  const text =
    meters >= 1000
      ? `${(meters / 1000).toFixed(1)} km`
      : `${Math.round(meters)} m`;

  return { meters, text };
}
```

### Option B: Distance Matrix API (Server-Side)

For driving/walking distance and duration:

```typescript
async function getDistanceMatrix(
  origins: string,
  destinations: string[],
  apiKey: string,
): Promise<DistanceMatrixResponse> {
  const url = new URL(
    "https://maps.googleapis.com/maps/api/distancematrix/json",
  );
  url.searchParams.set("origins", origins);
  url.searchParams.set("destinations", destinations.join("|"));
  url.searchParams.set("key", apiKey);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("units", "imperial");

  const response = await fetch(url.toString());
  return await response.json();
}
```

**Recommendation**: Use Haversine for initial sorting, Distance Matrix only if user needs driving directions.

---

## 6. Optimal Prompt Structure

### Current Prompt Issues

```typescript
// ❌ Current prompt is too generic
const prompt = `Find 3-4 top-rated ${query} near ${location}.
  Return a pure JSON array of objects with these exact fields:
  name, address, rating (number).`;
```

### Optimized Prompt for Maximum Data Extraction

```typescript
const prompt = `You are a local business research assistant with access to Google Maps data.

Task: Find the top 3-4 ${query} near ${location} (${latLng.latitude}, ${latLng.longitude}).

Search Criteria:
- Only include businesses that are currently operational
- Prioritize higher-rated businesses (4+ stars)
- Include businesses with recent reviews
- Focus on businesses within 10 miles

For each business, provide:
1. Official business name
2. Complete street address
3. Distance from user location
4. Operating status (open/closed)

Use Google Maps to find accurate, up-to-date information. Ground your response with Places data.`;
```

**Key Improvements**:

1. ✅ Explicit role definition ("research assistant")
2. ✅ Specific search radius constraint
3. ✅ Rating threshold guidance
4. ✅ Operational status filtering
5. ✅ Distance awareness instruction
6. ✅ Clear data requirements

---

## 7. Complete Implementation Example

### Updated `searchProviders` Function

```typescript
export const searchProviders = async (
  query: string,
  location: string,
  coordinates?: { latitude: number; longitude: number },
): Promise<SearchProvidersResult> => {
  try {
    const ai = getAiClient();
    const latLng = coordinates || { latitude: 34.8526, longitude: -82.394 };

    // Optimized prompt
    const prompt = `You are a local business research assistant with access to Google Maps data.

Task: Find the top 3-4 ${query} near ${location} (${latLng.latitude}, ${latLng.longitude}).

Search Criteria:
- Only include businesses that are currently operational
- Prioritize higher-rated businesses (4+ stars)
- Include businesses with recent reviews
- Focus on businesses within 10 miles

For each business, provide the business name and why it's a good match.`;

    // Step 1: Gemini with Maps Grounding
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

    if (groundingChunks) {
      // Step 2: Enrich with Places API
      for (const chunk of groundingChunks) {
        if (chunk.maps?.placeId) {
          try {
            const placeDetails = await enrichProviderData(
              chunk.maps.placeId,
              process.env.GOOGLE_MAPS_API_KEY!,
            );

            // Step 3: Calculate distance
            const distance = calculateDistance(
              latLng.latitude,
              latLng.longitude,
              placeDetails.location.latitude,
              placeDetails.location.longitude,
            );

            providers.push({
              id: `prov-${Date.now()}-${providers.length}`,
              name: placeDetails.displayName.text,
              placeId: chunk.maps.placeId,
              mapsUri: chunk.maps.uri,

              // Enriched data
              phone: placeDetails.nationalPhoneNumber,
              internationalPhone: placeDetails.internationalPhoneNumber,
              rating: placeDetails.rating,
              reviewCount: placeDetails.userRatingCount,
              address: placeDetails.formattedAddress,
              website: placeDetails.websiteUri,
              priceLevel: placeDetails.priceLevel,
              businessStatus: placeDetails.businessStatus,

              openingHours: placeDetails.currentOpeningHours
                ? {
                    openNow: placeDetails.currentOpeningHours.openNow,
                    weekdayText:
                      placeDetails.currentOpeningHours.weekdayDescriptions,
                  }
                : undefined,

              location: placeDetails.location,
              distance,

              source: "Google Maps",
              enriched: true,
            });
          } catch (error) {
            console.error(`Failed to enrich ${chunk.maps.placeId}:`, error);
            // Fallback to basic data
            providers.push({
              id: `prov-${Date.now()}-${providers.length}`,
              name: chunk.maps.title,
              placeId: chunk.maps.placeId,
              mapsUri: chunk.maps.uri,
              source: "Google Maps",
              enriched: false,
            });
          }
        }
      }
    }

    // Sort by distance
    providers.sort((a, b) => {
      if (!a.distance || !b.distance) return 0;
      return a.distance.meters - b.distance.meters;
    });

    return {
      providers: providers.slice(0, 3),
      logs: {
        timestamp: new Date().toISOString(),
        stepName: "Market Research",
        detail: `Found ${providers.length} providers. Enriched with ratings, hours, and contact info.`,
        status: providers.length > 0 ? "success" : "warning",
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

---

## 8. Cost Considerations

### Google Maps Platform Pricing (as of 2025)

1. **Gemini API with Maps Grounding**:
   - Included in Gemini API pricing
   - No separate Maps API charges for grounding

2. **Places API (New) - Place Details**:
   - Basic Data: $0.017 per request (displayName, location, placeId)
   - Contact Data: $0.003 per request (phone)
   - Atmosphere Data: $0.005 per request (rating, reviews)
   - **Total per provider**: ~$0.025 per enrichment

3. **Distance Matrix API** (optional):
   - $0.005 per element
   - Only use if driving directions needed

### Cost Optimization

```typescript
// Cache enriched provider data
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CachedProvider {
  data: Provider;
  timestamp: number;
}

const providerCache = new Map<string, CachedProvider>();

async function getEnrichedProvider(placeId: string): Promise<Provider> {
  const cached = providerCache.get(placeId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const enriched = await enrichProviderData(placeId, apiKey);
  providerCache.set(placeId, { data: enriched, timestamp: Date.now() });
  return enriched;
}
```

---

## 9. Summary & Recommendations

### Answers to Original Questions

1. **What fields are available in groundingChunks.maps?**
   - Only: `uri`, `title`, `placeId`, `text`, and `placeAnswerSources` (review snippets)

2. **Can we get phone, hours, rating, reviews, distance from grounding?**
   - ❌ No - grounding provides minimal data
   - ✅ Must use Places API for enrichment

3. **Best approach to enrich data?**
   - Use `placeId` from grounding → Query Places API (New) → Calculate distance locally

4. **Should we use Google Places API?**
   - ✅ **YES** - It's the official and most cost-effective solution
   - Provides all missing fields in a single request
   - Field Mask allows cost optimization

5. **Optimal prompt structure?**
   - Define explicit role and constraints
   - Specify search radius and quality thresholds
   - Request grounding with Places data
   - See Section 6 for complete example

### Implementation Priority

```
Priority 1 (Critical):
├── Add GOOGLE_MAPS_API_KEY to environment
├── Implement enrichProviderData() function
├── Update Provider interface with all fields
└── Integrate Places API into searchProviders()

Priority 2 (Enhancement):
├── Add distance calculation (Haversine)
├── Implement provider caching
├── Add error handling and fallbacks
└── Update frontend to display new fields

Priority 3 (Optimization):
├── Add Distance Matrix API for driving directions
├── Implement intelligent caching strategy
└── Add rate limiting and retry logic
```

---

## References

- [Grounding with Google Maps - Gemini API](https://ai.google.dev/gemini-api/docs/maps-grounding)
- [Grounding with Google Maps - Vertex AI](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-maps)
- [GroundingMetadata API Reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/reference/rest/v1beta1/GroundingMetadata)
- [Google Places API (New)](https://developers.google.com/maps/documentation/places/web-service/place-details)
- [Google Maps Platform Blog](https://blog.google/technology/developers/grounding-google-maps-gemini-api/)

---

**Document Created**: 2025-12-09
**Last Updated**: 2025-12-09
**Author**: Claude Code Analysis
