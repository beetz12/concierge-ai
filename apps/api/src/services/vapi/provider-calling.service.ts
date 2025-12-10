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
        result = await this.kestraClient.triggerContactFlow(request);
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
   * Routes to Kestra or Direct VAPI based on configuration and availability
   */
  async callProvidersBatch(
    requests: CallRequest[],
    options?: { maxConcurrent?: number },
  ): Promise<ConcurrentCallResult> {
    // Validate input
    if (requests.length === 0) {
      throw new Error("No requests provided for batch calling");
    }

    const useKestra = await this.shouldUseKestra();

    this.logger.info(
      {
        method: useKestra ? "kestra" : "direct_vapi",
        providerCount: requests.length,
        maxConcurrent: options?.maxConcurrent,
      },
      "Initiating batch provider calls",
    );

    try {
      let results: CallResult[];

      if (useKestra) {
        // Use Kestra's concurrent flow
        // Use first request for shared config (all requests should have same service/location/urgency)
        const firstRequest = requests[0]!; // Safe due to validation above
        results = await this.kestraClient.triggerConcurrentContactFlow(
          requests.map((r) => ({ name: r.providerName, phone: r.providerPhone })),
          {
            serviceNeeded: firstRequest.serviceNeeded,
            userCriteria: firstRequest.userCriteria,
            location: firstRequest.location,
            urgency: firstRequest.urgency,
            maxConcurrent: options?.maxConcurrent,
          },
        );

        // Calculate stats for Kestra results
        const stats = {
          total: results.length,
          successful: results.filter((r) => r.status === "completed").length,
          failed: results.filter((r) => r.status === "error").length,
          timedOut: results.filter((r) => r.status === "timeout").length,
          durationMs: 0, // Kestra handles timing internally
        };

        this.logger.info(
          { stats, method: "kestra" },
          "Batch provider calls completed via Kestra",
        );

        return { results, stats };
      }

      // Fall back to direct concurrent calls
      const concurrentService = new ConcurrentCallService(this.logger);
      const result = await concurrentService.callAllProviders(requests, options);

      // Save all results to database
      await Promise.all(
        result.results.map((callResult, index) =>
          this.callResultService.saveCallResult(callResult, requests[index]!),
        ),
      );

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
