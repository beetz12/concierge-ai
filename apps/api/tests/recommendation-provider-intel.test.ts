import assert from "node:assert/strict";
import test from "node:test";
import { RecommendationService } from "../src/services/recommendations/recommend.service.js";

test("RecommendationService prefers providers with stronger provider-intel evidence", async () => {
  process.env.GEMINI_API_KEY ||= "test-key";
  const service = new RecommendationService();

  const response = await service.generateRecommendations({
    serviceRequestId: "00000000-0000-0000-0000-000000000000",
    originalCriteria: "Need a landscaper in Greenville, SC",
    callResults: [
      {
        providerId: "provider-1",
        rating: 4.9,
        reviewCount: 12,
        providerIntel: {
          tradeClass: "design_build",
          tradeFit: "high",
          identityConfidence: "high",
          reputationSources: [
            { platform: "facebook", label: "Facebook" },
            { platform: "houzz", label: "Houzz" },
          ],
          positiveThemes: [
            { theme: "Strong Google review signal", sentiment: "positive" },
          ],
          recentTrend: "stable",
        },
        status: "completed",
        callId: "call-1",
        callMethod: "simulated",
        duration: 3,
        endedReason: "completed",
        transcript: "",
        analysis: {
          summary: "Helpful and professional",
          structuredData: {
            availability: "available",
            earliest_availability: "Tomorrow at 10am",
            estimated_rate: "$150",
            single_person_found: true,
            all_criteria_met: true,
            call_outcome: "positive",
            recommended: true,
          },
          successEvaluation: "",
        },
        provider: {
          name: "Greenville Outdoor Living",
          phone: "+18647877800",
          service: "landscaper",
          location: "Greenville, SC",
        },
        request: {
          criteria: "landscaper",
          urgency: "flexible",
        },
      },
      {
        providerId: "provider-2",
        rating: 5,
        reviewCount: 1,
        providerIntel: {
          tradeClass: "maintenance",
          tradeFit: "low",
          identityConfidence: "medium",
          negativeThemes: [
            { theme: "Thin review volume", sentiment: "mixed" },
          ],
          recentTrend: "unknown",
        },
        status: "completed",
        callId: "call-2",
        callMethod: "simulated",
        duration: 3,
        endedReason: "completed",
        transcript: "",
        analysis: {
          summary: "Helpful and professional",
          structuredData: {
            availability: "available",
            earliest_availability: "Tomorrow at 10am",
            estimated_rate: "$150",
            single_person_found: true,
            all_criteria_met: true,
            call_outcome: "positive",
            recommended: true,
          },
          successEvaluation: "",
        },
        provider: {
          name: "Aydan's Landscaping",
          phone: "+18643252350",
          service: "landscaper",
          location: "Greenville, SC",
        },
        request: {
          criteria: "landscaper",
          urgency: "flexible",
        },
      },
    ],
  });

  assert.equal(response.recommendations[0]?.providerName, "Greenville Outdoor Living");
  assert.ok(
    (response.recommendations[0]?.score ?? 0) >
      (response.recommendations[1]?.score ?? 0),
  );
  assert.match(response.recommendations[0]?.reasoning || "", /Strong trade match/);
});

test("RecommendationService builds useful reasoning when only deterministic fallback evidence is available", async () => {
  process.env.GEMINI_API_KEY ||= "test-key";
  const service = new RecommendationService();

  const response = await service.generateRecommendations({
    serviceRequestId: "00000000-0000-0000-0000-000000000000",
    originalCriteria: "Need a plumber in Greenville, SC",
    callResults: [
      {
        providerId: "provider-fallback",
        rating: 4.8,
        reviewCount: 14,
        providerIntel: {
          tradeClass: "specialty",
          tradeFit: "high",
          identityConfidence: "high",
          reputationSources: [{ platform: "bbb", label: "BBB" }],
        },
        status: "completed",
        callId: "call-fallback",
        callMethod: "simulated",
        duration: 3,
        endedReason: "completed",
        transcript: "",
        analysis: {
          summary: "Helpful and professional",
          structuredData: {
            availability: "available",
            earliest_availability: "Tomorrow at 2pm",
            estimated_rate: "$195",
            single_person_found: true,
            all_criteria_met: true,
            call_outcome: "positive",
            recommended: true,
          },
          successEvaluation: "",
        },
        provider: {
          name: "Benchmark Plumbing Co",
          phone: "+18645551212",
          service: "plumber",
          location: "Greenville, SC",
        },
        request: {
          criteria: "plumber",
          urgency: "flexible",
        },
      },
    ],
  });

  assert.match(
    response.recommendations[0]?.reasoning || "",
    /Strengths: Strong verified review signal/,
  );
  assert.match(
    response.recommendations[0]?.reasoning || "",
    /Cross-platform sources: bbb/,
  );
});
