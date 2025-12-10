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
  type ConcurrentCallResult,
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
      this.logger.warn(
        {},
        "Kestra health check failed, falling back to direct VAPI",
      );
      return false;
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
  ): Promise<ConcurrentCallResult> {
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
        // Use Kestra's batch flow
        const result = await this.kestraClient.triggerContactFlow(requests, options);

        this.logger.info(
          { stats: (result as ConcurrentCallResult).stats, method: "kestra" },
          "Batch provider calls completed via Kestra",
        );

        return result as ConcurrentCallResult;
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
        })),
        serviceNeeded: firstRequest.serviceNeeded,
        userCriteria: firstRequest.userCriteria,
        location: firstRequest.location,
        urgency: firstRequest.urgency,
        serviceRequestId: firstRequest.serviceRequestId,
        maxConcurrent: options?.maxConcurrent,
      });

      // Convert BatchCallResult to ConcurrentCallResult
      const result: ConcurrentCallResult = {
        results: batchResult.results,
        stats: {
          total: batchResult.stats.total,
          successful: batchResult.stats.completed,
          failed: batchResult.stats.failed,
          timedOut: batchResult.stats.timeout,
          durationMs: batchResult.stats.duration,
        },
      };

      this.logger.info(
        { stats: result.stats, method: "direct_vapi" },
        "Batch provider calls completed via Direct VAPI",
      );

      return result;
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
