# Gemini Natural Language Prompt Generation (Root Cause Fix)

**Date**: 2024-12-10
**Author**: Claude AI
**Status**: In Progress
**Type**: Feature - Root Cause Fix

## Table of Contents
- [Problem Statement](#problem-statement)
- [Root Cause Analysis](#root-cause-analysis)
- [Solution Architecture](#solution-architecture)
- [Implementation Plan](#implementation-plan)
- [Expected Results](#expected-results)

---

## Problem Statement

The VAPI AI assistant sounds robotic with broken grammar:
- "David, my molar is killing me" (should be "David's molar")
- "David needs help immediate" (should be "immediately")
- "When could you come out?" (wrong for dentist)
- "technician" (wrong term for dentist)

## Root Cause Analysis

**The problem is NOT grammar rules - it's our architecture.**

### Current Approach (Broken)
```
Gemini → Returns METADATA only: {terminology: {providerTerm: "dentist"}}
JavaScript → Concatenates strings: `${clientName} ${problemDescription}`
Result → "David my molar is killing me" (broken grammar)
```

We're using Gemini for what it's WORST at (metadata extraction) and NOT using it for what it's BEST at (writing natural language).

### String Concatenation Examples
```typescript
// prompt-analyzer.ts line 176-178
const problem = request.problemDescription
  ? ` ${clientName} ${request.problemDescription}.`  // Creates "David my molar is killing me"
  : "";

// assistant-config.ts line 435
"${clientName} needs help ${urgencyText}"  // Creates "David needs help immediate"
```

## Solution Architecture

### New Approach (Correct)
```
Gemini → Receives ALL raw context
Gemini → WRITES complete natural language: firstMessage, systemPrompt
Result → Perfect grammar, natural flow, context-aware
```

**Key Insight**: Let Gemini do what it does best - write natural language. No string concatenation.

### Meta-Prompt Structure
```typescript
const analysisPrompt = `You are an expert at writing natural phone call scripts.

<context>
<client_name>${request.clientName}</client_name>
<service_type>${request.serviceType}</service_type>
<problem>${request.problemDescription}</problem>
...
</context>

<task>
Write TWO natural pieces for a VAPI phone assistant:
1. FIRST MESSAGE - the opening when call connects
2. SYSTEM PROMPT - comprehensive instructions for the AI

CRITICAL GRAMMAR RULES:
- Use possessives: "[name]'s molar" not "[name] my molar"
- Use third person: "[name] has been..." not "I have been..."
- Use correct terminology: "dentist" for medical, "technician" for home service
</task>

<output_format>
Return JSON with Gemini-written natural language:
{
  "firstMessage": "[GEMINI WRITES THIS ENTIRELY]",
  "systemPrompt": "[GEMINI WRITES THIS ENTIRELY]",
  ...
}
</output_format>`;
```

## Implementation Plan

### Phase 1: Rewrite prompt-analyzer.ts
1. Replace `analysisPrompt` with meta-prompt that asks Gemini to write everything
2. DELETE `buildSystemPrompt()` function (70 lines) - no longer needed
3. DELETE `buildFirstMessage()` function - no longer needed
4. Update return logic to use Gemini's output directly
5. Simplify `getDefaultAnalysis()` fallback

### Phase 2: Connect to /new Page
1. Import `analyzeResearchPrompt` in new/page.tsx
2. Call analyzer before provider loop
3. Pass `customPrompt` to `callProviderLive()`

### Phase 3: Update assistant-config.ts
1. When `customPrompt` is provided, use it directly
2. Skip template building when Gemini prompt available

## Files to Modify

| File | Changes |
|------|---------|
| `apps/api/src/services/research/prompt-analyzer.ts` | Rewrite to let Gemini generate all natural language |
| `apps/web/app/new/page.tsx` | Connect analyzer, pass customPrompt |
| `apps/api/src/services/vapi/assistant-config.ts` | Use customPrompt when available |

## Expected Results

### Before (String Concatenation)
```
"Hi there! This is David's personal AI assistant calling to check on
dentist services. David my molar is killing me. Do you have just a quick moment?"
```

### After (Gemini Writes Everything)
```
"Hi! I'm David's personal AI assistant. David has been experiencing severe
molar pain and needs to see a dentist urgently - today if possible. Do you
have a moment to discuss availability?"
```

---

## Document Metadata

**Last Updated**: 2024-12-10
**Implementation Status**: In Progress
**Related Documents**:
- `/docs/plans/FEATURE_VAPI_PERSONALIZED_PROMPTS.md`

**Change Log**:
- 2024-12-10 - Initial creation (root cause fix approach)
