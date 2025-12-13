/**
 * Provider Calling Service
 * Main orchestrator for provider phone calls
 * Automatically routes between Kestra and Direct VAPI based on availability
 */

import { KestraClient } from "./kestra.client.js";
import { DirectVapiClient } from "./direct-vapi.client.js";
import { CallResultService } from "./call-result.service.js";
import {
  ConcurrentCallService,
  type BatchCallResult,
} from "./concurrent-call.service.js";
import type { CallRequest, CallResult } from "./types.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export class ProviderCallingService {
  private kestraClient: KestraClient;
  private directVapiClient: DirectVapiClient;
  private callResultService: CallResultService;

  constructor(private logger: Logger) {
    this.kestraClient = new KestraClient(logger);
    this.directVapiClient = new DirectVapiClient(logger);
    this.callResultService = new CallResultService(logger);
  }

  /**
   * Call a service provider
   * Automatically routes to Kestra or Direct VAPI based on configuration and availability
   */
  async callProvider(request: CallRequest): Promise<CallResult> {
    const useKestra = await this.shouldUseKestra();

    this.logger.info(
      {
        method: useKestra ? "kestra" : "direct_vapi",
        provider: request.providerName,
        phone: request.providerPhone,
        service: request.serviceNeeded,
        location: request.location,
      },
      "Initiating provider call",
    );

    let result: CallResult;

    try {
      if (useKestra) {
        // For single provider, triggerContactFlow returns CallResult
        result = await this.kestraClient.triggerContactFlow(request) as CallResult;
      } else {
        result = await this.directVapiClient.initiateCall(request);
      }

      // Save results to database
      // Database unique constraint on call_id handles deduplication atomically
      // Safe to call even if webhook already saved - ON CONFLICT DO NOTHING
      await this.callResultService.saveCallResult(result, request);

      this.logger.info(
        {
          callId: result.callId,
          status: result.status,
          method: result.callMethod,
          duration: result.duration,
        },
        "Provider call completed",
      );

      return result;
    } catch (error) {
      this.logger.error(
        {
          error,
          provider: request.providerName,
          method: useKestra ? "kestra" : "direct_vapi",
        },
        "Provider call failed",
      );

      throw error;
    }
  }

  /**
   * Determine whether to use Kestra or Direct VAPI
   * Checks environment variable and performs health check if needed
   */
  private async shouldUseKestra(): Promise<boolean> {
    const kestraEnabled = process.env.KESTRA_ENABLED === "true";

    if (!kestraEnabled) {
      this.logger.info({}, "Kestra disabled via env var, using direct VAPI");
      return false;
    }

    // Perform health check
    const isHealthy = await this.kestraClient.healthCheck();

    if (!isHealthy) {
      // STRICT MODE: If Kestra explicitly enabled but unhealthy, throw error
      // This ensures infrastructure issues are surfaced, not masked by fallback
      this.logger.error(
        {},
        "Kestra health check failed with KESTRA_ENABLED=true - not falling back",
      );
      throw new Error("Kestra explicitly enabled (KESTRA_ENABLED=true) but health check failed. Fix Kestra or set KESTRA_ENABLED=false to use direct VAPI.");
    }

    this.logger.debug({}, "Kestra available, will use Kestra flow");
    return true;
  }

  /**
   * Call multiple providers concurrently
   * Makes a SINGLE routing decision at the start (Kestra vs Direct VAPI)
   * All requests in the batch are processed using the same method
   */
  async callProvidersBatch(
    requests: CallRequest[],
    options?: { maxConcurrent?: number },
  ): Promise<BatchCallResult> {
    // Validate input
    if (requests.length === 0) {
      throw new Error("No requests provided for batch calling");
    }

    // Single routing decision for entire batch
    const useKestra = await this.shouldUseKestra();

    this.logger.info(
      {
        method: useKestra ? "kestra" : "direct_vapi",
        providerCount: requests.length,
        maxConcurrent: options?.maxConcurrent,
      },
      "Initiating batch provider calls (single routing decision)",
    );

    try {
      if (useKestra) {
        // Use Kestra's batch flow - returns ConcurrentCallResult, needs transformation
        const kestraResult = await this.kestraClient.triggerContactFlow(requests, options);

        // Transform ConcurrentCallResult to BatchCallResult format
        // ConcurrentCallResult has stats: { total, successful, failed, timedOut, durationMs }
        // BatchCallResult needs: { total, completed, failed, timeout, noAnswer, voicemail, duration, averageCallDuration }
        const concurrentResult = kestraResult as {
          results: CallResult[];
          stats: { total: number; successful: number; failed: number; timedOut: number; durationMs: number };
          resultsInDatabase?: boolean; // Flag indicating results are saved via callback to database
        };

        // Check if results are in database (Kestra script saved them via callback)
        // In this case, results array is empty but execution was successful
        if (concurrentResult.resultsInDatabase) {
          this.logger.info(
            {
              method: "kestra",
              providerCount: requests.length,
              resultsInDatabase: true,
            },
            "Kestra batch completed - results saved directly to database via callback",
          );

          // Return success - results are already in database
          // The frontend will get updates via real-time subscriptions
          return {
            success: true,
            results: [], // Empty - actual results are in database
            stats: {
              total: requests.length,
              completed: requests.length,
              failed: 0,
              timeout: 0,
              noAnswer: 0,
              voicemail: 0,
              duration: 0,
              averageCallDuration: 0,
            },
            errors: [],
            resultsInDatabase: true, // Pass flag to caller
          } as BatchCallResult & { resultsInDatabase?: boolean };
        }

        const totalCallDuration = concurrentResult.results.reduce((sum, r) => sum + r.duration, 0);

        const batchResult: BatchCallResult = {
          success: concurrentResult.stats.failed < concurrentResult.stats.total,
          results: concurrentResult.results,
          stats: {
            total: concurrentResult.stats.total,
            completed: concurrentResult.stats.successful,
            failed: concurrentResult.stats.failed,
            timeout: concurrentResult.stats.timedOut,
            noAnswer: concurrentResult.results.filter(r => r.status === "no_answer").length,
            voicemail: concurrentResult.results.filter(r => r.status === "voicemail").length,
            duration: concurrentResult.stats.durationMs,
            averageCallDuration: concurrentResult.results.length > 0 ? totalCallDuration / concurrentResult.results.length : 0,
          },
          errors: [],
        };

        this.logger.info(
          { stats: batchResult.stats, method: "kestra" },
          "Batch provider calls completed via Kestra",
        );

        // CRITICAL: If ALL calls failed, throw to trigger error handler in routes/providers.ts
        // This ensures the database status gets updated to FAILED
        if (!batchResult.success && batchResult.stats.failed === batchResult.stats.total) {
          const errorMsg = batchResult.results[0]?.error || 'All provider calls failed';
          this.logger.error(
            {
              stats: batchResult.stats,
              firstError: errorMsg,
              method: "kestra"
            },
            "Kestra batch execution completely failed - throwing to trigger error handler",
          );
          throw new Error(`Kestra batch execution failed: ${errorMsg}`);
        }

        return batchResult;
      }

      // Use Direct VAPI batch processing via callProvidersBatch()
      const concurrentService = new ConcurrentCallService(this.logger);

      // Extract common parameters from first request
      // Note: All requests in a batch should have the same service details
      const firstRequest = requests[0]!;

      const batchResult = await concurrentService.callProvidersBatch({
        providers: requests.map(req => ({
          name: req.providerName,
          phone: req.providerPhone,
          id: req.providerId, // Pass through provider ID for database linking
        })),
        serviceNeeded: firstRequest.serviceNeeded,
        userCriteria: firstRequest.userCriteria,
        problemDescription: firstRequest.problemDescription, // Pass through problem description
        clientName: firstRequest.clientName, // Pass through client name
        location: firstRequest.location,
        urgency: firstRequest.urgency,
        serviceRequestId: firstRequest.serviceRequestId,
        maxConcurrent: options?.maxConcurrent,
        customPrompt: firstRequest.customPrompt, // Pass through custom prompt
      });

      this.logger.info(
        { stats: batchResult.stats, method: "direct_vapi" },
        "Batch provider calls completed via Direct VAPI",
      );

      // Direct VAPI saves results to DB via ConcurrentCallService
      // Set resultsInDatabase flag to trigger recommendation generation in batch-call-async
      return {
        ...batchResult,
        resultsInDatabase: true,
      } as BatchCallResult & { resultsInDatabase?: boolean };
    } catch (error) {
      this.logger.error(
        {
          error,
          providerCount: requests.length,
          method: useKestra ? "kestra" : "direct_vapi",
        },
        "Batch provider calls failed",
      );

      throw error;
    }
  }

  /**
   * Get the current system status
   * Returns information about which method is active
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const kestraEnabled = process.env.KESTRA_ENABLED === "true";
    const kestraUrl = process.env.KESTRA_URL || "not configured";
    const vapiConfigured = !!(
      process.env.VAPI_API_KEY && process.env.VAPI_PHONE_NUMBER_ID
    );

    let kestraHealthy = false;
    if (kestraEnabled) {
      kestraHealthy = await this.kestraClient.healthCheck();
    }

    return {
      kestraEnabled,
      kestraUrl: kestraEnabled ? kestraUrl : null,
      kestraHealthy,
      vapiConfigured,
      fallbackAvailable: vapiConfigured,
      activeMethod: kestraEnabled && kestraHealthy ? "kestra" : "direct_vapi",
    };
  }
}

export interface SystemStatus {
  kestraEnabled: boolean;
  kestraUrl: string | null;
  kestraHealthy: boolean;
  vapiConfigured: boolean;
  fallbackAvailable: boolean;
  activeMethod: "kestra" | "direct_vapi";
}
