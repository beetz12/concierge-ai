/**
 * Concurrent Call Service
 * Handles concurrent VAPI calls with batching and graceful failure handling
 * Uses Direct VAPI client for actual call execution
 */

import { DirectVapiClient } from "./direct-vapi.client.js";
import { CallResultService } from "./call-result.service.js";
import type { CallRequest, CallResult, GeneratedPrompt } from "./types.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

// Batch call options for high-level API
export interface BatchCallOptions {
  providers: Array<{
    name: string;
    phone: string;
    id?: string; // Provider database ID for linking call results
  }>;
  serviceNeeded: string;
  userCriteria: string;
  problemDescription?: string; // Detailed problem description
  clientName?: string; // Client's name for personalized greeting
  location: string;
  urgency: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
  serviceRequestId?: string;
  maxConcurrent?: number; // Default: 5
  customPrompt?: GeneratedPrompt; // Gemini-generated dynamic prompt for Direct Tasks
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

// Low-level concurrent call result (used internally)
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

export class ConcurrentCallService {
  private directClient: DirectVapiClient;
  private callResultService: CallResultService;

  constructor(private logger: Logger) {
    this.directClient = new DirectVapiClient(logger);
    this.callResultService = new CallResultService(logger);
  }

  /**
   * High-level batch calling API - calls multiple providers concurrently
   * Uses DirectVapiClient for actual call execution
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

    // Create call requests for all providers with all fields
    const requests: CallRequest[] = options.providers.map((provider) => ({
      providerName: provider.name,
      providerPhone: provider.phone,
      providerId: provider.id, // Pass through provider ID for database linking
      serviceNeeded: options.serviceNeeded,
      userCriteria: options.userCriteria,
      problemDescription: options.problemDescription, // Pass through problem description
      clientName: options.clientName, // Pass through client name
      location: options.location,
      urgency: options.urgency,
      serviceRequestId: options.serviceRequestId,
      customPrompt: options.customPrompt, // Pass through custom prompt for Direct Tasks
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
          const result = await this.directClient.initiateCall(request);

          // Save result to database (handles deduplication via ON CONFLICT)
          // Critical: This ensures call results are persisted even when webhooks fail
          await this.callResultService.saveCallResult(result, request);

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
            // Check if the result indicates an API/validation error (not a call outcome)
            if (result.status === "error" && (!result.callId || result.callId === "")) {
              // This is an API error (e.g., VAPI validation failed), not a completed call
              errors.push({
                provider: result.provider?.name || "Unknown",
                phone: result.provider?.phone || "Unknown",
                error: result.error || result.endedReason || "VAPI API error",
              });
              this.logger.error(
                {
                  provider: result.provider?.name,
                  error: result.error || result.endedReason,
                },
                "VAPI API error - call never initiated",
              );
            } else {
              // Normal call result (completed, no_answer, voicemail, etc.)
              results.push(result);
              this.logger.debug(
                {
                  provider: result.provider.name,
                  status: result.status,
                  duration: result.duration,
                },
                "Provider call completed",
              );
            }
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
