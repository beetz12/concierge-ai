# Google Places Service

Production-ready Google Places API (New) service for the AI Concierge project.

## Files Created

- `/Users/dave/Work/concierge-ai/apps/api/src/services/places/google-places.service.ts` - Main service implementation
- `/Users/dave/Work/concierge-ai/apps/api/src/services/places/index.ts` - Export file
- `/Users/dave/Work/concierge-ai/apps/api/src/services/places/example-usage.ts` - Usage examples

## Features

### 1. Text Search (`textSearch`)
Search for places using natural language queries with optional location bias and radius.

```typescript
const service = new GooglePlacesService();
const result = await service.textSearch(
  'plumbers in Greenville SC',
  { latitude: 34.8526, longitude: -82.3940 },
  50000 // 50km radius
);

console.log(`Found ${result.places.length} places`);
result.places.forEach(place => {
  console.log(place.name, place.rating, place.formattedAddress);
});
```

**Returns:** Up to 20 places with:
- Place ID, name, address
- Rating and review count
- Location coordinates
- Business status
- Google Maps URI
- Next page token (for pagination)

### 2. Place Details (`getPlaceDetails`)
Get comprehensive details for a specific place.

```typescript
const details = await service.getPlaceDetails(placeId);
if (details) {
  console.log('Phone:', details.phone);
  console.log('Website:', details.website);
  console.log('Open now:', details.openingHours?.openNow);
  console.log('Hours:', details.openingHours?.weekdayText);
}
```

**Returns:**
- All basic place info
- Phone numbers (national & international)
- Website URL
- Opening hours (formatted as "Mon: 8:00 AM - 6:00 PM")
- Current open/closed status

### 3. Distance Calculation (`calculateDistance`)
Calculate distance between two coordinates using Haversine formula.

```typescript
const distance = service.calculateDistance(
  { latitude: 34.8526, longitude: -82.3940 }, // Greenville, SC
  { latitude: 35.2271, longitude: -80.8431 }  // Charlotte, NC
);
console.log(`Distance: ${distance} miles`); // Distance: 95.3 miles
```

**Returns:** Distance in miles (rounded to 1 decimal place)

### 4. Batch Enrichment (`enrichProviders`)
Enrich multiple providers with full details in rate-limited batches.

```typescript
const basicProviders = searchResult.places.map(place => ({
  placeId: place.placeId,
  name: place.name,
}));

const enriched = await service.enrichProviders(
  basicProviders,
  { latitude: 34.8526, longitude: -82.3940 }
);

enriched.forEach(provider => {
  console.log(provider.name);
  console.log('  Phone:', provider.phone);
  console.log('  Distance:', provider.distance, 'mi');
  console.log('  Hours:', provider.openingHours?.weekdayText);
});
```

**Features:**
- Processes in batches of 5 (rate limiting)
- 200ms delay between batches
- Adds phone, hours, website to each provider
- Calculates distance from user location
- Graceful error handling (returns original on failure)

## TypeScript Interfaces

```typescript
interface PlaceSearchResult {
  placeId: string;
  name: string;
  formattedAddress: string;
  rating?: number;
  userRatingsTotal?: number;
  location: { latitude: number; longitude: number };
  businessStatus?: string;
  googleMapsUri?: string;
}

interface PlaceDetails extends PlaceSearchResult {
  phone?: string;
  internationalPhone?: string;
  openingHours?: {
    openNow?: boolean;
    weekdayText?: string[];
  };
  website?: string;
}

interface TextSearchResponse {
  places: PlaceSearchResult[];
  nextPageToken?: string;
}

interface Provider {
  placeId: string;
  [key: string]: any;
}

interface EnrichedProvider extends Provider {
  phone?: string;
  internationalPhone?: string;
  openingHours?: {
    openNow?: boolean;
    weekdayText?: string[];
  };
  website?: string;
  distance?: number;
}
```

## Environment Setup

Required environment variable in `/Users/dave/Work/concierge-ai/apps/api/.env`:

```
GOOGLE_PLACES_API_KEY=your_api_key_here
```

## Error Handling

- **Text Search:** Throws error with detailed message if API call fails
- **Place Details:** Returns `null` instead of throwing (graceful degradation)
- **Batch Enrichment:** Logs errors but continues, returns original provider if enrichment fails
- All errors are logged with context (status, response data, messages)

## Usage in Project

The service is already integrated into the research client:

```typescript
// apps/api/src/services/research/direct-research.client.ts
import { GooglePlacesService } from '../places/google-places.service.js';

const placesService = new GooglePlacesService();
const result = await placesService.textSearch(query, coordinates, 50000);
```

## API Documentation

Uses Google Places API (New):
- **Base URL:** `https://places.googleapis.com/v1`
- **Auth:** API key via `X-Goog-Api-Key` header
- **Field Mask:** `X-Goog-FieldMask` header for selecting fields

### Endpoints Used

1. **Text Search**
   - `POST /places:searchText`
   - Max 20 results per request
   - Supports pagination with nextPageToken

2. **Place Details**
   - `GET /places/{placeId}`
   - Fetches comprehensive place information

## Rate Limiting

- Batch enrichment processes 5 places at a time
- 200ms delay between batches
- Helps stay within Google API quota limits

## Testing

See `/Users/dave/Work/concierge-ai/apps/api/src/services/places/example-usage.ts` for complete examples including:
- Basic text search
- Getting place details
- Distance calculations
- Batch enrichment
- Pagination handling
