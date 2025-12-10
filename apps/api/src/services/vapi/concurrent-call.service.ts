/**
 * Concurrent Call Service
 * Handles concurrent VAPI calls with batching and graceful failure handling
 * Used by both Direct VAPI and Kestra orchestration paths
 */

import { DirectVapiClient } from "./direct-vapi.client.js";
import { ProviderCallingService } from "./provider-calling.service.js";
import type { CallRequest, CallResult } from "./types.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface ConcurrentCallOptions {
  maxConcurrent?: number; // Default: from env or 5
  batchDelayMs?: number; // Delay between batches (default: 500ms)
  onCallComplete?: (result: CallResult, index: number) => void;
  onCallError?: (error: Error, request: CallRequest, index: number) => void;
}

export interface ConcurrentCallResult {
  results: CallResult[];
  stats: {
    total: number;
    successful: number;
    failed: number;
    timedOut: number;
    durationMs: number;
  };
}

// Batch call options for high-level API
export interface BatchCallOptions {
  providers: Array<{
    name: string;
    phone: string;
  }>;
  serviceNeeded: string;
  userCriteria: string;
  location: string;
  urgency: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
  serviceRequestId?: string;
  maxConcurrent?: number; // Default: 5
}

// Batch call result for high-level API
export interface BatchCallResult {
  success: boolean;
  results: CallResult[];
  stats: {
    total: number;
    completed: number;
    failed: number;
    timeout: number;
    noAnswer: number;
    voicemail: number;
    duration: number; // milliseconds
    averageCallDuration: number; // minutes
  };
  errors: Array<{
    provider: string;
    phone: string;
    error: string;
  }>;
}

export class ConcurrentCallService {
  private directClient: DirectVapiClient;
  private callingService: ProviderCallingService;
  private maxConcurrent: number;

  constructor(private logger: Logger) {
    this.directClient = new DirectVapiClient(logger);
    this.callingService = new ProviderCallingService(logger);
    this.maxConcurrent = parseInt(
      process.env.VAPI_MAX_CONCURRENT_CALLS || "5",
      10,
    );
  }

  /**
   * Execute multiple VAPI calls concurrently with batching
   * Uses Promise.allSettled for graceful partial failure handling
   */
  async callAllProviders(
    requests: CallRequest[],
    options: ConcurrentCallOptions = {},
  ): Promise<ConcurrentCallResult> {
    const {
      maxConcurrent = this.maxConcurrent,
      batchDelayMs = 500,
      onCallComplete,
      onCallError,
    } = options;

    const results: CallResult[] = [];
    const stats = {
      total: requests.length,
      successful: 0,
      failed: 0,
      timedOut: 0,
      durationMs: 0,
    };
    const startTime = Date.now();

    this.logger.info(
      {
        totalProviders: requests.length,
        maxConcurrent,
        estimatedBatches: Math.ceil(requests.length / maxConcurrent),
      },
      "Starting concurrent provider calls",
    );

    // Process in batches
    for (let i = 0; i < requests.length; i += maxConcurrent) {
      const batch = requests.slice(i, i + maxConcurrent);

      this.logger.info(
        {
          batchNumber: Math.floor(i / maxConcurrent) + 1,
          batchSize: batch.length,
          totalProviders: requests.length,
          progress: `${i + batch.length}/${requests.length}`,
        },
        "Starting concurrent call batch",
      );

      // Execute batch concurrently with Promise.allSettled
      const batchResults = await Promise.allSettled(
        batch.map(async (request, batchIndex) => {
          const globalIndex = i + batchIndex;
          try {
            this.logger.debug(
              {
                provider: request.providerName,
                phone: request.providerPhone,
                index: globalIndex,
              },
              "Initiating provider call",
            );

            const result = await this.directClient.initiateCall(request);

            onCallComplete?.(result, globalIndex);
            return result;
          } catch (error) {
            this.logger.error(
              {
                error,
                provider: request.providerName,
                index: globalIndex,
              },
              "Provider call failed in batch",
            );

            onCallError?.(error as Error, request, globalIndex);
            throw error;
          }
        }),
      );

      // Process batch results
      batchResults.forEach((result, batchIndex) => {
        const globalIndex = i + batchIndex;
        const request = batch[batchIndex]!; // Safe: batchResults.length === batch.length

        if (result.status === "fulfilled") {
          results.push(result.value);

          // Update stats based on call result status
          if (result.value.status === "completed") {
            stats.successful++;
          } else if (result.value.status === "timeout") {
            stats.timedOut++;
          } else {
            stats.failed++;
          }

          this.logger.debug(
            {
              provider: request.providerName,
              status: result.value.status,
              index: globalIndex,
            },
            "Call completed successfully",
          );
        } else {
          stats.failed++;

          // Create error result for failed calls
          const errorResult: CallResult = {
            status: "error",
            callId: `error-${Date.now()}-${globalIndex}`,
            callMethod: "direct_vapi",
            duration: 0,
            endedReason: result.reason?.message || "Unknown error",
            transcript: "",
            analysis: {
              summary: `Call failed: ${result.reason?.message || "Unknown error"}`,
              structuredData: {
                availability: "unavailable",
                estimated_rate: "unknown",
                single_person_found: false,
                all_criteria_met: false,
                call_outcome: "negative",
                recommended: false,
                disqualified: true,
                disqualification_reason: result.reason?.message || "Call failed",
              },
              successEvaluation: "false",
            },
            provider: {
              name: request.providerName,
              phone: request.providerPhone,
              service: request.serviceNeeded,
              location: request.location,
            },
            request: {
              criteria: request.userCriteria,
              urgency: request.urgency,
            },
            error: result.reason?.message || "Unknown error",
          };

          results.push(errorResult);

          this.logger.warn(
            {
              provider: request.providerName,
              error: result.reason?.message,
              index: globalIndex,
            },
            "Call promise rejected, created error result",
          );
        }
      });

      // Add delay between batches (except for last batch)
      if (i + maxConcurrent < requests.length) {
        this.logger.debug(
          { delayMs: batchDelayMs },
          "Waiting between batches",
        );
        await new Promise((r) => setTimeout(r, batchDelayMs));
      }
    }

    stats.durationMs = Date.now() - startTime;

    this.logger.info(
      {
        stats,
        averageCallDurationMs:
          stats.total > 0 ? stats.durationMs / stats.total : 0,
      },
      "Concurrent calls completed",
    );

    return { results, stats };
  }

  /**
   * High-level batch calling API - calls multiple providers concurrently
   * Uses ProviderCallingService which handles Kestra/Direct VAPI routing automatically
   *
   * @param options - Batch call options including providers and service details
   * @returns Batch call result with detailed stats and error tracking
   */
  async callProvidersBatch(
    options: BatchCallOptions,
  ): Promise<BatchCallResult> {
    const startTime = Date.now();
    const maxConcurrent = options.maxConcurrent || 5;

    this.logger.info(
      {
        totalProviders: options.providers.length,
        maxConcurrent,
        service: options.serviceNeeded,
        location: options.location,
        urgency: options.urgency,
      },
      "Starting batch provider calls",
    );

    const results: CallResult[] = [];
    const errors: Array<{ provider: string; phone: string; error: string }> =
      [];

    // Create call requests for all providers
    const requests: CallRequest[] = options.providers.map((provider) => ({
      providerName: provider.name,
      providerPhone: provider.phone,
      serviceNeeded: options.serviceNeeded,
      userCriteria: options.userCriteria,
      location: options.location,
      urgency: options.urgency,
      serviceRequestId: options.serviceRequestId,
    }));

    // Process requests in batches with controlled concurrency
    for (let i = 0; i < requests.length; i += maxConcurrent) {
      const batch = requests.slice(i, i + maxConcurrent);
      const batchNumber = Math.floor(i / maxConcurrent) + 1;
      const totalBatches = Math.ceil(requests.length / maxConcurrent);

      this.logger.info(
        {
          batch: batchNumber,
          totalBatches,
          batchSize: batch.length,
          progress: `${i + batch.length}/${requests.length}`,
        },
        `Processing batch ${batchNumber}/${totalBatches}`,
      );

      // Execute batch concurrently using Promise.allSettled for graceful error handling
      const batchPromises = batch.map(async (request) => {
        try {
          const result = await this.callingService.callProvider(request);
          return { success: true, result };
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          return {
            success: false,
            error: {
              provider: request.providerName,
              phone: request.providerPhone,
              message: errorMessage,
            },
          };
        }
      });

      // Wait for batch to complete
      const batchResults = await Promise.allSettled(batchPromises);

      // Process batch results
      for (const settledResult of batchResults) {
        if (settledResult.status === "fulfilled") {
          const { success, result, error } = settledResult.value;

          if (success && result) {
            results.push(result);
            this.logger.debug(
              {
                provider: result.provider.name,
                status: result.status,
                duration: result.duration,
              },
              "Provider call completed",
            );
          } else if (error) {
            errors.push({
              provider: error.provider,
              phone: error.phone,
              error: error.message,
            });
            this.logger.error(
              {
                provider: error.provider,
                phone: error.phone,
                error: error.message,
              },
              "Provider call failed",
            );
          }
        } else {
          // Promise itself rejected (shouldn't happen with try-catch, but handle it)
          this.logger.error(
            { reason: settledResult.reason },
            "Batch promise rejected unexpectedly",
          );
        }
      }

      // Add delay between batches (except for the last batch)
      if (i + maxConcurrent < requests.length) {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // Calculate statistics
    const stats = this.calculateBatchStats(results, startTime);

    this.logger.info(
      {
        ...stats,
        errorCount: errors.length,
        durationSeconds: (stats.duration / 1000).toFixed(2),
      },
      "Batch provider calls completed",
    );

    return {
      success: errors.length < options.providers.length,
      results,
      stats,
      errors,
    };
  }

  /**
   * Calculate detailed statistics from batch call results
   */
  private calculateBatchStats(
    results: CallResult[],
    startTime: number,
  ): BatchCallResult["stats"] {
    const completed = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status === "error").length;
    const timeout = results.filter((r) => r.status === "timeout").length;
    const noAnswer = results.filter((r) => r.status === "no_answer").length;
    const voicemail = results.filter((r) => r.status === "voicemail").length;

    const totalCallDuration = results.reduce((sum, r) => sum + r.duration, 0);
    const averageCallDuration =
      results.length > 0 ? totalCallDuration / results.length : 0;

    return {
      total: results.length,
      completed,
      failed,
      timeout,
      noAnswer,
      voicemail,
      duration: Date.now() - startTime,
      averageCallDuration,
    };
  }
}
