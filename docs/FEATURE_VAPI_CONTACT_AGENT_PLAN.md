# VAPI Contact Agent Implementation Plan

**Date**: 2025-12-09
**Author**: AI Agent (Claude)
**Status**: Approved
**Version**: 1.0
**Confidence Level**: 90%

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Questions Answered](#questions-answered)
3. [Issues Found](#issues-found)
4. [Implementation Plan](#implementation-plan)
5. [Architecture](#architecture)
6. [File Changes](#file-changes)

---

## Executive Summary

This plan addresses three critical questions about VAPI integration for the AI Concierge contact agent:

1. **VAPI Result Handling**: How VAPI returns call results (polling vs webhooks, output format)
2. **Dynamic Prompt Generation**: Strategy for generating custom prompts based on user criteria
3. **Simulate-Call Adaptation**: Reusing the natural conversation quality from simulate-call in real VAPI calls

---

## Questions Answered

### Question 1: How does VAPI return results after the call?

| Method | Current Implementation | Recommended |
|--------|----------------------|-------------|
| **Polling** | Using (5s intervals) | OK for hackathon |
| **Webhooks** | Not implemented | Production solution |
| **Output Format** | Basic (transcript only) | **Missing structured data!** |

**Critical Discovery**: Current code is NOT capturing VAPI's structured analysis capability. VAPI can return:

```javascript
{
  artifact: {
    transcript: "Full conversation text",
    messages: [...],
    recordingUrl: "https://..."
  },
  analysis: {
    summary: "2-3 sentence overview",
    structuredData: {                    // MISSING IN CURRENT IMPL!
      availability: "available",
      estimated_rate: "$150/hr",
      licensed_and_insured: "yes"
    },
    successEvaluation: "Call achieved objectives"
  },
  cost: 0.15,
  durationMinutes: 2.5
}
```

**Fix**: Add `analysisPlan.structuredDataSchema` to assistant config.

### Question 2: Dynamic Prompt Generation Strategy

**Recommended Architecture**:
```
USER REQUEST → KESTRA WORKFLOW
                    ↓
        [Task 1: GEMINI PROMPT GENERATOR]
                    ↓
        [Task 2: VAPI CALL with dynamic prompt]
                    ↓
        [Task 3: POST-PROCESS RESULTS]
```

The flow:
1. Gemini generates custom VAPI system prompt based on user's specific request
2. VAPI creates transient assistant with that prompt
3. VAPI executes call with dynamic configuration
4. Post-process results

### Question 3: Reusing simulate-call Prompt Quality

| Element | simulate-call | VAPI Adaptation |
|---------|---------------|-----------------|
| Role clarity | "You are a simulator..." | "You are an AI Concierge calling..." |
| User criteria injection | `${userCriteria}` | Same - dynamic injection |
| Realistic outcomes | "sometimes booked, sometimes expensive" | Same expectation setting |
| Professional tone | Yes | Yes |
| Structured output | Returns JSON directly | Use VAPI's `analysisPlan` + function calling |

**Key Difference**: simulate-call generates BOTH sides. VAPI only controls AI side.

---

## Issues Found

### Issue 1: contact_agent.yaml - Wrong Env Var References

```yaml
# CURRENT (WRONG)
env:
  VAPI_API_KEY: "{{ envs.APP_VAPI_API_KEY }}"
  VAPI_PHONE_NUMBER_ID: "{{ envs.APP_VAPI_PHONE_NUMBER_ID }}"
  GEMINI_API_KEY: "{{ envs.APP_GEMINI_API_KEY }}"

# CORRECT
env:
  VAPI_API_KEY: "{{ envs.vapi_api_key }}"
  VAPI_PHONE_NUMBER_ID: "{{ envs.vapi_phone_number_id }}"
  GEMINI_API_KEY: "{{ envs.gemini_api_key }}"
```

### Issue 2: call-provider.js - Missing Structured Output Config

Need to add `analysisPlan` with `structuredDataSchema` for validated JSON output.

### Issue 3: call-provider.js - Hardcoded Prompt

Prompt needs to be dynamically generated based on user input.

### Issue 4: .env.example Missing VAPI Keys

```bash
# Missing
VAPI_API_KEY=
VAPI_PHONE_NUMBER_ID=
```

---

## Implementation Plan

### Phase 1: Fix Immediate Issues (15 mins)

| # | Task | File | Difficulty |
|---|------|------|------------|
| 1.1 | Fix env var references (lowercase, no prefix) | `contact_agent.yaml` | Easy |
| 1.2 | Add VAPI keys to .env.example | `apps/api/.env.example` | Easy |
| 1.3 | Verify docker-compose.yml has VAPI env vars | `docker-compose.yml` | Easy |

### Phase 2: Add Structured Output (30 mins)

| # | Task | File | Difficulty |
|---|------|------|------------|
| 2.1 | Add `analysisPlan` with structured schema | `call-provider.js` | Medium |
| 2.2 | Update result parsing to use `analysis.structuredData` | `call-provider.js` | Medium |
| 2.3 | Update Kestra output to capture structured data | `contact_agent.yaml` | Easy |

### Phase 3: Dynamic Prompt Generation (1-2 hours)

| # | Task | File | Difficulty |
|---|------|------|------------|
| 3.1 | Create prompt generator function in call-provider.js | `call-provider.js` | Medium |
| 3.2 | Update contact_agent.yaml to pass user criteria | `contact_agent.yaml` | Medium |
| 3.3 | Test dynamic prompt generation | Manual test | Medium |

### Phase 4: Integration Testing (30 mins)

| # | Task | Details | Difficulty |
|---|------|---------|------------|
| 4.1 | Register updated flow in Kestra | curl command | Easy |
| 4.2 | Test with provider phone number | Verify end-to-end | Medium |
| 4.3 | Verify structured output parsing | Check JSON result | Easy |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER REQUEST                             │
│  "Find plumber in Greenville, min 4.7 rating, leaking toilet"   │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      KESTRA WORKFLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ research_agent  │  (Already working!)                        │
│  │ ─────────────── │                                            │
│  │ Gemini + Search │───▶ Returns top 3 providers with phones    │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐    ┌──────────────────┐                   │
│  │ call-provider.js│    │  VAPI CALL       │                   │
│  │ (Dynamic Prompt)│───▶│  (Real Phone)    │                   │
│  │                 │    │                  │                   │
│  │ - Generates     │    │ Uses generated   │                   │
│  │   custom prompt │    │ system prompt    │                   │
│  │ - Based on user │    │                  │                   │
│  │   criteria      │    │ Returns:         │                   │
│  │                 │    │ - transcript     │                   │
│  │                 │    │ - structuredData │                   │
│  └─────────────────┘    └────────┬─────────┘                   │
│                                  │                              │
│                                  ▼                              │
│                         ┌───────────────┐                       │
│                         │ RESULT        │                       │
│                         │ {             │                       │
│                         │  availability │                       │
│                         │  rate         │                       │
│                         │  licensed     │                       │
│                         │  outcome      │                       │
│                         │ }             │                       │
│                         └───────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## File Changes

### 1. contact_agent.yaml

- Fix env var references to lowercase
- Add user_criteria and location inputs
- Update command to pass all parameters

### 2. call-provider.js

- Add dynamic prompt generation using Gemini
- Add analysisPlan with structuredDataSchema
- Update result parsing for structured output
- Accept additional CLI args for criteria/location

### 3. apps/api/.env.example

- Add VAPI_API_KEY
- Add VAPI_PHONE_NUMBER_ID

### 4. docker-compose.yml

- Verify APP_VAPI_API_KEY mapping
- Verify APP_VAPI_PHONE_NUMBER_ID mapping

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| VAPI phone not provisioned | Medium | High | Check VAPI dashboard first |
| Real calls cost money | High | Low | Test sparingly |
| Provider hangs up | Medium | Medium | Graceful fallback handling |
| Structured data missing | Low | Medium | Fallback to transcript analysis |

---

## Document Metadata

**Last Updated**: 2025-12-09
**Review Status**: Approved
**Implementation Status**: In Progress
**Related Documents**:
- `/docs/vapi.ai_strategy.md`
- `/docs/architecture.md`
- `/kestra/flows/research_agent.yaml`

**Change Log**:
- 2025-12-09 - Initial creation based on multi-agent analysis
