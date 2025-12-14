# Backend Recommendations & Notifications Refactor

**Date**: 2025-12-13
**Author**: Claude AI
**Status**: In Progress
**Type**: Refactor

## Table of Contents
- [Problem Statement](#problem-statement)
- [Solution Overview](#solution-overview)
- [Phase 1: Database Migration](#phase-1-database-migration)
- [Phase 2: Backend Enhancement](#phase-2-backend-enhancement)
- [Phase 3: Frontend Simplification](#phase-3-frontend-simplification)
- [Implementation Checklist](#implementation-checklist)

---

## Problem Statement

Currently, recommendation generation and user notifications are triggered by the **frontend**, which is architecturally wrong:

1. **Duplicate Logic**: Both frontend and backend generate recommendations
2. **Frontend has superior scoring**: The frontend's multi-objective scoring algorithm is more sophisticated
3. **Unreliable notifications**: If user closes browser, notification may not be sent
4. **No persistence**: Recommendations exist only in React state

The backend should own the entire flow: detect call completion → generate recommendations → store in database → send notifications.

---

## Solution Overview

### Key Changes

1. **Integrate frontend's superior scoring into backend** `RecommendationService`
2. **Add `recommendations` JSONB column** to `service_requests` table
3. **Backend stores recommendations** after generating them
4. **Backend triggers notifications** automatically
5. **Frontend fetches recommendations** from database (no local generation)

### Data Flow (After Changes)

```
┌─────────────────────────────────────────────────────────────────────┐
│  BACKEND (batch-call-async)                                         │
│                                                                     │
│  1. All calls complete                                              │
│  2. RecommendationService.generateRecommendations()                 │
│     - Uses integrated frontend scoring algorithm                    │
│     - Multi-objective: Conversation(35) + Fit(30) + Rep(25) + Trust(10) │
│  3. Store recommendations → service_requests.recommendations        │
│  4. Update status → RECOMMENDED                                     │
│  5. triggerUserNotification() → SMS or VAPI call                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                    (Supabase real-time subscription)
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│  FRONTEND (request/[id]/page.tsx)                                   │
│                                                                     │
│  6. Detect status=RECOMMENDED via subscription                      │
│  7. Fetch recommendations from service_requests.recommendations     │
│  8. Display in RecommendedProviders component                       │
│  9. NO local generation, NO notification triggering                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Database Migration

**File**: `supabase/migrations/[timestamp]_add_recommendations_column.sql`

```sql
-- Add recommendations JSONB column to service_requests
ALTER TABLE service_requests
ADD COLUMN IF NOT EXISTS recommendations JSONB;

-- Add index for efficient querying
CREATE INDEX IF NOT EXISTS idx_service_requests_recommendations
ON service_requests USING gin(recommendations);

-- Comment for documentation
COMMENT ON COLUMN service_requests.recommendations IS
'AI-generated provider recommendations. Structure: { recommendations: [], overallRecommendation: string, stats: {} }';
```

**Post-migration**:
```bash
supabase db push
supabase gen types typescript --linked > packages/types/database.ts
```

---

## Phase 2: Backend Enhancement

### 2.1 Integrate Frontend Scoring into RecommendationService

**File**: `apps/api/src/services/recommendations/recommend.service.ts`

**Add the following scoring functions from frontend:**

```typescript
/**
 * Multi-objective scoring algorithm (ported from frontend)
 * Total: 100 points max
 * - Conversation Quality: 35 points
 * - Service Fit: 30 points
 * - Provider Reputation: 25 points
 * - Trust Signals: 10 points
 */
private calculateScore(provider: ProviderData, callResult: CallResultData): number {
  let score = 0;

  // === CONVERSATION QUALITY (35 points max) ===
  if (callResult.call_outcome === "positive") {
    score += 20;
  } else if (callResult.call_outcome === "neutral") {
    score += 10;
  }
  // Gave specific availability info?
  if (callResult.earliest_availability && callResult.earliest_availability !== "unknown") {
    score += 8;
  }
  // Provided pricing info?
  if (callResult.estimated_rate &&
      callResult.estimated_rate !== "unknown" &&
      callResult.estimated_rate !== "Quote upon request") {
    score += 7;
  }

  // === SERVICE FIT (30 points max) ===
  if (callResult.all_criteria_met) {
    score += 20;
  }
  if (callResult.availability === "available") {
    score += 7;
  } else if (callResult.availability === "callback_requested") {
    score += 3;
  }
  if (callResult.single_person_found) {
    score += 3;
  }

  // === PROVIDER REPUTATION (25 points max) ===
  const rating = provider.rating || 0;
  if (rating >= 4.5) score += 20;
  else if (rating >= 4.0) score += 16;
  else if (rating >= 3.5) score += 12;
  else if (rating >= 3.0) score += 8;
  else if (rating > 0) score += 4;

  const reviews = provider.review_count || 0;
  if (reviews >= 100) score += 5;
  else if (reviews >= 50) score += 4;
  else if (reviews >= 20) score += 3;
  else if (reviews >= 10) score += 2;
  else if (reviews > 0) score += 1;

  // === TRUST SIGNALS (10 points max) ===
  if (callResult.recommended) {
    score += 10;
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Build human-readable reasoning (ported from frontend)
 */
private buildReasoning(provider: ProviderData, callResult: CallResultData): string {
  const parts: string[] = [];

  // Availability
  if (callResult.earliest_availability && callResult.earliest_availability !== "unknown") {
    parts.push(`Available ${callResult.earliest_availability}`);
  }

  // Rating
  if (provider.rating && provider.rating > 0) {
    const ratingText = `${provider.rating.toFixed(1)}★`;
    const reviewText = provider.review_count ? ` (${provider.review_count} reviews)` : "";
    parts.push(`Rated ${ratingText}${reviewText}`);
  }

  // Pricing
  if (callResult.estimated_rate &&
      callResult.estimated_rate !== "unknown" &&
      callResult.estimated_rate !== "Quote upon request") {
    parts.push(`Rate: ${callResult.estimated_rate}`);
  }

  // Criteria
  if (callResult.all_criteria_met) {
    parts.push("Meets all requirements");
  }

  // Call summary insights
  if (callResult.call_summary) {
    const sentences = callResult.call_summary.split(/[.!?]+/).filter(Boolean);
    for (const sentence of sentences.slice(0, 2)) {
      const insight = sentence.trim();
      if (insight.length > 10 && insight.length < 100) {
        if (!insight.toLowerCase().includes("available") &&
            !insight.toLowerCase().includes("rating")) {
          parts.push(insight);
        }
      }
    }
  }

  return parts.length > 0 ? parts.join(" • ") : "Provider contacted successfully";
}
```

### 2.2 Update generateRecommendations to Use New Scoring

Replace the Gemini-only approach with deterministic scoring + optional Gemini enhancement:

```typescript
async generateRecommendations(request: RecommendationRequest): Promise<RecommendationResponse> {
  const qualifiedResults = this.filterQualifiedProviders(request.callResults);

  const stats = {
    totalCalls: request.callResults.length,
    qualifiedProviders: qualifiedResults.length,
    disqualifiedProviders: request.callResults.filter(r => r.analysis.structuredData.disqualified).length,
    failedCalls: request.callResults.filter(r => ["error", "timeout"].includes(r.status)).length,
  };

  if (qualifiedResults.length === 0) {
    return {
      recommendations: [],
      overallRecommendation: "Unfortunately, none of the providers were qualified based on the criteria.",
      analysisNotes: "Consider expanding your search criteria or trying additional providers.",
      stats,
    };
  }

  // Use deterministic multi-objective scoring (ported from frontend)
  const recommendations = qualifiedResults
    .map(result => {
      const callData = result.analysis.structuredData;
      const score = this.calculateScore(result.provider, callData);

      return {
        providerId: result.provider.id,
        providerName: result.provider.name,
        phone: result.provider.phone,
        rating: result.provider.rating || 0,
        reviewCount: result.provider.reviewCount,
        score,
        reasoning: this.buildReasoning(result.provider, callData),
        earliestAvailability: callData.earliest_availability || "Contact for availability",
        estimatedRate: callData.estimated_rate || "Quote upon request",
        criteriaMatched: callData.all_criteria_met ? ["All criteria met"] :
                         callData.call_outcome === "positive" ? ["Positive response"] : [],
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  // Generate overall recommendation
  const topProvider = recommendations[0];
  const overallRecommendation = topProvider
    ? `${topProvider.providerName} is the top recommendation with a score of ${topProvider.score}/100. ${topProvider.reasoning}`
    : "No qualified providers found.";

  return {
    recommendations,
    overallRecommendation,
    analysisNotes: `Analyzed ${stats.totalCalls} providers, ${stats.qualifiedProviders} qualified.`,
    stats,
  };
}
```

### 2.3 Store Recommendations in Database

**File**: `apps/api/src/routes/providers.ts` (in batch-call-async, after generating recommendations)

```typescript
// After generating recommendations, store in database
if (directResult?.recommendations?.length >= 0) {
  const { error: updateError } = await supabase
    .from("service_requests")
    .update({
      recommendations: directResult,
      status: "RECOMMENDED"
    })
    .eq("id", validated.serviceRequestId);

  if (updateError) {
    fastify.log.error({ updateError }, "Failed to store recommendations");
  } else {
    fastify.log.info({
      serviceRequestId: validated.serviceRequestId,
      recommendationCount: directResult.recommendations.length
    }, "Recommendations stored in database");
  }
}
```

### 2.4 Trigger Notifications Automatically

**New file**: `apps/api/src/services/notifications/trigger-notification.ts`

```typescript
import { DirectTwilioClient } from "./direct-twilio.client.js";
import { UserNotificationService } from "./user-notification.service.js";
import { createClient } from "@supabase/supabase-js";

interface TriggerNotificationParams {
  serviceRequestId: string;
  userPhone: string;
  userName?: string;
  preferredContact: "phone" | "text";
  serviceNeeded?: string;
  location?: string;
  providers: Array<{ name: string; earliestAvailability: string }>;
}

export async function triggerUserNotification(
  params: TriggerNotificationParams
): Promise<{ success: boolean; method: string }> {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if notification already sent
  const { data: request } = await supabase
    .from("service_requests")
    .select("notification_sent_at")
    .eq("id", params.serviceRequestId)
    .single();

  if (request?.notification_sent_at) {
    return { success: true, method: "already_sent" };
  }

  let method = "sms";
  let success = false;

  try {
    if (params.preferredContact === "phone") {
      const notificationService = new UserNotificationService();
      const result = await notificationService.callUser({
        userPhone: params.userPhone,
        userName: params.userName,
        serviceRequestId: params.serviceRequestId,
        recommendations: params.providers.map((p, i) => ({ rank: i + 1, ...p }))
      });
      success = result.success;
      method = "vapi";
    } else {
      const twilioClient = new DirectTwilioClient();
      const result = await twilioClient.sendNotification({
        userPhone: params.userPhone,
        userName: params.userName,
        providers: params.providers,
        requestUrl: `${process.env.FRONTEND_URL || "https://concierge-ai.vercel.app"}/request/${params.serviceRequestId}`
      });
      success = result.success;
      method = "sms";
    }

    if (success) {
      await supabase
        .from("service_requests")
        .update({
          notification_sent_at: new Date().toISOString(),
          notification_method: method
        })
        .eq("id", params.serviceRequestId);
    }
  } catch (error) {
    console.error("Notification error:", error);
  }

  return { success, method };
}
```

**Integrate in providers.ts** (after storing recommendations):

```typescript
// Trigger notification automatically
if (validated.userPhone && directResult.recommendations.length > 0) {
  try {
    const notificationResult = await triggerUserNotification({
      serviceRequestId: validated.serviceRequestId,
      userPhone: validated.userPhone,
      userName: validated.clientName,
      preferredContact: validated.preferredContact || "text",
      serviceNeeded: validated.serviceNeeded,
      location: validated.location,
      providers: directResult.recommendations.slice(0, 3).map(r => ({
        name: r.providerName,
        earliestAvailability: r.earliestAvailability || "Contact for availability"
      }))
    });

    fastify.log.info({
      serviceRequestId: validated.serviceRequestId,
      method: notificationResult.method,
      success: notificationResult.success
    }, "User notification triggered from backend");
  } catch (notifyError) {
    fastify.log.error({ notifyError }, "Failed to send user notification");
  }
}
```

---

## Phase 3: Frontend Simplification

### 3.1 Remove Local Recommendation Generation

**File**: `apps/web/app/request/[id]/page.tsx`

**DELETE** the entire `checkAndGenerateRecommendations` function (~lines 214-592) including:
- `buildReasoning` helper
- `calculateScore` helper
- All polling/retry logic

**REPLACE** with simple database fetch:

```typescript
// Fetch recommendations from database when status is RECOMMENDED
const fetchRecommendationsFromDb = useCallback(async () => {
  if (!id || !isValidUuid(id)) return;
  if (recommendations) return;

  setRecommendationsLoading(true);
  const supabase = createClient();

  const { data, error } = await supabase
    .from("service_requests")
    .select("recommendations, status")
    .eq("id", id)
    .single();

  if (error) {
    console.error("[Recommendations] Fetch error:", error);
    setRecommendationsLoading(false);
    return;
  }

  if (data?.recommendations && data.status === "RECOMMENDED") {
    const dbRecs = data.recommendations;
    setRecommendations({
      providers: dbRecs.recommendations.map((r: any) => ({
        providerId: r.providerId || "",
        providerName: r.providerName,
        phone: r.phone,
        rating: r.rating || 0,
        reviewCount: r.reviewCount,
        earliestAvailability: r.earliestAvailability,
        estimatedRate: r.estimatedRate,
        score: r.score,
        reasoning: r.reasoning,
        criteriaMatched: r.criteriaMatched
      })),
      overallRecommendation: dbRecs.overallRecommendation
    });
    setRecommendationsChecked(true);
    recommendationsCheckedRef.current = true;
  }

  setRecommendationsLoading(false);
}, [id, recommendations]);
```

### 3.2 Update Real-Time Subscription

When status changes to RECOMMENDED, fetch from database:

```typescript
// In the service_requests subscription handler
if (newStatus === "RECOMMENDED" && prevStatus !== "RECOMMENDED") {
  console.log("[Subscription] Status changed to RECOMMENDED");

  // Check if recommendations are in the payload
  if (payload.new.recommendations) {
    const dbRecs = payload.new.recommendations;
    setRecommendations({
      providers: dbRecs.recommendations,
      overallRecommendation: dbRecs.overallRecommendation
    });
    setRecommendationsChecked(true);
  } else {
    fetchRecommendationsFromDb();
  }
}
```

### 3.3 Remove Notification Triggering

**DELETE** the notification block (approximately lines 552-581 in the old code):
```typescript
// DELETE THIS - backend handles notifications now
const effectiveUserPhone = latestRequest?.userPhone || dbRequest?.userPhone;
if (effectiveUserPhone && qualifiedProviders.length > 0 && !notificationSent) {
  // ... notifyUser() call
}
```

### 3.4 Simplify Status Effect

```typescript
useEffect(() => {
  if (
    request?.status === RequestStatus.RECOMMENDED &&
    !recommendations &&
    !recommendationsLoading
  ) {
    fetchRecommendationsFromDb();
  }
}, [request?.status, recommendations, recommendationsLoading, fetchRecommendationsFromDb]);
```

---

## Implementation Checklist

### Phase 1: Database
- [ ] Create migration file for `recommendations` column
- [ ] Run `supabase db push`
- [ ] Regenerate types with `supabase gen types typescript`

### Phase 2: Backend
- [ ] Add `calculateScore` method to RecommendationService
- [ ] Add `buildReasoning` method to RecommendationService
- [ ] Update `generateRecommendations` to use new scoring
- [ ] Add code to store recommendations in database
- [ ] Create `trigger-notification.ts` service
- [ ] Integrate notification trigger in providers.ts
- [ ] Test backend recommendation generation
- [ ] Test backend notification sending

### Phase 3: Frontend
- [ ] Remove `checkAndGenerateRecommendations` function
- [ ] Remove `buildReasoning` helper
- [ ] Remove `calculateScore` helper
- [ ] Add `fetchRecommendationsFromDb` function
- [ ] Update real-time subscription for RECOMMENDED status
- [ ] Remove notification triggering code
- [ ] Simplify status effect
- [ ] Test frontend displays recommendations from DB

### Verification
- [ ] TypeScript compilation passes
- [ ] Recommendations generated and stored in DB
- [ ] Notifications sent automatically from backend
- [ ] Frontend displays recommendations from database
- [ ] Real-time updates work
- [ ] Page refresh loads recommendations from DB
- [ ] No duplicate notifications

---

## Document Metadata

**Last Updated**: 2025-12-13
**Implementation Status**: In Progress
**Related Documents**:
- `/docs/about_concierge_ai.md` - Full user journey documentation

**Change Log**:
- 2025-12-13 - Initial creation with comprehensive plan
