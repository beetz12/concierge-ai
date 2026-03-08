import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { ResearchService } from "../src/services/research/research.service.js";
import { RecommendationService } from "../src/services/recommendations/recommend.service.js";
import type { CallResultWithMetadata } from "../src/services/recommendations/types.js";
import type { Provider } from "../src/services/research/types.js";

loadEnv({ path: resolve(process.cwd(), ".env") });

const args = process.argv.slice(2);
const getArg = (flag: string, fallback: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
};

const requestedService = getArg("--service", "landscaper");
const requestedLocation = getArg("--location", "Greenville, SC");
const outputPath = getArg(
  "--output",
  resolve(process.cwd(), "provider-intel-smoke-report.json"),
);

const logger = {
  info(obj: Record<string, unknown>, msg?: string) {
    console.log("[info]", msg ?? "", JSON.stringify(obj));
  },
  debug(obj: Record<string, unknown>, msg?: string) {
    console.log("[debug]", msg ?? "", JSON.stringify(obj));
  },
  warn(obj: Record<string, unknown>, msg?: string) {
    console.warn("[warn]", msg ?? "", JSON.stringify(obj));
  },
  error(obj: Record<string, unknown>, msg?: string) {
    console.error("[error]", msg ?? "", JSON.stringify(obj));
  },
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function buildSyntheticCallResults(
  providers: Provider[],
  originalCriteria: string,
): CallResultWithMetadata[] {
  return providers.slice(0, 3).map((provider, index) => ({
    providerId: provider.id,
    rating: provider.rating,
    reviewCount: provider.reviewCount,
    providerIntel: provider.providerIntel,
    status: "completed",
    callId: `smoke-call-${index + 1}`,
    callMethod: "simulated",
    duration: 3,
    endedReason: "completed",
    transcript: "",
    analysis: {
      summary: "Synthetic smoke-test qualification result",
      structuredData: {
        availability: "available",
        earliest_availability:
          provider.providerIntel?.tradeFit === "high"
            ? "Tomorrow at 10:00 AM"
            : "Friday at 2:00 PM",
        estimated_rate: "$150",
        single_person_found: true,
        all_criteria_met: provider.providerIntel?.tradeFit !== "low",
        call_outcome: "positive",
        recommended: true,
      },
      successEvaluation: "",
    },
    provider: {
      name: provider.name,
      phone: provider.phone ?? "",
      service: requestedService,
      location: requestedLocation,
    },
    request: {
      criteria: originalCriteria,
      urgency: "flexible",
    },
  }));
}

async function main() {
  assert(process.env.GEMINI_API_KEY, "Missing GEMINI_API_KEY in apps/api/.env");
  assert(
    process.env.GOOGLE_PLACES_API_KEY,
    "Missing GOOGLE_PLACES_API_KEY in apps/api/.env",
  );

  const researchService = new ResearchService(logger);
  const recommendationService = new RecommendationService();

  const originalCriteria = `Need a ${requestedService} in ${requestedLocation}`;
  const result = await researchService.search({
    service: requestedService,
    location: requestedLocation,
    minRating: 4.5,
    maxResults: 5,
  });

  assert(
    result.status === "success",
    `Research failed: ${result.error ?? "unknown error"}`,
  );
  assert(result.providers.length > 0, "Research returned zero providers");

  const stageNames = new Set(
    (result.pipelineStages ?? []).map((stage) => stage.name),
  );
  assert(stageNames.has("candidate_discovery"), "Missing candidate_discovery stage");
  assert(
    stageNames.has("places_detail_enrichment"),
    "Missing places_detail_enrichment stage",
  );
  assert(
    stageNames.has("web_reputation_enrichment"),
    "Missing web_reputation_enrichment stage",
  );
  assert(
    stageNames.has("gemini_review_analysis"),
    "Missing gemini_review_analysis stage",
  );

  assert(
    result.providers.some((provider) => Boolean(provider.phone)),
    "No provider included phone data after enrichment",
  );
  assert(
    result.providers.some((provider) => Boolean(provider.providerIntel)),
    "Providers are missing providerIntel payloads",
  );

  const recommendationResult = await recommendationService.generateRecommendations(
    {
      serviceRequestId: "00000000-0000-0000-0000-000000000000",
      originalCriteria,
      callResults: buildSyntheticCallResults(result.providers, originalCriteria),
    },
  );

  assert(
    recommendationResult.recommendations.length > 0,
    "Recommendation service produced zero finalists",
  );

  const topRecommendation = recommendationResult.recommendations[0];
  assert(topRecommendation?.phone, "Top recommendation is missing phone");
  assert(
    typeof topRecommendation?.score === "number",
    "Top recommendation is missing score",
  );
  assert(
    Array.isArray(topRecommendation?.positiveThemes),
    "Top recommendation is missing positiveThemes",
  );
  assert(
    Array.isArray(topRecommendation?.negativeThemes),
    "Top recommendation is missing negativeThemes",
  );
  assert(
    Array.isArray(topRecommendation?.reputationSourcePlatforms),
    "Top recommendation is missing reputationSourcePlatforms",
  );

  const report = {
    service: requestedService,
    location: requestedLocation,
    generatedAt: new Date().toISOString(),
    providerCount: result.providers.length,
    pipelineStages: result.pipelineStages,
    topProviders: result.providers.slice(0, 3).map((provider) => ({
      name: provider.name,
      phone: provider.phone,
      rating: provider.rating,
      reviewCount: provider.reviewCount,
      identityConfidence: provider.providerIntel?.identityConfidence,
      tradeFit: provider.providerIntel?.tradeFit,
      tradeClass: provider.providerIntel?.tradeClass,
      reputationSources:
        provider.providerIntel?.reputationSources?.map((source) => source.platform) ??
        [],
      positiveThemes:
        provider.providerIntel?.positiveThemes?.map((theme) => theme.theme) ?? [],
      negativeThemes:
        provider.providerIntel?.negativeThemes?.map((theme) => theme.theme) ?? [],
      contradictionNotes:
        provider.providerIntel?.contradictionNotes?.map((note) => note.summary) ??
        [],
    })),
    finalists: recommendationResult.recommendations.map((recommendation) => ({
      providerName: recommendation.providerName,
      phone: recommendation.phone,
      score: recommendation.score,
      identityConfidence: recommendation.identityConfidence,
      tradeFit: recommendation.tradeFit,
      tradeClass: recommendation.tradeClass,
      positiveThemes: recommendation.positiveThemes,
      negativeThemes: recommendation.negativeThemes,
      contradictionNotes: recommendation.contradictionNotes,
      reputationSourcePlatforms: recommendation.reputationSourcePlatforms,
      reasoning: recommendation.reasoning,
    })),
    overallRecommendation: recommendationResult.overallRecommendation,
  };

  await writeFile(outputPath, JSON.stringify(report, null, 2));

  console.log(`Smoke test passed for ${requestedService} in ${requestedLocation}`);
  console.log(`Report written to ${outputPath}`);
}

main().catch((error) => {
  console.error("Provider-intel smoke test failed:");
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
