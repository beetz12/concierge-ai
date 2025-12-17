# Fix Kestra Research Flow - Skip Enrichment & Normalize Phones

**Date**: 2025-12-12
**Author**: Claude AI
**Status**: Complete (Phase 2 Fix Applied)
**Type**: Fix

## Problem Summary
- Kestra research uses Gemini + Search Grounding → returns providers WITHOUT `placeId`
- Direct API uses Google Places API → returns providers WITH `placeId`
- Enrichment service requires `placeId` to lookup details → fails silently for Kestra results
- VAPI requires strict E.164 phone format (`+1XXXXXXXXXX`) but research returns `(864) 555-1234`
- No phone normalization utility exists in the codebase

## Solution Overview
1. Skip enrichment for Kestra-sourced providers (they already have phones)
2. Add phone normalization utility to convert various formats to E.164
3. Apply normalization after research, before returning results
4. Frontend already handles missing optional fields gracefully (no changes needed)

---

## Implementation Plan

### Step 1: Create Phone Normalization Utility
**File:** `apps/api/src/utils/phone.ts` (new file)

```typescript
/**
 * Normalize phone number to E.164 format for VAPI
 * Handles: (864) 555-1234, 864-555-1234, +1 (864) 555-1234, etc.
 * Returns: +18645551234 or null if invalid
 */
export function normalizePhoneToE164(phone: string | undefined): string | null {
  if (!phone) return null;

  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Handle 10-digit (add +1) or 11-digit starting with 1
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Already has country code (12+ digits starting with international prefix)
  if (digits.length >= 11) {
    return `+${digits}`;
  }

  return null; // Invalid format
}
```

### Step 2: Skip Enrichment for Kestra Results
**File:** `apps/api/src/services/research/research.service.ts`
**Location:** Lines 117-120

**Current:**
```typescript
if (result.status !== "error" && result.providers.length > 0) {
  result = await this.enrichResults(result, request);
}
```

**Change to:**
```typescript
// Skip enrichment for Kestra results (they don't have placeId, but already have phone data)
if (result.status !== "error" && result.providers.length > 0 && result.method !== "kestra") {
  result = await this.enrichResults(result, request);
}
```

### Step 3: Add Phone Normalization After Research
**File:** `apps/api/src/services/research/research.service.ts`
**Location:** After enrichment block, before return statement

Add new method and call it:

```typescript
/**
 * Normalize phone numbers to E.164 format for VAPI compatibility
 */
private normalizePhoneNumbers(result: ResearchResult): ResearchResult {
  const normalizedProviders = result.providers.map((provider) => ({
    ...provider,
    phone: normalizePhoneToE164(provider.phone) || provider.phone,
  }));

  return {
    ...result,
    providers: normalizedProviders,
  };
}
```

Call it in `search()` method after enrichment:
```typescript
// Normalize phone numbers for VAPI compatibility (applies to all methods)
if (result.status !== "error") {
  result = this.normalizePhoneNumbers(result);
}

return result;
```

### Step 4: Add Import
**File:** `apps/api/src/services/research/research.service.ts`
**Location:** Top of file

```typescript
import { normalizePhoneToE164 } from "../../utils/phone.js";
```

---

## Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/utils/phone.ts` | NEW - Phone normalization utility |
| `apps/api/src/services/research/research.service.ts` | Skip enrichment for Kestra + normalize phones |

## Files That Need NO Changes

| File | Reason |
|------|--------|
| Frontend components | Already handle missing optional fields gracefully |
| `kestra-research.client.ts` | Already returns correct structure with phones |
| `enrichment.service.ts` | Will simply not be called for Kestra results |
| Provider types | Already support optional fields |

---

## Data Flow After Fix

```
Research Request
    │
    ├─ Kestra Path:
    │   └─ Gemini + Search Grounding
    │       └─ Returns: name, phone, address, rating (NO placeId)
    │           └─ SKIP enrichment (method === "kestra")
    │               └─ Normalize phones to E.164
    │                   └─ Return to frontend
    │
    └─ Direct API Path:
        └─ Google Places API
            └─ Returns: name, phone, placeId, googleMapsUri, etc.
                └─ Enrichment (adds hours, website, coordinates)
                    └─ Normalize phones to E.164
                        └─ Return to frontend
```

## Expected Outcomes
- Kestra research completes without 500 error
- All phone numbers normalized to `+1XXXXXXXXXX` format
- VAPI calls work with both Kestra and Direct API results
- Frontend displays providers from either source correctly

## Testing Steps
1. Set `KESTRA_ENABLED=true` in backend environment
2. Submit a research request via frontend
3. Verify: No 500 error, providers returned with normalized phones
4. Verify: VAPI calls succeed with E.164 phone format

---

## Document Metadata

**Last Updated**: 2025-12-12
**Implementation Status**: Complete
**Related Documents**:
- [CLAUDE.md](/Users/dave/Work/concierge-ai/CLAUDE.md) - Project instructions

**Change Log**:
- 2025-12-12 - Initial creation
- 2025-12-12 - Implementation complete: phone.ts utility created, research.service.ts modified
