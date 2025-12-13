/**
 * Research Service
 * Main orchestrator for provider research
 * Routes between Kestra and Direct Gemini based on availability
 */

import { KestraResearchClient } from "./kestra-research.client.js";
import { DirectResearchClient } from "./direct-research.client.js";
import { ProviderEnrichmentService } from "./enrichment.service.js";
import { normalizePhoneToE164 } from "../../utils/phone.js";
import { serializeError } from "../../utils/error.js";
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

    // Enrich results with additional details (phone numbers, hours, etc.)
    // Skip enrichment for Kestra results - they don't have placeId but already have phone data
    if (
      result.status !== "error" &&
      result.providers.length > 0 &&
      result.method !== "kestra"
    ) {
      result = await this.enrichResults(result, request);
    }

    // Normalize phone numbers to E.164 format for VAPI compatibility (applies to all methods)
    if (result.status !== "error") {
      result = this.normalizePhoneNumbers(result);
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
        reasoning: `${result.reasoning || ""} | Enriched: ${enriched.stats.enrichedCount}, with phone: ${enriched.stats.withPhoneCount}`,
      };
    } catch (error) {
      this.logger.error(
        { error: serializeError(error) },
        "Enrichment failed, returning unenriched results"
      );
      return result;
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
