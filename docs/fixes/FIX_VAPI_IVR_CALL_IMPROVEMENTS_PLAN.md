# VAPI Call Improvements Plan

**Date**: 2025-12-12
**Author**: Claude AI Agent
**Status**: In Progress
**Version**: 1.0
**Related Issues**: Call termination issues, IVR navigation

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Part 1: Kestra Flow Fix - COMPLETED](#part-1-kestra-flow-fix---completed)
3. [Part 2: IVR/DTMF Enhancement - PENDING](#part-2-ivrdtmf-enhancement---pending)
4. [Implementation Details](#implementation-details)
5. [Testing Plan](#testing-plan)
6. [Architecture Diagram](#architecture-diagram)

---

## Executive Summary

This plan addresses two issues with VAPI calls:

1. **Kestra Flow Fix (COMPLETED)**: The `contact_providers.yaml` flow was using an inline script with bare-bones VAPI config instead of the shared TypeScript configuration, causing calls to not end properly and missing key features.

2. **IVR/DTMF Enhancement (PENDING)**: Add capability to navigate automated phone systems (IVR) and handle hold music gracefully.

---

## Part 1: Kestra Flow Fix - COMPLETED

### Problem Summary
The Kestra flow `contact_providers.yaml` used an inline script with bare-bones VAPI config instead of shared TypeScript config.

### Solution Applied
Switched to external script pattern using `call-provider.js` which imports shared `createAssistantConfig()`.

### Files Modified
- `kestra/flows/contact_providers.yaml` - Commands task with namespaceFiles
- `apps/api/src/services/vapi/kestra.client.ts` - Pass client_name, client_address, problem_description
- `kestra/scripts/call-provider.js` - Accept new CLI arguments
- `kestra/scripts/call-provider-improved.js` - Added deprecation comment

---

## Part 2: IVR/DTMF Enhancement - PENDING

### Problem Summary
VAPI calls may encounter automated phone systems (IVR) that require:
1. **DTMF navigation** - Pressing numbers to navigate menus ("Press 1 for...")
2. **Hold music handling** - Waiting patiently when put on hold with music

### Interference Analysis: SAFE

| Feature | Impact on Non-IVR Calls |
|---------|------------------------|
| **DTMF Tool** | None - AI only invokes when detecting IVR prompts |
| **IVR Prompts** | None - Conditional instructions, ignored on human-answered calls |
| **Hold Handling** | None - Conditional behavior, does nothing without hold music |
| **silenceTimeoutSeconds** | Keep at 20s - Hold music ≠ silence |

### Solution
Add DTMF tool and conditional IVR/hold handling prompts to `assistant-config.ts`.

---

## Implementation Details

### File to Modify: `apps/api/src/services/vapi/assistant-config.ts`

#### Change 1: Add DTMF tool to model.tools array

Location: In all three config functions where `tools` is defined

```typescript
tools: [
  { type: "endCall", description: "End the phone call. Use this immediately after your closing statement." },
  // ADD THIS:
  {
    type: "dtmf",
    description: "Send DTMF tones (keypad numbers) during the call. Use when navigating automated phone menus (IVR systems) that ask you to 'press 1 for...' etc."
  },
],
```

#### Change 2: Add IVR/Hold handling section to system prompts

Insert AFTER the voicemail detection section, BEFORE the conversation flow section:

```
═══════════════════════════════════════════════════════════════════
IVR / AUTOMATED SYSTEM NAVIGATION (IF APPLICABLE)
═══════════════════════════════════════════════════════════════════
If you encounter an automated phone system (IVR):
1. Listen carefully for menu options ("Press 1 for sales...")
2. Use the dtmf tool to enter the appropriate number
3. If unsure which option, try pressing 0 or say "representative" or "operator"
4. Wait for the system to respond before pressing more keys

Common IVR patterns:
- "Press 1 for..." → Use dtmf tool with digits: "1"
- "Press 0 for operator" → Use dtmf tool with digits: "0"
- "Enter your account number" → Use dtmf tool with the digits

IMPORTANT: Only use dtmf when you clearly hear automated menu instructions.
On calls where a human answers directly, do NOT use dtmf.

═══════════════════════════════════════════════════════════════════
HOLD MUSIC HANDLING (IF APPLICABLE)
═══════════════════════════════════════════════════════════════════
If put on hold with music playing:
- Wait patiently - the music indicates you're in queue
- Do NOT speak while music is playing
- Do NOT invoke endCall just because of music
- When the music stops and a human speaks, resume your normal conversation

Hold indicators: background music, "please hold", "your call is important to us"

IMPORTANT: This only applies when explicitly put on hold.
During normal conversation with a human, proceed normally.
```

#### Change 3: Add maxDurationSeconds as safety cap (optional)

Add to each config return object, after `silenceTimeoutSeconds`:

```typescript
silenceTimeoutSeconds: 20,
maxDurationSeconds: 480,  // 8-minute safety cap for long IVR/hold scenarios
```

### Affected Config Functions

| Function | Line | Needs DTMF | Needs IVR Prompt |
|----------|------|------------|------------------|
| `createDirectTaskConfig()` | ~141 | Yes | Yes |
| `createDynamicDirectTaskConfig()` | ~250 | Yes | Yes (via customPrompt) |
| `createProviderSearchConfig()` (custom) | ~386 | Yes | Yes (append to enhancedSystemPrompt) |
| `createProviderSearchConfig()` (template) | ~645 | Yes | Yes |

### Implementation Notes

1. **Conditional Phrasing**: All IVR/hold instructions use "IF applicable" and "ONLY when" to ensure non-IVR calls are unaffected.

2. **DTMF Tool**: VAPI's native `dtmf` tool type sends DTMF tones. The AI decides when to invoke it based on context.

3. **Hold Music**: Deepgram's VAD already filters music from transcription. The prompt ensures AI doesn't misinterpret silence (during music) as call end.

4. **maxDurationSeconds**: Optional safety cap. Set high enough (8 min) that normal calls complete, but prevents infinite hold scenarios.

---

## Testing Plan

1. **Non-IVR Call Test**: Call a direct human number, verify normal flow unchanged
2. **IVR Navigation Test**: Call a number with IVR (e.g., utility company), verify DTMF works
3. **Hold Test**: Call during busy hours, verify AI waits through hold music
4. **Timeout Test**: Verify 8-minute cap works without affecting normal 2-3 minute calls

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SINGLE SOURCE OF TRUTH                        │
│      apps/api/src/services/vapi/assistant-config.ts             │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   pnpm build      │
                    └─────────┬─────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Direct VAPI     │ │ Kestra Scripts  │ │ Webhook Config  │
│ Client          │ │ (namespace)     │ │                 │
│                 │ │                 │ │                 │
│ imports from    │ │ call-provider.js│ │ imports from    │
│ assistant-      │ │ imports from    │ │ assistant-      │
│ config.ts       │ │ assistant-      │ │ config.ts       │
│                 │ │ config.js       │ │                 │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         │    ┌──────────────┘                   │
         │    │                                  │
         ▼    ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                         VAPI API                                 │
│           (Identical configuration across all paths)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary Tables

### Part 1: Kestra Fix (Completed)

| Change | File | Purpose |
|--------|------|---------|
| Switch to Commands task | `contact_providers.yaml` | Use external script pattern |
| Add new inputs | `contact_providers.yaml` | Accept client_name, client_address, problem_description |
| Pass new fields | `kestra.client.ts` | Send clientName etc. to Kestra |
| Accept new args | `call-provider.js` | Receive and use new parameters |
| Add deprecation | `call-provider-improved.js` | Document as deprecated |

### Part 2: IVR/DTMF Enhancement (Pending)

| Change | Location | Purpose |
|--------|----------|---------|
| Add dtmf tool | All config functions | Enable IVR menu navigation |
| Add IVR prompt section | System prompts | Teach AI when/how to use DTMF |
| Add hold handling section | System prompts | Prevent premature call endings |
| Add maxDurationSeconds | Config objects | Safety cap for long holds |

**Confidence: 90%** - DTMF is a native VAPI feature. Conditional prompts ensure no interference with existing calls.

---

## Document Metadata

**Last Updated**: 2025-12-12
**Review Status**: Pending
**Implementation Status**: Part 1 Completed, Part 2 Pending
**Related Documents**:
- `apps/api/src/services/vapi/assistant-config.ts`
- `kestra/flows/contact_providers.yaml`
- `kestra/scripts/call-provider.js`

**Change Log**:
- 2025-12-12 - Initial creation with Kestra fix and IVR enhancement plan
