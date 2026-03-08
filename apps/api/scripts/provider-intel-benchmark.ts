import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { ResearchService } from "../src/services/research/research.service.js";
import { RecommendationService } from "../src/services/recommendations/recommend.service.js";
import type { CallResultWithMetadata } from "../src/services/recommendations/types.js";
import type { Provider, ResearchResult } from "../src/services/research/types.js";
import {
  benchmarkScenarioById,
  providerIntelBenchmarkScenarios,
  type ProviderIntelBenchmarkScenario,
} from "../tests/fixtures/provider-intel-benchmark-scenarios.js";

loadEnv({ path: resolve(process.cwd(), ".env") });

const scriptDir = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(
  scriptDir,
  "../tests/fixtures/provider-intel-benchmarks",
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

export interface ProviderIntelBenchmarkOptions {
  scenarioId?: string;
  mode?: string;
  outputPath?: string;
  captureSnapshot?: boolean;
  skipAssert?: boolean;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function parseCliOptions(): Required<ProviderIntelBenchmarkOptions> {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const getArg = (flag: string, fallback?: string) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : fallback;
  };

  const scenarioId = getArg("--scenario", "greenville-landscaper")!;
  const mode = getArg("--mode", "snapshot")!;
  const outputPath = resolve(
    process.cwd(),
    getArg("--output", `provider-intel-benchmark-${scenarioId}.json`)!,
  );

  return {
    scenarioId,
    mode,
    outputPath,
    captureSnapshot: args.includes("--capture-snapshot"),
    skipAssert: args.includes("--skip-assert"),
  };
}

function buildSyntheticCallResults(
  providers: Provider[],
  service: string,
  location: string,
  originalCriteria: string,
): CallResultWithMetadata[] {
  return providers.map((provider, index) => ({
    providerId: provider.id,
    rating: provider.rating,
    reviewCount: provider.reviewCount,
    providerIntel: provider.providerIntel,
    status: "completed",
    callId: `benchmark-call-${index + 1}`,
    callMethod: "simulated",
    duration: 3,
    endedReason: "completed",
    transcript: "",
    analysis: {
      summary: "Synthetic benchmark qualification result",
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
      service,
      location,
    },
    request: {
      criteria: originalCriteria,
      urgency: "flexible",
    },
  }));
}

function buildBenchmarkReport(
  scenario: ProviderIntelBenchmarkScenario,
  mode: string,
  result: ResearchResult,
  recommendationResult: Awaited<
    ReturnType<RecommendationService["generateRecommendations"]>
  >,
) {
  return {
    scenarioId: scenario.id,
    mode,
    service: scenario.service,
    location: scenario.location,
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
      reputationSourcePlatforms:
        provider.providerIntel?.reputationSources?.map((source) => source.platform) ??
        [],
    })),
    finalists: recommendationResult.recommendations.map((recommendation) => ({
      name: recommendation.providerName,
      phone: recommendation.phone,
      rating: recommendation.rating,
      reviewCount: recommendation.reviewCount,
      score: recommendation.score,
      tradeFit: recommendation.tradeFit,
      tradeClass: recommendation.tradeClass,
      reasoning: recommendation.reasoning,
    })),
  };
}

function assertExpectedOrder(
  label: string,
  actual: string[],
  expected: string[],
): void {
  assert(
    expected.length > 0,
    `Scenario is missing expected ${label} names; update the benchmark fixture first.`,
  );
  assert(
    actual.length >= expected.length,
    `Expected at least ${expected.length} ${label}, received ${actual.length}.`,
  );

  const normalizedActual = actual.slice(0, expected.length);
  const matches = normalizedActual.every((name, index) => name === expected[index]);
  assert(
    matches,
    `Unexpected ${label} order.\nExpected: ${expected.join(" | ")}\nActual: ${normalizedActual.join(" | ")}`,
  );
}

async function loadSnapshotProviders(
  scenario: ProviderIntelBenchmarkScenario,
): Promise<Provider[]> {
  const snapshotPath = resolve(fixturesDir, scenario.snapshotFile);
  const contents = await readFile(snapshotPath, "utf8");
  const parsed = JSON.parse(contents) as { providers: Provider[] };
  return parsed.providers;
}

async function writeSnapshot(
  scenario: ProviderIntelBenchmarkScenario,
  providers: Provider[],
): Promise<void> {
  const snapshotPath = resolve(fixturesDir, scenario.snapshotFile);
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(
    snapshotPath,
    JSON.stringify(
      {
        scenarioId: scenario.id,
        service: scenario.service,
        location: scenario.location,
        generatedAt: new Date().toISOString(),
        providers,
      },
      null,
      2,
    ),
  );
}

export async function runProviderIntelBenchmark(
  options: ProviderIntelBenchmarkOptions = {},
) {
  const cliOptions = parseCliOptions();
  const resolvedOptions = {
    scenarioId: options.scenarioId ?? cliOptions.scenarioId,
    mode: options.mode ?? cliOptions.mode,
    outputPath: resolve(process.cwd(), options.outputPath ?? cliOptions.outputPath),
    captureSnapshot: options.captureSnapshot ?? cliOptions.captureSnapshot,
    skipAssert: options.skipAssert ?? cliOptions.skipAssert,
  };

  const scenario = benchmarkScenarioById(resolvedOptions.scenarioId);
  assert(
    scenario,
    `Unknown benchmark scenario "${resolvedOptions.scenarioId}". Known scenarios: ${providerIntelBenchmarkScenarios.map((item) => item.id).join(", ")}`,
  );

  const researchService = new ResearchService(logger);
  const recommendationService = new RecommendationService();
  const originalCriteria = `Need a ${scenario.service} in ${scenario.location}`;

  let result: ResearchResult;

  if (resolvedOptions.mode === "live") {
    assert(process.env.GOOGLE_PLACES_API_KEY, "Missing GOOGLE_PLACES_API_KEY");

    result = await researchService.search({
      service: scenario.service,
      location: scenario.location,
      minRating: 4.5,
      maxResults: 5,
    });

    assert(
      result.status === "success",
      `Live research failed: ${result.error ?? "unknown error"}`,
    );

    if (resolvedOptions.captureSnapshot) {
      await writeSnapshot(scenario, result.providers);
    }
  } else if (resolvedOptions.mode === "snapshot") {
    const providers = await loadSnapshotProviders(scenario);
    result = await researchService.prepareProvidersForRecommendations(
      {
        service: scenario.service,
        location: scenario.location,
      },
      providers,
      { deterministicReviewAnalysis: true },
    );
  } else {
    throw new Error(
      `Unsupported mode "${resolvedOptions.mode}". Use live or snapshot.`,
    );
  }

  const recommendationResult = await recommendationService.generateRecommendations(
    {
      serviceRequestId: "00000000-0000-0000-0000-000000000000",
      originalCriteria,
      callResults: buildSyntheticCallResults(
        result.providers,
        scenario.service,
        scenario.location,
        originalCriteria,
      ),
    },
  );

  assert(
    recommendationResult.recommendations.length > 0,
    "Recommendation service produced zero finalists",
  );

  const report = buildBenchmarkReport(
    scenario,
    resolvedOptions.mode,
    result,
    recommendationResult,
  );

  if (!resolvedOptions.skipAssert) {
    assertExpectedOrder(
      "topProviders",
      report.topProviders.map((provider) => provider.name),
      scenario.expectedTopProviders,
    );
    assertExpectedOrder(
      "finalists",
      report.finalists.map((provider) => provider.name),
      scenario.expectedFinalists,
    );
  }

  await writeFile(resolvedOptions.outputPath, JSON.stringify(report, null, 2));

  console.log(
    `Provider-intel benchmark passed for ${scenario.id} (${resolvedOptions.mode})`,
  );
  console.log(`Report written to ${resolvedOptions.outputPath}`);
  if (resolvedOptions.skipAssert) {
    console.log(
      `Observed top providers: ${report.topProviders.map((provider) => provider.name).join(" | ")}`,
    );
    console.log(
      `Observed finalists: ${report.finalists.map((provider) => provider.name).join(" | ")}`,
    );
  }

  return report;
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  runProviderIntelBenchmark().catch((error) => {
    console.error("Provider-intel benchmark failed:");
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
