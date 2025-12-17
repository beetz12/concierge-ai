# Professional Intake Feature (AI Problem Analyzer)

**Date**: 2024-12-16
**Author**: Claude AI
**Status**: In Progress
**Type**: Feature Implementation

## Table of Contents
- [Overview](#overview)
- [User Value Proposition](#user-value-proposition)
- [Technical Architecture](#technical-architecture)
- [UX Design](#ux-design)
- [API Specification](#api-specification)
- [Implementation Plan](#implementation-plan)
- [Success Metrics](#success-metrics)
- [Risk Mitigation](#risk-mitigation)

---

## Overview

### Feature Name
**AI Problem Analyzer** - Professional Intake Questions

### Summary
After the user enters their service type and problem description, Gemini AI assumes the role of a professional in that field and asks 2-5 intelligent follow-up questions. This creates a "smart intake" that:

1. **Proves AI competence** - Users see the system truly understands their problem
2. **Improves VAPI calls** - Agent can accurately describe the issue to providers
3. **Qualifies leads better** - Providers receive pre-vetted, detailed requests

### Strategic Value
- **Differentiator**: Competitors use static intake forms; we use AI conversation
- **Trust Builder**: Demonstrates AI understanding before critical VAPI calls
- **Quality Improver**: Better context = better provider matches and call outcomes

---

## User Value Proposition

### Primary Benefits
| Benefit | Description |
|---------|-------------|
| **Perceived Intelligence** | Users feel the AI "gets" their problem |
| **Time Savings** | Better matches reduce callbacks and mismatches |
| **Uncertainty Reduction** | Users feel prepared when providers call back |

### User Segmentation
| User Type | Intake Value | Design Implication |
|-----------|--------------|-------------------|
| Emergency (30%) | LOW | Must be skippable |
| Price Shopping (40%) | MEDIUM | Focus on pricing context |
| Quality Seeking (30%) | HIGH | Full intake benefits |

---

## Technical Architecture

### System Flow
```
User enters description
         ↓
Click "Get Smart Questions" (or skip)
         ↓
POST /api/v1/gemini/generate-intake-questions
         ↓
Gemini generates 2-5 professional questions
         ↓
User answers (partial/complete/skip)
         ↓
Answers stored in formData.intakeAnswers
         ↓
analyzeResearchPrompt() receives intake context
         ↓
Enhanced VAPI prompts include user details
         ↓
VAPI agent communicates details to providers
```

### New Files
| File | Purpose |
|------|---------|
| `apps/api/src/services/intake/question-generator.ts` | Gemini prompt for question generation |
| `apps/api/src/services/intake/types.ts` | TypeScript types for intake |
| `apps/api/src/routes/intake.ts` | API route for question generation |
| `packages/ui/src/professional-intake.tsx` | Reusable intake UI component |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/app/new/page.tsx` | Add intake step between description and contact |
| `apps/api/src/services/research/prompt-analyzer.ts` | Accept and use intake answers |
| `apps/api/src/routes/gemini.ts` | Register intake route |
| `apps/web/lib/services/geminiService.ts` | Add generateIntakeQuestions client |

---

## UX Design

### Placement
Between "Detailed Description" (line 660) and "Preferred Contact Method" (line 674) in `/apps/web/app/new/page.tsx`

### Visual Design

#### Collapsed State (Initial)
```
┌─────────────────────────────────────────────────┐
│ 💡 Want better results?                         │
│ Let me ask a few questions a professional       │
│ [service type] would ask about your situation   │
│                                                 │
│ [Get Smart Questions]          [Skip →]         │
└─────────────────────────────────────────────────┘
```

#### Expanded State (After Click)
```
┌─────────────────────────────────────────────────┐
│ 🎯 Professional Questions (2/3 answered)        │
├─────────────────────────────────────────────────┤
│ 1. Where exactly is the leak?                   │
│    [Base of toilet near floor________] ✓        │
│                                                 │
│ 2. Is water actively leaking now?               │
│    ○ Yes  ● No  ○ Not sure                      │
│                                                 │
│ 3. How old is your toilet?                      │
│    [________________________]                   │
│    e.g., "10 years" or "Not sure"               │
├─────────────────────────────────────────────────┤
│ [Save Answers]                    [Skip All]    │
│                                                 │
│ 💬 These help our AI explain your situation     │
│    accurately to providers                      │
└─────────────────────────────────────────────────┘
```

### Adaptive Intelligence Rules
| Condition | Behavior |
|-----------|----------|
| Description <10 words | Generate 4-5 questions |
| Description 10-50 words | Generate 2-3 questions |
| Description >50 words | Generate 1-2 questions or skip |
| "emergency/urgent" detected | Auto-skip or 1 critical question |
| Urgency = "immediate" | Max 2 questions |

---

## API Specification

### Generate Intake Questions

**Endpoint**: `POST /api/v1/gemini/generate-intake-questions`

**Request**:
```typescript
interface GenerateIntakeQuestionsRequest {
  serviceType: string;           // e.g., "plumber"
  problemDescription: string;    // User's problem description
  urgency?: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
}
```

**Response**:
```typescript
interface GenerateIntakeQuestionsResponse {
  questions: IntakeQuestion[];
  reasoning: string;             // Why these questions were chosen
  estimatedTime: string;         // e.g., "1-2 minutes"
}

interface IntakeQuestion {
  id: string;                    // e.g., "q1"
  question: string;              // The question text
  type: "text" | "radio" | "select";
  options?: string[];            // For radio/select types
  placeholder?: string;          // For text inputs
  required: false;               // ALWAYS false - all optional
}
```

**Example Request**:
```json
{
  "serviceType": "plumber",
  "problemDescription": "I have a leaking toilet in master bathroom",
  "urgency": "within_24_hours"
}
```

**Example Response**:
```json
{
  "questions": [
    {
      "id": "q1",
      "question": "Where exactly is the leak occurring?",
      "type": "text",
      "placeholder": "e.g., Base of toilet near floor, tank, or supply line"
    },
    {
      "id": "q2",
      "question": "Is water actively leaking right now?",
      "type": "radio",
      "options": ["Yes, it's actively leaking", "No, but it leaks sometimes", "Not sure"]
    },
    {
      "id": "q3",
      "question": "How old is your toilet approximately?",
      "type": "text",
      "placeholder": "e.g., 10 years, or 'Not sure'"
    }
  ],
  "reasoning": "These questions help determine if this is a simple seal fix or a replacement job",
  "estimatedTime": "1-2 minutes"
}
```

---

## Implementation Plan

### Phase 1: Backend (Week 1)
- [ ] Create intake types (`apps/api/src/services/intake/types.ts`)
- [ ] Build question generator service (`apps/api/src/services/intake/question-generator.ts`)
- [ ] Add API route (`apps/api/src/routes/intake.ts`)
- [ ] Register route in server
- [ ] Update prompt analyzer to accept intake answers

### Phase 2: Frontend (Week 1-2)
- [ ] Create ProfessionalIntake component (`packages/ui/src/professional-intake.tsx`)
- [ ] Add geminiService client method
- [ ] Integrate into /new page
- [ ] Add state management for intake answers
- [ ] Wire answers to form submission

### Phase 3: Integration (Week 2)
- [ ] Update analyzeResearchPrompt to use intake context
- [ ] Enhance VAPI prompts with intake details
- [ ] Test end-to-end flow
- [ ] Add analytics tracking

### Phase 4: Polish (Week 2)
- [ ] Mobile optimization
- [ ] Loading states and animations
- [ ] Error handling
- [ ] A/B test setup

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Intake Completion Rate | >75% | Start vs complete |
| Time to Complete | <60 seconds | Average duration |
| User Engagement | >50% | Click "Get Questions" rate |
| Booking Conversion | Neutral or +5% | A/B test vs control |
| Drop-off at Intake | <20% | Abandonment tracking |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Conversion drop-off | All questions skippable, A/B test first |
| Irrelevant questions | Pre-launch testing, weekly review |
| User doesn't know answers | "I'm not sure" on every question |
| Emergency users delayed | Urgency detection auto-skips |
| Analysis paralysis | Hard cap at 5 questions |

---

## Document Metadata

**Last Updated**: 2024-12-16
**Implementation Status**: In Progress
**Related Documents**:
- [CLAUDE.md](/Users/dave/Work/concierge-ai/CLAUDE.md) - Project instructions
- [prompt-analyzer.ts](/Users/dave/Work/concierge-ai/apps/api/src/services/research/prompt-analyzer.ts) - Existing prompt analysis

**Change Log**:
- 2024-12-16 - Initial creation from multi-agent analysis
