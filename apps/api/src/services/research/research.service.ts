/**
 * Research Service
 * Main orchestrator for provider research
 * Routes between Kestra and Direct Gemini based on availability
 */

import { KestraResearchClient } from "./kestra-research.client.js";
import { DirectResearchClient } from "./direct-research.client.js";
import { ProviderEnrichmentService } from "./enrichment.service.js";
import { WebReputationSearchService } from "./web-reputation-search.service.js";
import { inferIdentityConfidence } from "./identity-helper.js";
import { classifyProviderTrade } from "./trade-classification-helper.js";
import { ReviewAnalysisService } from "./review-analysis.service.js";
import { normalizePhoneToE164 } from "../../utils/phone.js";
import { serializeError } from "../../utils/error.js";
import type {
  ProviderIntelConfidence,
  ResearchPipelineStage,
  ResearchRequest,
  ResearchResult,
  SystemStatus,
} from "./types.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export class ResearchService {
  private kestraClient: KestraResearchClient;
  private directClient: DirectResearchClient;
  private enrichmentService: ProviderEnrichmentService;
  private webReputationSearchService: WebReputationSearchService;
  private reviewAnalysisService: ReviewAnalysisService;

  constructor(private logger: Logger) {
    this.kestraClient = new KestraResearchClient(logger);
    this.directClient = new DirectResearchClient(logger);
    this.enrichmentService = new ProviderEnrichmentService();
    this.webReputationSearchService = new WebReputationSearchService(logger);
    this.reviewAnalysisService = new ReviewAnalysisService(logger);
  }

  /**
   * Main research method - intelligently routes to best available method
   */
  async search(request: ResearchRequest): Promise<ResearchResult> {
    this.logger.info(
      {
        service: request.service,
        location: request.location,
        serviceRequestId: request.serviceRequestId,
      },
      "Starting provider research"
    );

    let result: ResearchResult;

    try {
      // Check if we should use Kestra
      const useKestra = await this.shouldUseKestra();

      if (useKestra) {
        this.logger.info({ method: "kestra" }, "Using Kestra for research");
        result = await this.kestraClient.research(request);
      } else {
        this.logger.info(
          { method: "direct_gemini" },
          "Using Direct Gemini for research"
        );
        result = await this.directClient.research(request);
      }
    } catch (error) {
      this.logger.error(
        { error: serializeError(error), request },
        "Research failed, attempting fallback"
      );

      // Check if Kestra is explicitly enabled - if so, don't fall back
      const kestraEnabled = process.env.KESTRA_ENABLED === "true";
      const wasUsingKestra = await this.shouldUseKestra();

      if (kestraEnabled && wasUsingKestra) {
        this.logger.error(
          { error: serializeError(error) },
          "Kestra failed with KESTRA_ENABLED=true - not falling back to preserve error visibility"
        );
        throw error;
      }

      // If primary method fails, try the other one
      try {
        const useKestra = wasUsingKestra; // Reuse the check we already did
        if (useKestra) {
          this.logger.warn({}, "Kestra failed, falling back to Direct Gemini");
          result = await this.directClient.research(request);
        } else {
          this.logger.warn(
            {},
            "Direct Gemini failed, attempting Kestra fallback"
          );
          const kestraHealthy = await this.kestraClient.healthCheck();
          if (kestraHealthy) {
            result = await this.kestraClient.research(request);
          } else {
            // Both methods failed
            return {
              status: "error",
              method: "direct_gemini",
              providers: [],
              error: error instanceof Error ? error.message : "Research failed",
            };
          }
        }
      } catch (fallbackError) {
        this.logger.error(
          { error: serializeError(fallbackError) },
          "Fallback research also failed"
        );

        // Both methods failed
        return {
          status: "error",
          method: "direct_gemini",
          providers: [],
          error: error instanceof Error ? error.message : "Research failed",
        };
      }
    }

    result = await this.runPostDiscoveryPipeline(result, request);

    // Normalize phone numbers to E.164 format for VAPI compatibility (applies to all methods)
    if (result.status !== "error") {
      result = this.normalizePhoneNumbers(result);
    }

    return result;
  }

  /**
   * Run the explicit post-discovery pipeline in stage order.
   * Later stages remain pluggable even before their implementations land.
   */
  private async runPostDiscoveryPipeline(
    result: ResearchResult,
    request: ResearchRequest
  ): Promise<ResearchResult> {
    let current = this.ensureDiscoveryStage(result);

    current = await this.runPlacesDetailEnrichmentStage(current, request);
    current = await this.runWebReputationEnrichmentStage(current);
    current = this.applyIdentityAndTradeClassification(current, request);
    current = await this.runGeminiReviewAnalysisStage(current);
    current = this.rankDecisionReadyProviders(current);

    return current;
  }

  private async runGeminiReviewAnalysisStage(
    result: ResearchResult
  ): Promise<ResearchResult> {
    if (result.status === "error" || result.providers.length === 0) {
      return this.appendStage(
        result,
        this.createStage(
          "gemini_review_analysis",
          "skipped",
          result.method === "kestra" ? "kestra" : "direct_gemini",
          result.providers.length,
          "Skipped Gemini review analysis because candidate discovery did not produce providers."
        )
      );
    }

    try {
      const analyzed = await this.reviewAnalysisService.analyzeProviders(
        result.providers,
      );

      const stageStatus =
        analyzed.stats.analyzedProviders > 0 ? "completed" : "skipped";

      return {
        ...result,
        providers: analyzed.providers,
        pipelineStages: [
          ...(result.pipelineStages ?? []),
          this.createStage(
            "gemini_review_analysis",
            stageStatus,
            "direct_gemini",
            analyzed.providers.length,
            analyzed.stats.analyzedProviders > 0
              ? `Gemini review analysis processed ${analyzed.stats.analyzedProviders} providers and skipped ${analyzed.stats.skippedProviders} providers with thin evidence.`
              : "Skipped Gemini review analysis because no providers had enough reputation evidence to analyze."
          ),
        ],
      };
    } catch (error) {
      this.logger.error(
        { error: serializeError(error) },
        "Gemini review analysis failed",
      );
      return this.appendStage(
        result,
        this.createStage(
          "gemini_review_analysis",
          "failed",
          "direct_gemini",
          result.providers.length,
          "Gemini review analysis failed, so the pipeline continued with deterministic provider-intel only.",
          error instanceof Error ? error.message : "Unknown review analysis error"
        )
      );
    }
  }

  private applyIdentityAndTradeClassification(
    result: ResearchResult,
    request: ResearchRequest
  ): ResearchResult {
    const providers = result.providers.map((provider) => {
      const { tradeClass, tradeFit } = classifyProviderTrade(
        provider,
        request.service,
      );
      const identityConfidence = inferIdentityConfidence(provider);

      const researchConfidence: ProviderIntelConfidence =
        tradeFit === "high" && identityConfidence === "high"
          ? "high"
          : tradeFit === "low" || identityConfidence === "low"
            ? "low"
            : "medium";

      return {
        ...provider,
        providerIntel: {
          ...provider.providerIntel,
          tradeClass,
          tradeFit,
          identityConfidence,
          researchConfidence,
        },
      };
    });

    return {
      ...result,
      providers,
    };
  }

  private rankDecisionReadyProviders(result: ResearchResult): ResearchResult {
    if (result.status === "error" || result.providers.length === 0) {
      return result;
    }

    const rankedProviders = [...result.providers].sort((left, right) => {
      const leftScore = this.calculateDecisionReadiness(left);
      const rightScore = this.calculateDecisionReadiness(right);

      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      return (right.reviewCount ?? 0) - (left.reviewCount ?? 0);
    });

    return {
      ...result,
      providers: rankedProviders,
    };
  }

  private calculateDecisionReadiness(
    provider: ResearchResult["providers"][number],
  ): number {
    let score = 0;

    score += (provider.rating ?? 0) * 20;
    score += Math.min(provider.reviewCount ?? 0, 100) / 2;

    if (provider.providerIntel?.tradeFit === "high") score += 20;
    if (provider.providerIntel?.tradeFit === "medium") score += 6;
    if (provider.providerIntel?.tradeFit === "low") score -= 20;

    if (provider.providerIntel?.identityConfidence === "high") score += 12;
    if (provider.providerIntel?.identityConfidence === "medium") score += 4;
    if (provider.providerIntel?.identityConfidence === "low") score -= 10;

    score +=
      Math.min(provider.providerIntel?.reputationSources?.length ?? 0, 3) * 4;
    score +=
      Math.min(provider.providerIntel?.positiveThemes?.length ?? 0, 3) * 3;
    score -=
      Math.min(provider.providerIntel?.negativeThemes?.length ?? 0, 3) * 6;
    score -=
      Math.min(provider.providerIntel?.contradictionNotes?.length ?? 0, 2) * 8;

    if ((provider.reviewCount ?? 0) < 3) {
      score -= 20;
    }

    return score;
  }

  private async runWebReputationEnrichmentStage(
    result: ResearchResult
  ): Promise<ResearchResult> {
    if (result.status === "error" || result.providers.length === 0) {
      return this.appendStage(
        result,
        this.createStage(
          "web_reputation_enrichment",
          "skipped",
          result.method === "kestra" ? "kestra" : "direct_gemini",
          result.providers.length,
          "Skipped web reputation enrichment because candidate discovery did not produce providers."
        )
      );
    }

    if (!this.webReputationSearchService.isAvailable()) {
      return this.appendStage(
        result,
        this.createStage(
          "web_reputation_enrichment",
          "skipped",
          result.method === "kestra" ? "kestra" : "direct_gemini",
          result.providers.length,
          "Skipped web reputation enrichment because no web-search provider API key is configured."
        )
      );
    }

    try {
      const enriched =
        await this.webReputationSearchService.enrichProviders(result.providers);

      return {
        ...result,
        providers: enriched.providers,
        pipelineStages: [
          ...(result.pipelineStages ?? []),
          this.createStage(
            "web_reputation_enrichment",
            "completed",
            "direct_gemini",
            enriched.providers.length,
            `Web reputation enrichment searched ${enriched.stats.searchedProviders} providers and found ${enriched.stats.totalSources} normalized reputation sources.`
          ),
        ],
      };
    } catch (error) {
      this.logger.error(
        { error: serializeError(error) },
        "Web reputation enrichment failed"
      );

      return this.appendStage(
        result,
        this.createStage(
          "web_reputation_enrichment",
          "failed",
          "direct_gemini",
          result.providers.length,
          "Web reputation enrichment failed, so the pipeline continued with Places-only provider evidence.",
          error instanceof Error ? error.message : "Unknown web search error"
        )
      );
    }
  }

  /**
   * Enrich provider results with additional details from Google Places API.
   * This is the explicit Places detail enrichment stage in the pipeline.
   */
  private async runPlacesDetailEnrichmentStage(
    result: ResearchResult,
    request: ResearchRequest
  ): Promise<ResearchResult> {
    // Skip if no providers or error
    if (result.status === "error" || result.providers.length === 0) {
      return this.appendStage(
        result,
        this.createStage(
          "places_detail_enrichment",
          "skipped",
          result.method === "kestra" ? "kestra" : "direct_gemini",
          result.providers.length,
          "Skipped Places detail enrichment because candidate discovery did not produce providers."
        )
      );
    }

    // Skip enrichment for Kestra results - they don't have placeId but already have phone data
    if (result.method === "kestra") {
      return this.appendStage(
        result,
        this.createStage(
          "places_detail_enrichment",
          "skipped",
          "kestra",
          result.providers.length,
          "Kestra results bypass Places detail enrichment because they arrive pre-shaped without Place IDs."
        )
      );
    }

    try {
      const enriched = await this.enrichmentService.enrich(result.providers, {
        coordinates: request.coordinates,
        requirePhone: request.requirePhone ?? true,
        minEnrichedResults: request.minEnrichedResults ?? 3,
        maxToEnrich: request.maxResults ?? 10,
      });

      return {
        ...result,
        providers: enriched.providers,
        filteredCount: enriched.providers.length,
        reasoning: `${result.reasoning || ""} | Enriched: ${enriched.stats.enrichedCount}, with phone: ${enriched.stats.withPhoneCount}`,
        pipelineStages: [
          ...(result.pipelineStages ?? []),
          this.createStage(
            "places_detail_enrichment",
            "completed",
            "google_places",
            enriched.providers.length,
            `Places detail enrichment enriched ${enriched.stats.enrichedCount} providers and found phones for ${enriched.stats.withPhoneCount}.`
          ),
        ],
      };
    } catch (error) {
      this.logger.error(
        { error: serializeError(error) },
        "Enrichment failed, returning unenriched results"
      );
      return this.appendStage(
        result,
        this.createStage(
          "places_detail_enrichment",
          "failed",
          "google_places",
          result.providers.length,
          "Places detail enrichment failed, so the pipeline returned discovery-only providers.",
          error instanceof Error ? error.message : "Unknown enrichment error"
        )
      );
    }
  }

  /**
   * Normalize phone numbers to E.164 format for VAPI compatibility
   * Converts formats like (864) 555-1234 to +18645551234
   */
  private normalizePhoneNumbers(result: ResearchResult): ResearchResult {
    const normalizedProviders = result.providers.map((provider) => ({
      ...provider,
      phone: normalizePhoneToE164(provider.phone) || provider.phone,
    }));

    return {
      ...result,
      providers: normalizedProviders,
    };
  }

  private ensureDiscoveryStage(result: ResearchResult): ResearchResult {
    if ((result.pipelineStages?.length ?? 0) > 0) {
      return result;
    }

    return this.appendStage(
      result,
      this.createStage(
        "candidate_discovery",
        result.status === "error" ? "failed" : "completed",
        result.method === "kestra" ? "kestra" : "direct_gemini",
        result.providers.length,
        result.status === "error"
          ? "Candidate discovery failed before the staged enrichment pipeline could run."
          : "Candidate discovery completed and handed providers to the staged enrichment pipeline.",
        result.error
      )
    );
  }

  private appendStage(
    result: ResearchResult,
    stage: ResearchPipelineStage
  ): ResearchResult {
    return {
      ...result,
      pipelineStages: [...(result.pipelineStages ?? []), stage],
    };
  }

  private createStage(
    name: ResearchPipelineStage["name"],
    status: ResearchPipelineStage["status"],
    method: ResearchPipelineStage["method"],
    providerCount: number,
    reasoning: string,
    error?: string
  ): ResearchPipelineStage {
    return {
      name,
      status,
      method,
      providerCount,
      reasoning,
      error,
    };
  }

  /**
   * Determine if Kestra should be used for research
   * NOTE: Kestra research is currently disabled - always use Direct Gemini API
   */
  async shouldUseKestra(): Promise<boolean> {
    // Kestra research disabled - always use Direct Gemini API
    // This bypasses all Kestra health checks and polling
    const kestraEnabled = process.env.KESTRA_ENABLED === "true";

    if (!kestraEnabled) {
      this.logger.debug({}, "Kestra disabled via KESTRA_ENABLED env var");
      return false;
    }

    // Check if Kestra URL is configured
    const kestraUrl = process.env.KESTRA_URL;
    if (!kestraUrl) {
      this.logger.debug({}, "Kestra URL not configured");
      return false;
    }

    // Check Kestra health
    try {
      const healthy = await this.kestraClient.healthCheck();
      this.logger.debug({ healthy }, "Kestra health check result");
      return healthy;
    } catch (error) {
      // STRICT MODE: Re-throw error so strict mode check can be triggered
      // This ensures KESTRA_ENABLED=true actually enforces Kestra usage
      this.logger.error({ error }, "Kestra health check failed");
      throw error;
    }
  }

  /**
   * Get system status for diagnostics
   * NOTE: Kestra research is disabled - always reports direct_gemini
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const geminiConfigured = !!process.env.GEMINI_API_KEY;

    // Kestra research is disabled - always use Direct Gemini
    return {
      kestraEnabled: false,
      kestraUrl: null,
      kestraHealthy: false,
      geminiConfigured,
      activeResearchMethod: "direct_gemini",
    };
  }
}
