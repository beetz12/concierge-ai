# VAPI Personalized Prompts & Service-Aware Calling

**Date**: 2024-12-10
**Author**: Claude AI
**Status**: In Progress
**Type**: Feature Implementation

## Table of Contents
- [Overview](#overview)
- [Problem Statement](#problem-statement)
- [Solution Architecture](#solution-architecture)
- [Implementation Phases](#implementation-phases)
- [File Changes](#file-changes)
- [Expected Behavior](#expected-behavior)

---

## Overview

This plan addresses critical issues with the VAPI AI calling system where the agent uses generic scripts instead of personalized, context-aware conversations. The implementation adds:

1. **Client name personalization** - AI introduces itself as "[Name]'s personal AI assistant"
2. **Service-aware terminology** - Uses appropriate terms (dentist vs technician, appointment vs service call)
3. **Problem description context** - Includes actual issue in conversation
4. **Urgency selection** - User-selectable urgency dropdown
5. **Minimum rating filter** - Separate UI for rating (filters providers, not asked in calls)
6. **Unknown info handling** - Graceful deflection when asked for client address/phone
7. **Immediate endCall** - Best practice VAPI configuration for immediate hang-up

---

## Problem Statement

### Current Issues (from transcript analysis)

| Issue | Current Behavior | Expected Behavior |
|-------|------------------|-------------------|
| Generic greeting | "AI concierge calling on behalf of a client" | "John Smith's personal AI assistant" |
| Wrong terminology | "technician", "come out" for dentist | "dentist", "appointment" |
| Missing context | No mention of actual problem | "has a painful molar" |
| Hardcoded urgency | Always "within 2 days" | User-selected urgency |
| Rating in criteria | Asked as question to provider | Used to filter providers |
| Unknown info handling | AI confused or makes up info | "I'll provide details when scheduling" |
| EndCall delay | Waits for response after goodbye | Hangs up immediately |

---

## Solution Architecture

### Data Flow

```
/new Page Form
├── clientName: "John Smith"           → Personal greeting
├── title: "dentist"                   → Service type detection
├── description: "molar is killing me" → Problem context
├── location: "Charlotte, NC"          → Location
├── criteria: "accepts new patients"   → Call questions
├── urgency: "immediate"               → Timeline (user-selected)
└── minRating: 4.5                     → Provider filtering (not in call)
         ↓
    Research Prompt Analyzer (Gemini)
         ↓
    Service-Aware Prompt Generation
    ├── serviceCategory: "medical"
    ├── terminology: { providerTerm: "dentist", visitDirection: "patient visits provider" }
    └── contextualQuestions: ["Are you accepting new patients?"]
         ↓
    VAPI Call with Custom Prompt
    ├── firstMessage: "Hi! This is John Smith's personal AI assistant..."
    ├── systemPrompt: [service-aware with info handling]
    └── tools: [{ type: "endCall" }]
```

---

## Implementation Phases

### Phase 1: Frontend UI Enhancements

#### 1.1 Add Client Name to /new Page
- Add `clientName` to form state
- Add "Your Name" input field at top of form
- Import User icon from lucide-react

#### 1.2 Add Urgency Dropdown to /new Page
- Add `urgency` to form state (default: "within_2_days")
- Add dropdown with options: Immediate, Within 24 hours, Within 2 days, Flexible

#### 1.3 Add Minimum Rating Selector
- Add `minRating` to form state (default: 4.5)
- Add range slider (0-5 with 0.5 steps)

#### 1.4 Update Criteria Placeholder
- Remove rating suggestion from placeholder
- New: "e.g. licensed, accepts new patients, background check required"

#### 1.5 Add Client Name to /direct Page
- Add `clientName` field (separate from contact name)
- Contact name = who we're calling, Client name = who we represent

### Phase 2: Backend Type & Interface Updates

#### 2.1 Update CallRequest Interface
```typescript
interface CallRequest {
  // ... existing fields
  problemDescription?: string;  // NEW
  clientName?: string;          // NEW
}
```

#### 2.2 Update API Route Validation
- Add Zod schema for new fields in providers.ts

### Phase 3: Service-Aware Prompt Analyzer

#### 3.1 Create ResearchPromptAnalyzer
- New file: `apps/api/src/services/research/prompt-analyzer.ts`
- Gemini-powered service category detection
- Terminology generation (providerTerm, visitDirection, appointmentTerm)
- Contextual question generation

#### 3.2 Add API Endpoint
- POST `/api/v1/gemini/analyze-research-prompt`
- Returns: systemPrompt, firstMessage, serviceCategory, terminology

### Phase 4: Prompt Template Updates

#### 4.1 Update createProviderSearchConfig
- Use clientName in greeting: "[Name]'s personal AI assistant"
- Add info handling section for unknown data
- Use tools array with endCall for immediate hang-up
- Lower temperature (0.3) for reliable tool invocation

#### 4.2 Update createDirectTaskConfig
- Same clientName personalization
- Same info handling instructions

### Phase 5: Frontend Integration

#### 5.1 Update /new Page Call Flow
- Call analyzer before VAPI calls
- Pass clientName, problemDescription, urgency to callProviderLive()
- Pass minRating to searchProvidersWorkflow()

#### 5.2 Update /direct Page Call Flow
- Pass clientName to callProviderLive()

---

## File Changes

| # | File | Changes |
|---|------|---------|
| 1 | `apps/web/app/new/page.tsx` | Add clientName, urgency, minRating fields; update placeholders |
| 2 | `apps/web/app/direct/page.tsx` | Add clientName field |
| 3 | `apps/web/lib/services/providerCallingService.ts` | Add clientName, problemDescription to interface |
| 4 | `apps/web/lib/services/geminiService.ts` | Add analyzeResearchPrompt() function |
| 5 | `apps/api/src/services/vapi/types.ts` | Add clientName, problemDescription to CallRequest |
| 6 | `apps/api/src/routes/providers.ts` | Update Zod schema |
| 7 | `apps/api/src/routes/gemini.ts` | Add /analyze-research-prompt endpoint |
| 8 | **NEW** `apps/api/src/services/research/prompt-analyzer.ts` | Service-aware prompt generation |
| 9 | `apps/api/src/services/vapi/assistant-config.ts` | Update prompts with clientName, info handling, endCall fix |

---

## Expected Behavior

### Before (Current)
```
AI: "Hi there. This is the AI concierge calling on behalf of a client..."
Provider: "What's the client's address?"
AI: [Makes up address or gets confused]
```

### After (Expected)
```
AI: "Hi there! This is John Smith's personal AI assistant calling to check
     on dentist services. John has a painful molar and needs to see a
     dentist urgently - today if possible. Do you have a moment?"

Provider: "Sure. What's his address?"

AI: "I'm just checking availability and rates right now. If John decides
     to schedule with you, he'll provide all those details when we call
     back to book the appointment."

Provider: "OK, we have a 3pm slot today."

AI: "Perfect! What would the rate be for an initial exam?"

Provider: "$150."

AI: "Thank you so much! I'll share this with John and if he'd like to
     proceed, we'll call back to schedule. Have a wonderful day!"

[IMMEDIATELY hangs up - no waiting]
```

---

## Document Metadata

**Last Updated**: 2024-12-10
**Implementation Status**: In Progress
**Related Documents**:
- `/Users/dave/Work/concierge-ai/docs/3_DAY_HACKATHON_PLAN.md`
- `/Users/dave/Work/concierge-ai/CLAUDE.md`

**Change Log**:
- 2024-12-10 - Initial creation based on multi-agent analysis
