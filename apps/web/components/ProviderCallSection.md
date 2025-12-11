# ProviderCallSection Component

A collapsible accordion component for displaying provider call logs with transcripts, summaries, and call metadata.

## Features

- **Collapsible UI**: Click header to expand/collapse
- **Status Badges**: Visual indicators for call outcomes (Completed, Voicemail, No Answer, In Progress)
- **Chat-style Transcript**: AI messages on left (blue), provider messages on right (gray)
- **Summary Formatting**: Converts markdown-like text to readable format
- **Call Metadata**: Duration and call ID display
- **Full Accessibility**: ARIA labels, keyboard navigation (Enter/Space), focus management
- **Smooth Animations**: CSS transforms for expand/collapse transitions

## Props

```typescript
interface ProviderCallSectionProps {
  log: InteractionLog;
  defaultExpanded?: boolean;
}
```

### InteractionLog Type

```typescript
interface InteractionLog {
  timestamp: string;
  stepName: string;
  detail: string;
  transcript?: { speaker: string; text: string }[];
  status: "success" | "warning" | "error" | "info";
  callData?: {
    callId?: string;
    duration?: number; // in seconds
    transcript?: string;
    structuredData?: Record<string, unknown>;
  };
}
```

## Usage

### Basic Usage

```tsx
import { ProviderCallSection } from "@/components/ProviderCallSection";
import { InteractionLog } from "@/lib/types";

// In your component
const log: InteractionLog = {
  timestamp: "2025-12-10T10:30:00Z",
  stepName: "Call to ABC Plumbing",
  detail: "Called provider to verify availability...",
  status: "success",
  transcript: [
    { speaker: "AI Assistant", text: "Hello, is this ABC Plumbing?" },
    { speaker: "Provider", text: "Yes, this is John from ABC Plumbing." },
  ],
  callData: {
    callId: "abc123xyz",
    duration: 180, // 3 minutes
  },
};

<ProviderCallSection log={log} />
```

### Integration in Request Details Page

Replace the existing `LogItem` component in `/apps/web/app/request/[id]/page.tsx`:

```tsx
// Before (lines 668-670)
{request.interactions.map((log, i) => (
  <LogItem key={i} log={log} index={i} />
))}

// After - filter for call logs only
import { ProviderCallSection } from "@/components/ProviderCallSection";

{/* Call Logs Section */}
{request.interactions
  .filter((log) => log.transcript && log.transcript.length > 0)
  .map((log, i) => (
    <ProviderCallSection key={i} log={log} defaultExpanded={i === 0} />
  ))}

{/* Other Activity Logs */}
{request.interactions
  .filter((log) => !log.transcript || log.transcript.length === 0)
  .map((log, i) => (
    <LogItem key={i} log={log} index={i} />
  ))}
```

### Full Section Example

```tsx
{/* Call Logs Section */}
<div className="mb-8">
  <h3 className="text-lg font-bold text-slate-100 mb-4">Provider Calls</h3>
  <div className="space-y-3">
    {request.interactions
      .filter((log) => log.transcript && log.transcript.length > 0)
      .map((log, i) => (
        <ProviderCallSection
          key={i}
          log={log}
          defaultExpanded={i === 0} // First call expanded by default
        />
      ))}
  </div>
</div>

{/* Activity Log Section */}
<div>
  <h3 className="text-lg font-bold text-slate-100 mb-4">Activity Log</h3>
  <div className="bg-abyss/30 p-6 rounded-2xl border border-surface-highlight">
    {request.interactions
      .filter((log) => !log.transcript || log.transcript.length === 0)
      .map((log, i) => (
        <LogItem key={i} log={log} index={i} />
      ))}
  </div>
</div>
```

## Styling

The component uses Tailwind CSS classes that match the app's dark theme:

- **Background**: `bg-surface`, `bg-surface-highlight`
- **Text**: `text-slate-200`, `text-slate-300`, `text-slate-400`
- **Primary Color**: `text-primary-400`, `bg-primary-600/20`, `border-primary-500/20`
- **Status Colors**:
  - Success (green): `text-emerald-400`, `bg-emerald-500/10`
  - Warning (amber): `text-amber-400`, `bg-amber-500/10`
  - Error (red): `text-red-400`, `bg-red-500/10`
  - Info (blue): `text-blue-400`, `bg-blue-500/10`

## Accessibility

- **Keyboard Navigation**: Tab to focus, Enter/Space to toggle
- **Screen Readers**: `aria-expanded`, `aria-controls`, `role="region"`
- **Focus Indicator**: Visible focus ring on header button
- **Unique IDs**: Generated with React's `useId()` hook

## Edge Cases Handled

- **No Transcript**: Transcript section only renders if `log.transcript` exists
- **No Call Data**: Call metadata section only renders if `log.callData` exists
- **Empty Detail**: `formatSummary()` safely handles empty strings
- **Speaker Detection**: Identifies AI speakers by lowercase checking for "ai", "assistant", or "agent"

## File Location

`/Users/dave/Work/concierge-ai/apps/web/components/ProviderCallSection.tsx`
