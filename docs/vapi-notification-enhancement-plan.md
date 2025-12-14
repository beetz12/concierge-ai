# VAPI User Notification Enhancement Plan

## Executive Summary

**Problem**: When users select "phone call" as their notification method, the VAPI agent currently only tells them provider names and availability - missing all the rich AI-generated insights (ratings, reasoning, call findings) that SMS users receive.

**Solution**: Enhance the VAPI notification system to pass full recommendation context and rewrite the assistant prompt to deliver detailed, conversational information that helps users make informed decisions and answer their questions.

**Confidence Level**: 90%

---

## Current State Analysis

### What SMS Users Receive (Rich Experience)
```
ACTION NEEDED: Dave, your AI Concierge found 3 qualified providers!

TOP PICK: Bob's Plumbing
★★★★★ 4.8 (127 reviews)
Available: Monday 9am
Est. Rate: $85/hour
Why: Highest rated with same-day availability and excellent reviews...

OTHER OPTIONS:
2. Smith & Sons (4.5★) - Tuesday 10am
3. Quick Fix (4.2★) - Wednesday

AI RECOMMENDATION: Bob's Plumbing offers the best combination...

Reply 1, 2, or 3 NOW to book!
```

### What Phone Users Hear (Minimal Experience)
```
"Hi Dave! I found 3 great options for you:
1. Bob's Plumbing - Available Monday at 9am
2. Smith & Sons - Available Tuesday at 10am
3. Quick Fix - Available Wednesday

Which would you like? Say 1, 2, or 3."
```

**Critical Gap**: Phone users don't hear ratings, reviews, estimated costs, or WHY providers were recommended.

---

## Root Cause Analysis

### Data Flow Breakdown

| Stage | File | What's Available | What's Passed |
|-------|------|------------------|---------------|
| 1. Recommendation Generation | `recommend.service.ts` | score, rating, reviewCount, reasoning, estimatedRate | ALL |
| 2. Trigger Notification | `providers.ts:1011-1020` | ALL fields | ALL (recently fixed for SMS) |
| 3. VAPI Call Setup | `trigger-notification.ts:182-186` | ALL fields | **ONLY name, availability** |
| 4. Assistant Config | `user-notification-assistant-config.ts` | rate?, reasoning? (interface) | **NEVER USED in prompt** |

### Specific Code Gaps

**Gap 1: Data Dropped in trigger-notification.ts (Lines 182-186)**
```typescript
// CURRENT - Drops all rich data
recommendations: params.providers.map((p, index) => ({
  rank: index + 1,
  providerName: p.name,
  availability: p.earliestAvailability,
  // ❌ p.score - NOT PASSED
  // ❌ p.rating - NOT PASSED
  // ❌ p.reviewCount - NOT PASSED
  // ❌ p.estimatedRate - NOT PASSED
  // ❌ p.reasoning - NOT PASSED
}))
// ❌ overallRecommendation - NOT PASSED
```

**Gap 2: Interface Supports Fields But Never Populated**
```typescript
// user-notification-assistant-config.ts - Lines 8-22
recommendations: Array<{
  rank: number;
  providerName: string;
  availability: string;
  rate?: string;      // ⚠️ Defined but never passed
  reasoning?: string; // ⚠️ Defined but never passed
}>
```

**Gap 3: Prompt Template Only Uses Name/Availability**
```typescript
// Lines 36-39 - Only generates basic list
const recsScript = recommendations.map((r, i) =>
  `${i + 1}. ${r.providerName} - Available ${r.availability}${r.rate ? `, ${r.rate}` : ''}`
).join('\n');
```

**Gap 4: No Call Context for Q&A**
- Provider call transcripts/summaries exist in database
- Never fetched or passed to user notification call
- User cannot ask "What did they say about emergency rates?"

---

## Implementation Plan

### Phase 1: Expand Data Interfaces

**File: `apps/api/src/services/vapi/user-notification-assistant-config.ts`**

```typescript
// UPDATED Interface (Lines 8-30)
export interface UserNotificationRequest {
  userPhone: string;
  userName?: string;
  serviceRequestId: string;
  serviceNeeded: string;
  location: string;
  requestUrl?: string;

  recommendations: Array<{
    rank: number;
    providerName: string;
    availability: string;
    // NEW FIELDS
    rating?: number;           // Google rating (e.g., 4.8)
    reviewCount?: number;      // Number of reviews
    estimatedRate?: string;    // e.g., "$85/hour"
    score?: number;            // AI score 0-100
    reasoning?: string;        // Why recommended
    callSummary?: string;      // Key findings from provider call
  }>;

  // NEW FIELDS
  overallRecommendation?: string;  // AI's top-level recommendation
  callContext?: string;            // Combined context from all provider calls
}
```

### Phase 2: Pass Rich Data to VAPI

**File: `apps/api/src/services/notifications/trigger-notification.ts`**

```typescript
// UPDATED mapping (Lines 176-195)
const result = await notificationService.callUser({
  userPhone: params.userPhone,
  userName: params.userName,
  serviceRequestId: params.serviceRequestId,
  serviceNeeded: params.serviceNeeded || "Service Request",
  location: params.location || "",
  recommendations: params.providers.map((p, index) => ({
    rank: index + 1,
    providerName: p.name,
    availability: p.earliestAvailability,
    // NEW: Pass all rich data
    rating: p.rating,
    reviewCount: p.reviewCount,
    estimatedRate: p.estimatedRate,
    score: p.score,
    reasoning: p.reasoning,
  })),
  // NEW: Pass overall recommendation
  overallRecommendation: params.overallRecommendation,
});
```

### Phase 3: Fetch Call Context from Database (Optional but Recommended)

**File: `apps/api/src/services/notifications/trigger-notification.ts`**

Add before VAPI call:
```typescript
// Fetch call summaries for Q&A context
const { data: callResults } = await supabase
  .from("providers")
  .select("name, call_transcript, call_summary, availability_notes")
  .eq("request_id", params.serviceRequestId)
  .in("name", params.providers.map(p => p.name));

// Build context string for AI
const callContext = callResults?.map(r =>
  `${r.name}: ${r.call_summary || r.availability_notes || 'No additional notes'}`
).join('\n\n');
```

### Phase 4: Rewrite Assistant Prompt

**File: `apps/api/src/services/vapi/user-notification-assistant-config.ts`**

Replace the prompt generation (Lines 36-94) with:

```typescript
export function createUserNotificationAssistantConfig(request: UserNotificationRequest) {
  const { recommendations, userName, serviceNeeded, location, overallRecommendation, callContext } = request;

  // Build detailed provider scripts
  const detailedRecs = recommendations.map((r, i) => {
    let details = `**Option ${i + 1}: ${r.providerName}**\n`;

    if (r.rating) {
      details += `- Rating: ${r.rating} stars`;
      if (r.reviewCount) details += ` (${r.reviewCount} reviews)`;
      details += `\n`;
    }

    details += `- Availability: ${r.availability}\n`;

    if (r.estimatedRate) {
      details += `- Estimated Rate: ${r.estimatedRate}\n`;
    }

    if (r.reasoning) {
      details += `- Why Recommended: ${r.reasoning}\n`;
    }

    if (r.callSummary) {
      details += `- From Our Call: ${r.callSummary}\n`;
    }

    return details;
  }).join('\n');

  // Build the rich system prompt
  const systemPrompt = `You are a friendly AI assistant calling to present provider recommendations. You have detailed information about each provider and can answer questions.

## YOUR KNOWLEDGE BASE

### Service Request
- Service Needed: ${serviceNeeded}
- Location: ${location}
- Customer: ${userName || 'Customer'}

### Provider Recommendations (in order of recommendation)
${detailedRecs}

${overallRecommendation ? `### AI Recommendation Summary\n${overallRecommendation}` : ''}

${callContext ? `### Notes from Provider Calls\n${callContext}` : ''}

## CONVERSATION GUIDELINES

**Opening (be warm and informative):**
"Hi ${userName || 'there'}! This is AI Concierge calling about your ${serviceNeeded} request. Great news - I've researched several providers and found some excellent options for you!"

**Present the TOP recommendation first with enthusiasm:**
"My top recommendation is [Provider 1]. They have [rating] stars from [review count] reviews, and they're available [availability]. [Brief reasoning]. Their estimated rate is [rate]."

**Then briefly mention alternatives:**
"I also found two other great options: [Provider 2] with [rating] stars available [time], and [Provider 3] available [time]."

**Invite questions:**
"Would you like more details about any of these providers, or are you ready to choose?"

**Handle Questions:**
- If they ask about ratings/reviews: Share the specific numbers and mention review highlights if available
- If they ask about pricing: Give estimated rates and mention any notes from the calls
- If they ask "why this one?": Explain the reasoning in detail
- If they ask about availability: Be specific about dates/times
- If they ask about what the provider said: Reference the call notes

**When they're ready to choose:**
"Which provider would you like me to book? Just say 1, 2, or 3, or the provider's name."

**Confirm selection:**
"Excellent choice! I'll book [provider name] for you. They're [availability] and estimated at [rate]. You'll receive a confirmation shortly."

**Closing:**
"Thanks for using AI Concierge! Have a wonderful day!"
Then IMMEDIATELY invoke the endCall tool.

## IMPORTANT RULES
1. Be conversational, not robotic - you're helping someone make an important decision
2. Lead with the top recommendation and explain WHY it's the best choice
3. Be prepared to answer ANY question about the providers using your knowledge base
4. If asked something not in your knowledge, say "I don't have that specific detail, but I can tell you..."
5. Create urgency by mentioning availability might change
6. After confirming selection, end promptly`;

  return {
    // ... rest of config with updated systemPrompt
  };
}
```

### Phase 5: Update Analysis Schema for Better Q&A Tracking

**File: `apps/api/src/services/vapi/user-notification-assistant-config.ts`**

```typescript
analysisPlan: {
  structuredDataSchema: {
    type: "object",
    properties: {
      selected_provider: {
        type: "number",
        description: "Provider number selected (1, 2, or 3)",
      },
      call_outcome: {
        type: "string",
        enum: ["selected", "no_selection", "declined_all", "wants_callback", "voicemail"],
      },
      user_questions: {
        type: "array",
        items: { type: "string" },
        description: "Questions the user asked about providers",
      },
      decision_factors: {
        type: "string",
        description: "What factors influenced the user's decision",
      },
      additional_notes: {
        type: "string",
        description: "Any other relevant information from the call",
      },
    },
    required: ["call_outcome"],
  },
}
```

---

## Files to Modify

| File | Changes | Complexity |
|------|---------|------------|
| `apps/api/src/services/vapi/user-notification-assistant-config.ts` | Expand interface, rewrite prompt | High |
| `apps/api/src/services/notifications/trigger-notification.ts` | Pass all provider data + overallRecommendation | Low |
| `apps/api/src/services/notifications/user-notification.service.ts` | Update callUser params (if needed) | Low |

---

## Implementation Order

1. **Step 1**: Expand `UserNotificationRequest` interface with new fields
2. **Step 2**: Update `trigger-notification.ts` to pass all rich data
3. **Step 3**: Rewrite the system prompt in `user-notification-assistant-config.ts`
4. **Step 4**: Update analysis schema for better tracking
5. **Step 5**: Test with a real call
6. **Step 6**: (Optional) Add call context fetching from database

---

## Expected User Experience After Changes

**What Phone Users Will Hear:**

```
"Hi Dave! This is AI Concierge calling about your plumber request.
Great news - I've researched several providers and found some excellent options!

My top recommendation is Bob's Plumbing. They have 4.8 stars from 127 reviews,
and they're available as early as Monday at 9am. They specialize in emergency
repairs and their estimated rate is $85 per hour - very competitive for the area.

I also found two other great options: Smith & Sons has 4.5 stars and is
available Tuesday, and Quick Fix Plumbing at 4.2 stars available Wednesday.

Would you like more details about any of these, or are you ready to choose?"

[User: "What makes Bob's the best choice?"]

"Great question! Bob's Plumbing scored highest because they combine the best
rating with the earliest availability. When I called them, they confirmed they
can handle emergency repairs same-day, and they're fully licensed and insured.
The reviews specifically mention their punctuality and fair pricing."

[User: "Okay, I'll go with Bob's"]

"Excellent choice! I'll book Bob's Plumbing for you. They're available Monday
at 9am and estimated at $85 per hour. You'll receive a confirmation shortly.
Thanks for using AI Concierge! Have a wonderful day!"
```

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Longer calls = higher VAPI costs | Keep prompt concise, lead with top pick |
| Token limits exceeded | Truncate reasoning/summaries to 100 chars |
| User asks unexpected questions | Prompt includes fallback: "I don't have that specific detail" |
| Call data not in database | Graceful degradation - works without call context |

---

## Success Criteria

- [ ] Phone users hear ratings and review counts for each provider
- [ ] Phone users hear estimated rates when available
- [ ] Phone users hear WHY the top provider was recommended
- [ ] Phone users can ask questions and get informed answers
- [ ] Selection capture still works correctly
- [ ] Call duration stays under 3 minutes for typical interactions

---

## Confidence: 90%

**Why 90% and not higher:**
- Haven't tested actual VAPI token limits with full context
- Call transcript fetching may need schema verification
- Voice delivery of detailed info needs real-world testing

**Why confident:**
- All data already exists in the system
- SMS implementation proves the data flow works
- Changes are additive (no breaking changes)
- Interface already supports optional fields
