import type { CallResultWithMetadata } from "../../src/services/recommendations/types.js";

type CallResultOverride = Partial<CallResultWithMetadata> & {
  provider?: Partial<NonNullable<CallResultWithMetadata["provider"]>>;
  analysis?: Partial<NonNullable<CallResultWithMetadata["analysis"]>> & {
    structuredData?: Record<string, unknown>;
  };
};

function buildCallResult(
  name: string,
  overrides: CallResultOverride = {},
): CallResultWithMetadata {
  return {
    providerId: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-id`,
    rating: 4.8,
    reviewCount: 18,
    status: "completed",
    callId: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-call`,
    callMethod: "simulated",
    duration: 4,
    endedReason: "completed",
    transcript: "",
    analysis: {
      summary: "Qualified provider",
      structuredData: {
        availability: "available",
        earliest_availability: "Tomorrow at 10am",
        estimated_rate: "$150",
        single_person_found: true,
        all_criteria_met: true,
        call_outcome: "positive",
        recommended: true,
        ...overrides.analysis?.structuredData,
      },
      successEvaluation: "",
      ...overrides.analysis,
    },
    provider: {
      name,
      phone: "+18640000000",
      service: "landscaper",
      location: "Greenville, SC",
      ...overrides.provider,
    },
    request: {
      criteria: "Need a landscaper in Greenville, SC",
      urgency: "flexible",
    },
    ...overrides,
  };
}

export const contradictionScenario = {
  balanced: buildCallResult("Greenville Outdoor Living", {
    rating: 4.9,
    reviewCount: 38,
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
        { theme: "Consistent project quality", sentiment: "positive" },
      ],
      recentTrend: "stable",
    },
  }),
  contradicted: buildCallResult("Graham Kimak Landscape Designs", {
    rating: 4.9,
    reviewCount: 12,
    providerIntel: {
      tradeClass: "design_build",
      tradeFit: "high",
      identityConfidence: "high",
      reputationSources: [{ platform: "yelp", label: "Yelp" }],
      contradictionNotes: [
        {
          summary: "Google sentiment is much stronger than Yelp sentiment.",
          severity: "medium",
          platforms: ["google", "yelp"],
        },
      ],
      negativeThemes: [
        {
          theme: "Mixed review sentiment across platforms",
          sentiment: "negative",
        },
      ],
      recentTrend: "mixed",
    },
  }),
};

export const identityCollisionScenario = {
  verified: buildCallResult("Retain Roots", {
    rating: 4.8,
    reviewCount: 16,
    providerIntel: {
      tradeClass: "design_build",
      tradeFit: "high",
      identityConfidence: "high",
      reputationSources: [
        { platform: "facebook", label: "Facebook" },
        { platform: "homeadvisor", label: "HomeAdvisor" },
      ],
      positiveThemes: [
        { theme: "Cross-platform identity match", sentiment: "positive" },
      ],
    },
  }),
  ambiguous: buildCallResult("Affordable Services", {
    rating: 5,
    reviewCount: 42,
    providerIntel: {
      tradeClass: "general",
      tradeFit: "medium",
      identityConfidence: "low",
      reputationSources: [{ platform: "yelp", label: "Yelp" }],
      negativeThemes: [
        {
          theme: "Identity anchors do not align across sources",
          sentiment: "negative",
        },
      ],
    },
  }),
};

export const tradeMismatchScenario = {
  matched: buildCallResult("Circle A Farms Design", {
    providerIntel: {
      tradeClass: "design_build",
      tradeFit: "high",
      identityConfidence: "high",
      reputationSources: [{ platform: "facebook", label: "Facebook" }],
    },
  }),
  mismatched: buildCallResult("Weekly Lawn Care Pros", {
    rating: 5,
    reviewCount: 30,
    providerIntel: {
      tradeClass: "maintenance",
      tradeFit: "low",
      identityConfidence: "high",
      reputationSources: [{ platform: "facebook", label: "Facebook" }],
      negativeThemes: [
        {
          theme: "Primary service is recurring lawn maintenance",
          sentiment: "negative",
        },
      ],
    },
  }),
};

export const communityProofScenario = {
  balanced: buildCallResult("Humbert Landscaping", {
    rating: 4.9,
    reviewCount: 19,
    providerIntel: {
      tradeClass: "design_build",
      tradeFit: "high",
      identityConfidence: "high",
      reputationSources: [
        { platform: "facebook", label: "Facebook" },
        { platform: "houzz", label: "Houzz" },
      ],
      positiveThemes: [
        { theme: "Strong community proof", sentiment: "positive" },
        { theme: "Strong Google review signal", sentiment: "positive" },
      ],
    },
  }),
  thinOffPlatform: buildCallResult("Neighborhood Favorite Landscaping", {
    rating: 5,
    reviewCount: 2,
    providerIntel: {
      tradeClass: "design_build",
      tradeFit: "high",
      identityConfidence: "high",
      positiveThemes: [
        { theme: "Strong community proof", sentiment: "positive" },
      ],
      negativeThemes: [{ theme: "Thin review volume", sentiment: "mixed" }],
      recentTrend: "unknown",
    },
  }),
};

export const selfPromoScenario = {
  organic: buildCallResult("Greenville Outdoor Living Organic", {
    providerIntel: {
      tradeClass: "design_build",
      tradeFit: "high",
      identityConfidence: "high",
      reputationSources: [
        { platform: "facebook", label: "Facebook" },
        { platform: "houzz", label: "Houzz" },
      ],
      positiveThemes: [
        { theme: "Independent customer praise", sentiment: "positive" },
      ],
    },
  }),
  selfPromotional: buildCallResult("Self Promo Landscape Co", {
    rating: 5,
    reviewCount: 10,
    providerIntel: {
      tradeClass: "design_build",
      tradeFit: "high",
      identityConfidence: "medium",
      reputationSources: [{ platform: "facebook", label: "Facebook" }],
      negativeThemes: [
        {
          theme: "Visible mentions are mostly self-promotional",
          sentiment: "negative",
        },
      ],
    },
  }),
};
