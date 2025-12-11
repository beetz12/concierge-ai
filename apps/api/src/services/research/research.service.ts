/**
 * Research Service
 * Main orchestrator for provider research
 * Routes between Kestra and Direct Gemini based on availability
 */

import { KestraResearchClient } from "./kestra-research.client.js";
import { DirectResearchClient } from "./direct-research.client.js";
import { ProviderEnrichmentService } from "./enrichment.service.js";
import type { ResearchRequest, ResearchResult, SystemStatus } from "./types.js";

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

  constructor(private logger: Logger) {
    this.kestraClient = new KestraResearchClient(logger);
    this.directClient = new DirectResearchClient(logger);
    this.enrichmentService = new ProviderEnrichmentService();
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
      "Starting provider research",
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
          "Using Direct Gemini for research",
        );
        result = await this.directClient.research(request);
      }
    } catch (error) {
      this.logger.error(
        { error, request },
        "Research failed, attempting fallback",
      );

      // Check if Kestra is explicitly enabled - if so, don't fall back
      const kestraEnabled = process.env.KESTRA_ENABLED === "true";
      const wasUsingKestra = await this.shouldUseKestra();

      if (kestraEnabled && wasUsingKestra) {
        this.logger.error(
          { error },
          "Kestra failed with KESTRA_ENABLED=true - not falling back to preserve error visibility",
        );
        throw error;
      }

      // If primary method fails, try the other one
      try {
        const useKestra = wasUsingKestra;  // Reuse the check we already did
        if (useKestra) {
          this.logger.warn({}, "Kestra failed, falling back to Direct Gemini");
          result = await this.directClient.research(request);
        } else {
          this.logger.warn(
            {},
            "Direct Gemini failed, attempting Kestra fallback",
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
          { error: fallbackError },
          "Fallback research also failed",
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

    // Enrich results with additional details (phone numbers, hours, etc.)
    if (result.status !== "error" && result.providers.length > 0) {
      result = await this.enrichResults(result, request);
    }

    return result;
  }

  /**
   * Enrich provider results with additional details from Google Places API
   */
  private async enrichResults(
    result: ResearchResult,
    request: ResearchRequest
  ): Promise<ResearchResult> {
    // Skip if no providers or error
    if (result.status === "error" || result.providers.length === 0) {
      return result;
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
        reasoning: `${result.reasoning || ''} | Enriched: ${enriched.stats.enrichedCount}, with phone: ${enriched.stats.withPhoneCount}`,
      };
    } catch (error) {
      this.logger.error(
        { error },
        "Enrichment failed, returning unenriched results"
      );
      return result;
    }
  }

  /**
   * Determine if Kestra should be used for research
   */
  async shouldUseKestra(): Promise<boolean> {
    // Check environment variable
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
      this.logger.debug({ error }, "Kestra health check failed");
      return false;
    }
  }

  /**
   * Get system status for diagnostics
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const kestraEnabled = process.env.KESTRA_ENABLED === "true";
    const kestraUrl = process.env.KESTRA_URL || null;
    const geminiConfigured = !!process.env.GEMINI_API_KEY;

    let kestraHealthy = false;
    if (kestraEnabled && kestraUrl) {
      try {
        kestraHealthy = await this.kestraClient.healthCheck();
      } catch (error) {
        this.logger.debug({ error }, "Health check failed during status check");
      }
    }

    const activeResearchMethod: "kestra" | "direct_gemini" =
      kestraEnabled && kestraHealthy ? "kestra" : "direct_gemini";

    return {
      kestraEnabled,
      kestraUrl,
      kestraHealthy,
      geminiConfigured,
      activeResearchMethod,
    };
  }
}
