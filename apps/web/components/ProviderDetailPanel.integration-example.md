# ProviderDetailPanel Integration Guide

## Overview

The `ProviderDetailPanel` is a slide-out side panel component that displays detailed provider information when clicking on a provider card. It includes three tabs: Details, Call Log, and Actions.

## Component Location

```
/Users/dave/Work/concierge-ai/apps/web/components/ProviderDetailPanel.tsx
```

## Features

1. **Slide-in Animation**: Smooth slide animation from the right with backdrop overlay
2. **Three Tab Interface**:
   - **Details**: Provider information, location, ratings, hours, call results
   - **Call Log**: Call summary, transcript, and metadata
   - **Actions**: Select provider, view on maps, copy phone, visit website
3. **Accessibility**: ARIA labels, focus management, escape key handler
4. **Responsive Design**: Mobile-friendly with dark theme styling

## Integration Example

### Step 1: Import the Component

```tsx
import ProviderDetailPanel from "@/components/ProviderDetailPanel";
import { Provider } from "@/lib/types";
```

### Step 2: Add State Management

```tsx
const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
```

### Step 3: Make Provider Cards Clickable

For example, in `RecommendedProviders.tsx`, modify the provider card to be clickable:

```tsx
// Before: Static card
<div className="bg-surface border rounded-xl p-6">
  {/* Provider content */}
</div>

// After: Clickable card
<div
  className="bg-surface border rounded-xl p-6 cursor-pointer hover:border-primary-500/50 transition-colors"
  onClick={() => setSelectedProvider(providerFromDatabase)}
>
  {/* Provider content */}
</div>
```

### Step 4: Transform Database Data to Provider Type

When fetching from Supabase, transform the data to match the `Provider` interface:

```tsx
const transformedProvider: Provider = {
  id: dbProvider.id,
  name: dbProvider.name,
  phone: dbProvider.phone || undefined,
  rating: dbProvider.rating || undefined,
  address: dbProvider.address || undefined,
  source: dbProvider.source || undefined,

  // Call tracking
  callStatus: dbProvider.call_status || undefined,
  callResult: dbProvider.call_result ? {
    availability: (dbProvider.call_result as any).availability,
    estimated_rate: (dbProvider.call_result as any).estimated_rate,
    all_criteria_met: (dbProvider.call_result as any).all_criteria_met,
    earliest_availability: (dbProvider.call_result as any).earliest_availability,
    disqualified: (dbProvider.call_result as any).disqualified,
    disqualification_reason: (dbProvider.call_result as any).disqualification_reason,
    call_outcome: (dbProvider.call_result as any).call_outcome,
    notes: (dbProvider.call_result as any).notes,
  } : undefined,
  callTranscript: dbProvider.call_transcript || undefined,
  callSummary: dbProvider.call_summary || undefined,
  callDurationMinutes: dbProvider.call_duration_minutes || undefined,
  calledAt: dbProvider.called_at || undefined,

  // Research data
  reviewCount: dbProvider.review_count || undefined,
  distance: dbProvider.distance || undefined,
  distanceText: dbProvider.distance_text || undefined,
  hoursOfOperation: dbProvider.hours_of_operation
    ? (dbProvider.hours_of_operation as string[])
    : undefined,
  isOpenNow: dbProvider.is_open_now || undefined,
  googleMapsUri: dbProvider.google_maps_uri || undefined,
  website: dbProvider.website || undefined,
  placeId: dbProvider.place_id || undefined,
};
```

### Step 5: Render the Panel

```tsx
<ProviderDetailPanel
  provider={selectedProvider}
  isOpen={!!selectedProvider}
  onClose={() => setSelectedProvider(null)}
  onSelect={(provider) => {
    // Handle provider selection (e.g., open booking modal)
    handleProviderSelect(provider);
    setSelectedProvider(null);
  }}
/>
```

## Complete Integration Example for `request/[id]/page.tsx`

```tsx
"use client";

import React, { useState } from "react";
import ProviderDetailPanel from "@/components/ProviderDetailPanel";
import { Provider } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

export default function RequestDetails() {
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);

  // Fetch providers from database
  useEffect(() => {
    const fetchProviders = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("providers")
        .select("*")
        .eq("request_id", requestId);

      if (!error && data) {
        const transformed = data.map(transformDatabaseProvider);
        setProviders(transformed);
      }
    };

    fetchProviders();
  }, [requestId]);

  // Transform database provider to frontend type
  const transformDatabaseProvider = (dbProvider: any): Provider => ({
    id: dbProvider.id,
    name: dbProvider.name,
    phone: dbProvider.phone || undefined,
    rating: dbProvider.rating || undefined,
    address: dbProvider.address || undefined,
    source: dbProvider.source || undefined,
    callStatus: dbProvider.call_status || undefined,
    callResult: dbProvider.call_result || undefined,
    callTranscript: dbProvider.call_transcript || undefined,
    callSummary: dbProvider.call_summary || undefined,
    callDurationMinutes: dbProvider.call_duration_minutes || undefined,
    calledAt: dbProvider.called_at || undefined,
    reviewCount: dbProvider.review_count || undefined,
    distance: dbProvider.distance || undefined,
    distanceText: dbProvider.distance_text || undefined,
    hoursOfOperation: dbProvider.hours_of_operation || undefined,
    isOpenNow: dbProvider.is_open_now || undefined,
    googleMapsUri: dbProvider.google_maps_uri || undefined,
    website: dbProvider.website || undefined,
    placeId: dbProvider.place_id || undefined,
  });

  return (
    <div>
      {/* Provider cards */}
      <div className="space-y-4">
        {providers.map((provider) => (
          <div
            key={provider.id}
            onClick={() => setSelectedProvider(provider)}
            className="bg-surface border border-surface-highlight rounded-xl p-4 cursor-pointer hover:border-primary-500/50 transition-colors"
          >
            <h3 className="font-bold text-slate-100">{provider.name}</h3>
            <p className="text-slate-400">{provider.address}</p>
          </div>
        ))}
      </div>

      {/* Detail Panel */}
      <ProviderDetailPanel
        provider={selectedProvider}
        isOpen={!!selectedProvider}
        onClose={() => setSelectedProvider(null)}
        onSelect={(provider) => {
          handleProviderSelect(provider);
          setSelectedProvider(null);
        }}
      />
    </div>
  );
}
```

## Props Interface

```tsx
interface ProviderDetailPanelProps {
  provider: Provider | null;       // The provider to display (null if closed)
  isOpen: boolean;                  // Whether the panel is open
  onClose: () => void;             // Callback when panel is closed
  onSelect?: (provider: Provider) => void; // Optional callback for "Select This Provider" button
}
```

## Styling

The component uses the existing app's dark theme:

- Background: `bg-surface` (--color-surface: #0B1623)
- Borders: `border-surface-highlight` (--color-surface-highlight: #152336)
- Primary color: Teal/Mint (`text-primary-400`, `bg-primary-600`)
- Text: Slate scale (`text-slate-100`, `text-slate-400`, etc.)

## Accessibility Features

1. **Keyboard Navigation**:
   - Escape key closes the panel
   - Focus management (returns focus to trigger when closed)

2. **ARIA Attributes**:
   - `role="dialog"` and `aria-modal="true"`
   - `aria-labelledby` for panel title

3. **Screen Readers**:
   - All interactive elements have proper labels
   - Close button has `aria-label="Close panel"`

## Browser Compatibility

- Uses standard CSS transitions (no vendor prefixes needed)
- `backdrop-blur-sm` for modern browsers (graceful degradation)
- Flexbox and Grid layouts for responsive design
- `navigator.clipboard` API for copy functionality (modern browsers)

## Performance Considerations

1. **Animations**: GPU-accelerated with `transform` and `opacity`
2. **Conditional Rendering**: Returns `null` when closed (no DOM overhead)
3. **Effect Cleanup**: Proper cleanup of event listeners and body styles
4. **Scroll Lock**: Prevents body scrolling when panel is open

## Testing Checklist

- [ ] Panel slides in smoothly from right
- [ ] Overlay fades in and is clickable to close
- [ ] Escape key closes the panel
- [ ] All three tabs are accessible and display correct content
- [ ] Phone number copy button works
- [ ] External links open in new tabs
- [ ] "Select This Provider" button triggers onSelect callback
- [ ] Panel is responsive on mobile devices
- [ ] No console errors or warnings
- [ ] Body scroll is restored when panel closes
