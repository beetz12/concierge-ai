# Implementation Plan: 10+ Providers with Comprehensive Data

**Created:** 2025-01-09
**Confidence Level:** 90%
**Status:** COMPLETE

---

## Overview

Update the research_providers Kestra flow and direct Gemini API to find at least 10 providers with comprehensive data including:

- Distance from user location
- Phone number (CRITICAL for VAPI)
- Hours of operation
- Average rating
- Number of reviews
- Full address

## Critical Discovery

**Google Maps grounding API does NOT provide:**

- Phone numbers
- Hours of operation
- Review count
- Distance calculation

**Solution:** Google Places API (New) provides ALL required fields.

---

## Implementation Phases

### Phase 1: Google Places API Service

**New file:** `apps/api/src/services/places/google-places.service.ts`

Features:

- Text Search API: Find 20 providers per query
- Place Details API: Get phone, hours, reviews
- Distance calculation: Haversine formula
- Batch processing: 5 providers at a time

### Phase 2: Enhanced Provider Types

**File:** `apps/api/src/services/gemini.ts`

New fields:

- `reviewCount: number`
- `distance: number` (miles)
- `hoursOfOperation: string[]`
- `isOpenNow: boolean`
- `placeId: string`

### Phase 3: Kestra Flow Updates

**File:** `kestra/flows/research_agent.yaml`

Changes:

- Increase from 5 → 15 candidates
- Return top 10 (not 3)
- Add filtering by minRating, requirePhone
- New inputs: max_distance, latitude, longitude

### Phase 4: Direct API Updates

**File:** `apps/api/src/services/gemini.ts`

Changes:

- Integrate Google Places service
- Two-step: Places API → Details enrichment
- Filter by criteria before returning
- Sort by distance (closest first)
- Return 10 providers

### Phase 5: Route Updates

**File:** `apps/api/src/routes/gemini.ts`

New parameters:

- `coordinates: { latitude, longitude }`
- `minRating: number`
- `maxDistance: number`
- `requirePhone: boolean`

### Phase 6: Database Migration

**New file:** `supabase/migrations/...`

New columns: review_count, distance, hours_of_operation, is_open_now, place_id

---

## Output Format

```json
{
  "providers": [
    {
      "id": "prov-...",
      "name": "ABC Plumbing",
      "phone": "+18645551234",
      "rating": 4.8,
      "reviewCount": 156,
      "address": "123 Main St, Greenville, SC 29601",
      "distance": 2.3,
      "hoursOfOperation": ["Mon-Fri: 8am-6pm"],
      "isOpenNow": true,
      "source": "Google Places"
    }
  ],
  "totalFound": 18,
  "filteredCount": 12
}
```

---

## Files to Modify

| File                                                    | Action |
| ------------------------------------------------------- | ------ |
| `apps/api/src/services/places/google-places.service.ts` | CREATE |
| `apps/api/src/services/gemini.ts`                       | MODIFY |
| `apps/api/src/routes/gemini.ts`                         | MODIFY |
| `kestra/flows/research_agent.yaml`                      | MODIFY |
| `supabase/migrations/...`                               | CREATE |

---

## Risk Mitigation

- Places API rate limits: Batch requests, 200ms delays
- Places API cost: Cache by placeId, limit to top 15
- No phone: Filter out before returning
- Kestra/Direct mismatch: Shared types, identical output
