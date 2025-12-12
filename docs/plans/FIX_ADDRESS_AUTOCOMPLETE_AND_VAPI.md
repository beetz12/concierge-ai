# Fix Address Autocomplete and VAPI Integration

**Date**: 2025-12-11
**Author**: Claude AI
**Status**: Draft
**Type**: Fix / Feature

## Table of Contents
- [Executive Summary](#executive-summary)
- [Problem Analysis](#problem-analysis)
- [Solution Architecture](#solution-architecture)
- [Implementation Plan](#implementation-plan)
- [Files to Modify](#files-to-modify)
- [Testing Checklist](#testing-checklist)

---

## Executive Summary

### The Problem
The VAPI agent makes up fake addresses when providers ask "What's your address?" because:
1. **Form only captures city/state** ("Greenville, SC"), not street address
2. **VAPI prompts are ambiguous** - say "location" without clarifying it's NOT an address
3. **AI hallucinates** - sees "location" and constructs a plausible but fake address

### The Solution
Two-part fix:
1. **Capture full address** via Google Places Autocomplete on /new page
2. **Pass address to VAPI** so agent can provide the real address when asked

### Confidence Level: 90%

**Why 90%:**
- Google Places API key already exists in backend (`GOOGLE_PLACES_API_KEY`)
- Clear data flow identified through multi-agent analysis
- Backward compatible approach (old location field still works)
- VAPI prompt structure fully understood
- 10% uncertainty: Google Places Autocomplete library integration details

---

## Problem Analysis

### Current Data Flow (Broken)

```
User submits form:
  location: "Greenville, SC" (city/state only)
        ↓
Backend receives: location: string
        ↓
VAPI prompt: "calling on behalf of ${clientName} in ${location}"
        ↓
Provider asks: "What's your address?"
        ↓
AI behavior (UNPREDICTABLE):
  ❌ Makes up: "123 Main St, Greenville, SC 29601"
  ❌ Uses location as address: "Greenville, SC"
  ✅ Sometimes uses fallback: "I'm just checking availability..."
```

### Root Cause Evidence

**Frontend** (`apps/web/app/new/page.tsx:53-62`):
```typescript
const [formData, setFormData] = useState({
  location: "",  // ← SINGLE STRING, no structure
});
```

**Backend Schema** (`apps/api/src/routes/providers.ts:35`):
```typescript
location: z.string().min(1, "Location is required"),  // ← Single string validation
```

**VAPI Prompt** (`apps/api/src/services/vapi/assistant-config.ts:438`):
```typescript
You are calling on behalf of ${clientName} in ${request.location}...
// ↑ Ambiguous - is this city or street address?
```

**Database** (`supabase/migrations/20250101000000_initial_schema.sql:46`):
```sql
location TEXT,  -- ← Single string column
```

---

## Solution Architecture

### New Data Flow (Fixed)

```
User types "123 Ma..." in address field
        ↓
Google Places suggests "123 Main St, Greenville, SC 29601"
        ↓
User selects → auto-populates all fields
        ↓
Form state: {
  address: {
    formatted: "123 Main St, Greenville, SC 29601",
    street: "123 Main St",
    city: "Greenville",
    state: "SC",
    zip: "29601",
    placeId: "ChIJ..." (optional)
  }
}
        ↓
API request: {
  location: "Greenville, SC",                              // backward compatible
  clientAddress: "123 Main St, Greenville, SC 29601"       // NEW field
}
        ↓
VAPI prompt (conditional):
  IF clientAddress exists:
    "Service address: 123 Main St, Greenville, SC 29601"
    "If asked for address, provide: 123 Main St, Greenville, SC 29601"
  ELSE:
    "Service area: Greenville, SC (general area only)"
    "You do NOT have the street address. Use fallback script."
        ↓
Provider: "What's your address?"
AI: "The address is 123 Main Street, Greenville, South Carolina 29601"
```

### New TypeScript Interfaces

**Address Object** (new):
```typescript
interface StructuredAddress {
  formatted: string;      // "123 Main St, Greenville, SC 29601"
  street: string;         // "123 Main St"
  city: string;           // "Greenville"
  state: string;          // "SC"
  zip: string;            // "29601"
  placeId?: string;       // Google Place ID (optional)
}
```

**Updated CallRequest** (extended):
```typescript
export interface CallRequest {
  // ... existing fields
  location: string;           // City/state (required, backward compatible)
  clientAddress?: string;     // Full street address (optional, NEW)
}
```

---

## Implementation Plan

### Phase 1: Frontend - Google Places Autocomplete

#### 1.1 Environment Variable
**File:** `apps/web/.env.local`
```bash
# Add this line (use existing backend key)
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=YOUR_GOOGLE_PLACES_API_KEY
```

#### 1.2 Install Package
```bash
pnpm add --filter web @react-google-maps/api
```

#### 1.3 Create Autocomplete Component
**File:** `packages/ui/src/address-autocomplete.tsx` (NEW)

```typescript
"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useJsApiLoader, Autocomplete } from "@react-google-maps/api";

const libraries: ("places")[] = ["places"];

export interface AddressComponents {
  formatted: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  placeId?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: AddressComponents) => void;
  onInputChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export function AddressAutocomplete({
  value,
  onChange,
  onInputChange,
  placeholder = "Enter your address",
  className = "",
  required = false,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || "",
    libraries,
  });

  const onLoad = useCallback((autocomplete: google.maps.places.Autocomplete) => {
    autocompleteRef.current = autocomplete;
  }, []);

  const onPlaceChanged = useCallback(() => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();

      if (place.address_components && place.formatted_address) {
        const components = place.address_components;

        const getComponent = (type: string): string => {
          const component = components.find(c => c.types.includes(type));
          return component?.long_name || "";
        };

        const streetNumber = getComponent("street_number");
        const route = getComponent("route");
        const city = getComponent("locality") || getComponent("sublocality");
        const state = getComponent("administrative_area_level_1");
        const zip = getComponent("postal_code");

        const address: AddressComponents = {
          formatted: place.formatted_address,
          street: streetNumber ? `${streetNumber} ${route}` : route,
          city,
          state,
          zip,
          placeId: place.place_id,
        };

        setInputValue(place.formatted_address);
        onChange(address);
      }
    }
  }, [onChange]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
    onInputChange?.(e.target.value);
  };

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  if (loadError) {
    // Fallback to regular input if Google Maps fails to load
    return (
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={className}
        required={required}
      />
    );
  }

  if (!isLoaded) {
    return (
      <input
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder="Loading..."
        className={className}
        disabled
      />
    );
  }

  return (
    <Autocomplete
      onLoad={onLoad}
      onPlaceChanged={onPlaceChanged}
      options={{
        componentRestrictions: { country: "us" },
        types: ["address"],
      }}
    >
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={className}
        required={required}
      />
    </Autocomplete>
  );
}
```

#### 1.4 Update Form State
**File:** `apps/web/app/new/page.tsx`

```typescript
// Change from:
const [formData, setFormData] = useState({
  location: "",
  // ...
});

// Change to:
const [formData, setFormData] = useState({
  location: "",  // Keep for backward compatibility (city/state)
  clientAddress: {
    formatted: "",
    street: "",
    city: "",
    state: "",
    zip: "",
  },
  // ...
});
```

#### 1.5 Update Form UI
**File:** `apps/web/app/new/page.tsx`

Replace the location input with:
```tsx
<div>
  <label className="block text-sm font-semibold text-slate-300 mb-2">
    What is your service address?
  </label>
  <div className="relative">
    <MapPin className="absolute left-3 top-3.5 w-5 h-5 text-slate-500 z-10" />
    <AddressAutocomplete
      value={formData.clientAddress.formatted}
      onChange={(address) => {
        setFormData({
          ...formData,
          location: `${address.city}, ${address.state}`,  // backward compatible
          clientAddress: address,
        });
      }}
      placeholder="Start typing your address..."
      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-700 bg-slate-800/50 text-white placeholder:text-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
      required
    />
  </div>
  <p className="mt-1 text-xs text-slate-500">
    Select from suggestions for accurate address
  </p>
</div>
```

#### 1.6 Update batchRequestBody
**File:** `apps/web/app/new/page.tsx` (around line 343-366)

```typescript
const batchRequestBody = {
  // ... existing fields
  location: data.location,  // Keep for backward compatibility
  clientAddress: data.clientAddress.formatted,  // NEW: full street address
  // ...
};
```

---

### Phase 2: Backend - Accept Structured Address

#### 2.1 Update Zod Schemas
**File:** `apps/api/src/routes/providers.ts`

```typescript
// Add to callProviderSchema (around line 35):
clientAddress: z.string().optional(),  // Full street address

// Add to batchCallSchema (around line 62):
clientAddress: z.string().optional(),  // Full street address

// Add to bookingSchema (around line 91):
clientAddress: z.string().optional(),  // Full street address
```

#### 2.2 Update Type Definitions
**File:** `apps/api/src/services/vapi/types.ts`

```typescript
export interface CallRequest {
  providerName: string;
  providerPhone: string;
  serviceNeeded: string;
  userCriteria: string;
  problemDescription?: string;
  clientName?: string;
  location: string;           // City/state (backward compatible)
  clientAddress?: string;     // NEW: Full street address
  urgency: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
  serviceRequestId?: string;
  providerId?: string;
  customPrompt?: GeneratedPrompt;
}
```

#### 2.3 Pass Address to VAPI Calls
**File:** `apps/api/src/routes/providers.ts`

When constructing CallRequest objects, include clientAddress:
```typescript
const callRequest: CallRequest = {
  // ... existing fields
  location: body.location,
  clientAddress: body.clientAddress,  // NEW
  // ...
};
```

---

### Phase 3: VAPI Prompt Updates

#### 3.1 Update Research Call Prompt
**File:** `apps/api/src/services/vapi/assistant-config.ts`

Replace the location section (around lines 437-451) with:

```typescript
// Build location/address section based on what we have
const addressSection = request.clientAddress
  ? `
═══════════════════════════════════════════════════════════════════
SERVICE LOCATION (YOU HAVE THIS INFORMATION)
═══════════════════════════════════════════════════════════════════
Service address: ${request.clientAddress}

If the provider asks for the address, you CAN provide it:
"The service address is ${request.clientAddress}"
`
  : `
═══════════════════════════════════════════════════════════════════
SERVICE LOCATION (LIMITED INFORMATION)
═══════════════════════════════════════════════════════════════════
Service area: ${request.location} (general area only - NOT a street address)

CRITICAL: You do NOT have ${clientName}'s street address.
If the provider asks for the specific street address, respond:
"I'm just checking availability and rates right now. If ${clientName} decides
to schedule with you, they'll provide their exact address when we call back
to book the appointment."

DO NOT make up an address. DO NOT use "${request.location}" as if it's a street address.
`;

const systemPrompt = `You are a warm, friendly AI Concierge making a real phone call to ${request.providerName}.

═══════════════════════════════════════════════════════════════════
YOUR IDENTITY
═══════════════════════════════════════════════════════════════════
You are ${clientName}'s personal AI assistant...

You are calling on behalf of ${clientName} who needs ${request.serviceNeeded} services.
${addressSection}
// ... rest of prompt
`;
```

#### 3.2 Update Booking Call Prompt
**File:** `apps/api/src/services/vapi/booking-assistant-config.ts`

Update the appointment details section (around lines 41-54):

```typescript
const addressInfo = request.clientAddress
  ? `Service address: ${request.clientAddress}
If asked for the address: "The service address is ${request.clientAddress}"`
  : `Service area: ${request.location} (general area only)
CRITICAL: You do NOT have the street address.
If asked: "${clientName} will provide their exact address when the technician arrives."`;

const systemPrompt = `...
═══════════════════════════════════════════════════════════════════
APPOINTMENT DETAILS
═══════════════════════════════════════════════════════════════════
Service needed: ${request.serviceNeeded}
${addressInfo}
Preferred time: ${preferredTime}
...`;
```

---

## Files to Modify

| # | File | Change Type | Priority |
|---|------|-------------|----------|
| 1 | `apps/web/.env.local` | Add env variable | HIGH |
| 2 | `apps/web/package.json` | Add dependency | HIGH |
| 3 | `packages/ui/src/address-autocomplete.tsx` | NEW file | HIGH |
| 4 | `apps/web/app/new/page.tsx` | Update form | HIGH |
| 5 | `apps/api/src/routes/providers.ts` | Add Zod field | HIGH |
| 6 | `apps/api/src/services/vapi/types.ts` | Add interface field | HIGH |
| 7 | `apps/api/src/services/vapi/assistant-config.ts` | Update prompt | HIGH |
| 8 | `apps/api/src/services/vapi/booking-assistant-config.ts` | Update prompt | MEDIUM |

---

## Testing Checklist

### Phase 1: Frontend Tests
- [ ] Google Places autocomplete loads without errors
- [ ] Typing address shows suggestions dropdown
- [ ] Selecting suggestion auto-fills all address fields
- [ ] Address components parsed correctly (street, city, state, zip)
- [ ] Form validation works with new address structure
- [ ] Fallback to manual input if Google API fails

### Phase 2: Backend Tests
- [ ] API accepts requests with `clientAddress` field
- [ ] API still works without `clientAddress` (backward compatible)
- [ ] Zod validation passes with valid address
- [ ] Address flows through to VAPI call construction

### Phase 3: VAPI Tests
- [ ] **WITH address**: Provider asks "What's your address?" → AI provides real address
- [ ] **WITHOUT address**: Provider asks "What's your address?" → AI uses fallback script
- [ ] Booking calls include address when available
- [ ] No hallucinated addresses in any scenario

### End-to-End Test
- [ ] Submit new request with full address via autocomplete
- [ ] Verify address appears in database
- [ ] Initiate VAPI call to test provider
- [ ] Simulate provider asking for address
- [ ] Verify AI provides correct address from form

---

## Risk Mitigation

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Google API key exposure | Medium | Medium | Restrict key to domains in Google Cloud Console |
| Autocomplete fails to load | Low | Medium | Fallback to manual text input |
| Backward compatibility break | Low | High | Keep `location` field, add `clientAddress` as optional |
| API quota exceeded | Very Low | Low | Google Places has generous free tier |
| TypeScript errors | Low | Medium | Run `pnpm check-types` after each phase |

---

## Document Metadata

**Last Updated**: 2025-12-11
**Implementation Status**: Not Started
**Related Documents**:
- [docs/about.md](../about.md) - User flow specification
- [docs/plans/FIX_END_TO_END_FLOW_GAPS.md](./FIX_END_TO_END_FLOW_GAPS.md) - Previous flow fixes

**Change Log**:
- 2025-12-11 - Initial creation from multi-agent analysis (90% confidence)
