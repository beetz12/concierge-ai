import assert from "node:assert/strict";
import test from "node:test";
import { RecommendationService } from "../src/services/recommendations/recommend.service.js";

process.env.GEMINI_API_KEY ||= "test-key";

const buildSparseCallResult = (
  name: string,
  reviewCount: number,
  negativeThemes: string[] = [],
) => ({
  providerId: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-id`,
  rating: 4.9,
  reviewCount,
  status: "completed" as const,
  callId: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-call`,
  callMethod: "simulated" as const,
  duration: 4,
  endedReason: "completed",
  transcript: "",
  analysis: {
    summary: "Qualified provider",
    structuredData: {
      availability: "available",
      earliest_availability: "Tomorrow at 9am",
      estimated_rate: "$150",
      single_person_found: true,
      all_criteria_met: true,
      call_outcome: "positive",
      recommended: true,
    },
    successEvaluation: "",
  },
  provider: {
    name,
    phone: "+18640000000",
    service: "landscaper",
    location: "Greenville, SC",
  },
  request: {
    criteria: "Need a landscaper in Greenville, SC",
    urgency: "flexible",
  },
  providerIntel: {
    tradeClass: "design_build" as const,
    tradeFit: "high" as const,
    identityConfidence: "medium" as const,
    recentTrend: "unknown" as const,
    positiveThemes: [{ theme: "Strong community proof", sentiment: "positive" as const }],
    negativeThemes: negativeThemes.map((theme) => ({
      theme,
      sentiment: "mixed" as const,
    })),
  },
});

test("provider-intel graceful degradation: sparse providers are still returned with caveats instead of collapsing to empty", async () => {
  const service = new RecommendationService();

  const response = await service.generateRecommendations({
    serviceRequestId: "00000000-0000-0000-0000-000000000000",
    originalCriteria: "Need a landscaper in Greenville, SC",
    callResults: [
      buildSparseCallResult("Thin Evidence Landscaping", 2, ["Thin review volume"]),
      buildSparseCallResult("Still Sparse Landscaping", 3, ["Thin review volume"]),
    ],
  });

  assert.equal(response.recommendations.length, 2);
  assert.match(response.recommendations[0]?.reasoning || "", /caution|review/i);
  assert.deepEqual(response.recommendations[0]?.negativeThemes, ["Thin review volume"]);
  assert.match(response.overallRecommendation, /recommend/i);
});

test("provider-intel graceful degradation: no completed qualified calls returns empty recommendation set with guidance", async () => {
  const service = new RecommendationService();

  const response = await service.generateRecommendations({
    serviceRequestId: "00000000-0000-0000-0000-000000000000",
    originalCriteria: "Need a landscaper in Greenville, SC",
    callResults: [
      {
        ...buildSparseCallResult("Voicemail Landscaping", 2),
        status: "completed" as const,
        analysis: {
          summary: "Reached voicemail",
          structuredData: {
            call_outcome: "voicemail",
            recommended: false,
          },
          successEvaluation: "",
        },
      },
      {
        ...buildSparseCallResult("Timed Out Landscaping", 2),
        status: "timeout" as const,
      },
    ],
  });

  assert.equal(response.recommendations.length, 0);
  assert.match(response.overallRecommendation, /couldn't find a qualified provider/i);
  assert.match(response.analysisNotes || "", /expanding your search criteria/i);
});
