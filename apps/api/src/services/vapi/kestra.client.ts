/**
 * Kestra Client
 * Triggers Kestra workflows for provider calling
 * Used when Kestra is available (local/staging environments)
 */

import axios from "axios";
import type {
  CallRequest,
  CallResult,
  KestraExecutionStatus,
  StructuredCallData,
} from "./types.js";
import type { ConcurrentCallResult } from "./concurrent-call.service.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export class KestraClient {
  private baseUrl: string;
  private namespace: string;
  private flowId = "contact_providers";
  private tenant: string | null;
  private apiToken: string | null;
  private isCloudMode: boolean;

  constructor(private logger: Logger) {
    const mode = process.env.KESTRA_MODE || "local";
    this.isCloudMode = mode === "cloud";

    if (this.isCloudMode) {
      this.baseUrl = process.env.KESTRA_CLOUD_URL || "";
      this.tenant = process.env.KESTRA_CLOUD_TENANT || "main";
      this.apiToken = process.env.KESTRA_API_TOKEN || "";
    } else {
      this.baseUrl = process.env.KESTRA_LOCAL_URL || "http://localhost:8082";
      this.tenant = null;
      this.apiToken = null;
    }

    this.namespace = process.env.KESTRA_NAMESPACE || "ai_concierge";
  }

  /**
   * Build execution URL with tenant segment for cloud mode
   */
  private buildExecutionUrl(flowId: string): string {
    if (this.tenant) {
      return `${this.baseUrl}/api/v1/${this.tenant}/executions/${this.namespace}/${flowId}`;
    }
    return `${this.baseUrl}/api/v1/executions/${this.namespace}/${flowId}`;
  }

  /**
   * Build status URL with tenant segment for cloud mode
   */
  private buildStatusUrl(executionId: string): string {
    if (this.tenant) {
      return `${this.baseUrl}/api/v1/${this.tenant}/executions/${executionId}`;
    }
    return `${this.baseUrl}/api/v1/executions/${executionId}`;
  }

  /**
   * Build request headers with auth for cloud mode (Bearer) or local mode (Basic)
   */
  private buildHeaders(isFormData: boolean = false): Record<string, string> {
    const headers: Record<string, string> = {};

    if (this.apiToken) {
      // Cloud mode: Bearer token
      headers["Authorization"] = `Bearer ${this.apiToken}`;
    } else if (!this.isCloudMode && process.env.KESTRA_LOCAL_USERNAME) {
      // Local mode: Basic auth (if credentials provided)
      const username = process.env.KESTRA_LOCAL_USERNAME;
      const password = process.env.KESTRA_LOCAL_PASSWORD || "";
      const credentials = Buffer.from(`${username}:${password}`).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
    }

    if (!isFormData) {
      headers["Content-Type"] = "application/json";
    }

    return headers;
  }

  /**
   * Build request body - FormData for both cloud and local modes
   * Kestra execution API requires multipart/form-data, not JSON
   * Objects and arrays are JSON stringified, primitives are converted to strings
   */
  private buildRequestBody(inputs: Record<string, unknown>): FormData {
    const formData = new FormData();
    Object.entries(inputs).forEach(([key, value]) => {
      // Handle objects/arrays by JSON stringifying, primitives as-is
      if (typeof value === "object" && value !== null) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, String(value));
      }
    });
    return formData;
  }

  /**
   * Check if Kestra is healthy and available
   */
  async healthCheck(): Promise<boolean> {
    try {
      const timeout = parseInt(
        process.env.KESTRA_HEALTH_CHECK_TIMEOUT || "3000",
        10,
      );
      // Use /api/v1/configs as health check - /api/v1/health doesn't exist in local Kestra
      const response = await axios.get(`${this.baseUrl}/api/v1/configs`, {
        timeout,
        headers: this.buildHeaders(),
      });
      return response.status === 200;
    } catch (error) {
      this.logger.error({ error }, "Kestra health check failed");
      return false;
    }
  }

  /**
   * Trigger the contact_providers flow and wait for completion
   * Handles both single provider and array of providers
   */
  async triggerContactFlow(
    request: CallRequest | CallRequest[],
    options?: { maxConcurrent?: number }
  ): Promise<CallResult | ConcurrentCallResult> {
    // Handle array input - use concurrent flow
    if (Array.isArray(request)) {
      return this.triggerBatchContactFlow(request, options);
    }

    // Handle single provider
    this.logger.info(
      {
        provider: request.providerName,
        phone: request.providerPhone,
        flowId: this.flowId,
      },
      "Triggering Kestra contact flow (single provider)",
    );

    try {
      // Trigger execution
      const execution = await this.triggerExecution(request);

      // Poll for completion
      const finalState = await this.pollExecution(execution.id);

      // Parse results
      return this.parseExecutionResult(finalState, request);
    } catch (error) {
      this.logger.error(
        { error, provider: request.providerName },
        "Kestra flow failed",
      );
      // Throw to surface error when KESTRA_ENABLED=true - don't mask as CallResult
      throw error;
    }
  }

  /**
   * Trigger Kestra execution with flow inputs
   */
  private async triggerExecution(
    request: CallRequest,
  ): Promise<{ id: string }> {
    const inputs = {
      provider_name: request.providerName,
      provider_phone: request.providerPhone,
      service_needed: request.serviceNeeded,
      user_criteria: request.userCriteria,
      location: request.location,
      urgency: request.urgency,
    };

    const url = this.buildExecutionUrl(this.flowId);
    const body = this.buildRequestBody(inputs);
    // Always use FormData headers - Kestra execution API requires multipart/form-data
    const headers = this.buildHeaders(true);

    const response = await axios.post(url, body, { headers });

    this.logger.info(
      {
        executionId: response.data.id,
        namespace: this.namespace,
        flowId: this.flowId,
      },
      "Kestra execution triggered",
    );

    return { id: response.data.id };
  }

  /**
   * Poll Kestra execution for completion
   * Checks every 5 seconds for up to 6 minutes
   */
  private async pollExecution(
    executionId: string,
  ): Promise<KestraExecutionStatus> {
    const maxAttempts = 72; // 6 minutes (72 * 5 seconds)
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.getExecutionStatus(executionId);

      this.logger.debug(
        {
          executionId,
          state: status.state.current,
          attempt: attempts + 1,
          maxAttempts,
        },
        "Polling Kestra execution",
      );

      if (["SUCCESS", "FAILED", "KILLED"].includes(status.state.current)) {
        return status;
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error(
      `Kestra execution ${executionId} timed out after ${maxAttempts * 5} seconds`,
    );
  }

  /**
   * Get current execution status from Kestra
   */
  private async getExecutionStatus(
    executionId: string,
  ): Promise<KestraExecutionStatus> {
    const response = await axios.get(
      this.buildStatusUrl(executionId),
      { headers: this.buildHeaders() }
    );
    return response.data;
  }

  /**
   * Parse Kestra execution result into CallResult format
   */
  private parseExecutionResult(
    state: KestraExecutionStatus,
    request: CallRequest,
  ): CallResult {
    // Kestra outputs are in state.outputs.call_result (from flow output)
    const rawOutput = state.outputs?.call_result;

    if (!rawOutput || state.state.current !== "SUCCESS") {
      return {
        status: state.state.current === "SUCCESS" ? "error" : "error",
        callId: state.id,
        callMethod: "kestra",
        duration: 0,
        endedReason:
          state.state.current === "SUCCESS" ? "no_output" : state.state.current.toLowerCase(),
        transcript: "",
        analysis: {
          summary: "",
          structuredData: {} as StructuredCallData,
          successEvaluation: "",
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
        error:
          state.state.current !== "SUCCESS"
            ? `Kestra execution ${state.state.current.toLowerCase()}`
            : "No output from Kestra execution",
      };
    }

    // Parse the JSON output from call-provider.js
    const parsed =
      typeof rawOutput === "string" ? JSON.parse(rawOutput) : rawOutput;

    // Merge parsed result with kestra method identifier
    return {
      ...parsed,
      callMethod: "kestra" as const,
    };
  }

  /**
   * Trigger batch contact flow for multiple providers
   * Uses the unified Kestra flow with concurrent processing
   */
  private async triggerBatchContactFlow(
    requests: CallRequest[],
    options?: { maxConcurrent?: number }
  ): Promise<ConcurrentCallResult> {
    if (requests.length === 0) {
      throw new Error("No requests provided for batch calling");
    }

    // Use first request for shared config (all requests should have same service/location/urgency)
    const firstRequest = requests[0]!;

    this.logger.info(
      {
        providerCount: requests.length,
        flowId: this.flowId,
        maxConcurrent: options?.maxConcurrent || 5,
      },
      "Triggering Kestra batch contact flow",
    );

    try {
      // Prepare inputs for unified Kestra flow
      const providers = requests.map((r) => ({
        name: r.providerName,
        phone: r.providerPhone,
        id: r.providerId,  // ADD THIS for database linking
      }));

      const inputs = {
        providers: providers,  // buildRequestBody handles JSON stringification
        service_needed: firstRequest.serviceNeeded,
        user_criteria: firstRequest.userCriteria,
        location: firstRequest.location,
        urgency: firstRequest.urgency,
        max_concurrent: options?.maxConcurrent || 5,
        service_request_id: firstRequest.serviceRequestId,  // ADD THIS for tracking
      };

      // Trigger execution
      const execution = await this.triggerConcurrentExecution(inputs);

      // Poll for completion
      const finalState = await this.pollExecution(execution.id);

      // Parse and return results
      return this.parseConcurrentExecutionResults(
        finalState,
        requests,
      );
    } catch (error) {
      this.logger.error(
        { error, providerCount: requests.length },
        "Kestra batch flow failed",
      );
      // Throw to surface error when KESTRA_ENABLED=true - don't mask as batch result
      throw error;
    }
  }

  /**
   * Trigger concurrent Kestra execution with flow inputs
   * Uses the unified flow (contact_providers) with concurrent processing
   */
  private async triggerConcurrentExecution(
    inputs: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const url = this.buildExecutionUrl(this.flowId);
    const body = this.buildRequestBody(inputs);
    // Always use FormData headers - Kestra execution API requires multipart/form-data
    const headers = this.buildHeaders(true);

    const response = await axios.post(url, body, { headers });

    this.logger.info(
      {
        executionId: response.data.id,
        namespace: this.namespace,
        flowId: this.flowId,
      },
      "Kestra concurrent execution triggered",
    );

    return { id: response.data.id };
  }

  /**
   * Parse concurrent execution results from Kestra
   * Expects output format: { results: CallResult[] } or { call_results: CallResult[] }
   */
  private parseConcurrentExecutionResults(
    state: KestraExecutionStatus,
    requests: CallRequest[],
  ): ConcurrentCallResult {
    if (state.state.current !== "SUCCESS") {
      this.logger.error(
        { state: state.state.current, executionId: state.id },
        "Kestra batch execution failed",
      );

      // Return error results for all providers
      const errorResults = requests.map((request) =>
        this.createErrorResult(
          new Error(`Kestra execution ${state.state.current.toLowerCase()}`),
          request,
          "kestra"
        )
      );

      return {
        results: errorResults,
        stats: {
          total: requests.length,
          successful: 0,
          failed: requests.length,
          timedOut: 0,
          durationMs: 0,
        },
      };
    }

    // Try to extract results from different possible output keys
    const rawOutput =
      state.outputs?.call_results || state.outputs?.results;

    if (!rawOutput) {
      this.logger.warn(
        { executionId: state.id },
        "No results found in Kestra batch execution output",
      );

      // Return error results
      const errorResults = requests.map((request) =>
        this.createErrorResult(
          new Error("No output from Kestra execution"),
          request,
          "kestra"
        )
      );

      return {
        results: errorResults,
        stats: {
          total: requests.length,
          successful: 0,
          failed: requests.length,
          timedOut: 0,
          durationMs: 0,
        },
      };
    }

    // Parse the results
    const results: CallResult[] =
      typeof rawOutput === "string" ? JSON.parse(rawOutput) : rawOutput;

    // Ensure all results have kestra method identifier
    const callResults = results.map((result) => ({
      ...result,
      callMethod: "kestra" as const,
    }));

    // Calculate stats
    const stats = {
      total: callResults.length,
      successful: callResults.filter((r) => r.status === "completed").length,
      failed: callResults.filter((r) => r.status === "error").length,
      timedOut: callResults.filter((r) => r.status === "timeout").length,
      durationMs: 0, // Kestra handles timing internally
    };

    return {
      results: callResults,
      stats,
    };
  }

  /**
   * Create an error result when call fails
   * Shared utility for consistent error handling
   */
  private createErrorResult(
    error: unknown,
    request: CallRequest,
    callMethod: "kestra" | "direct_vapi"
  ): CallResult {
    return {
      status: "error",
      callId: "",
      callMethod,
      duration: 0,
      endedReason: "kestra_error",
      transcript: "",
      analysis: {
        summary: "",
        structuredData: {
          availability: "unavailable",
          estimated_rate: "unknown",
          single_person_found: false,
          all_criteria_met: false,
          call_outcome: "negative",
          recommended: false,
          disqualified: true,
          disqualification_reason: error instanceof Error ? error.message : "Unknown error",
        },
        successEvaluation: "",
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
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }

  /**
   * Trigger the notify_user flow to send SMS notification
   */
  async triggerNotifyUserFlow(request: {
    userPhone: string;
    userName?: string;
    requestUrl?: string;
    providers: Array<{ name: string; earliestAvailability: string }>;
  }): Promise<{ success: boolean; executionId?: string; error?: string }> {
    this.logger.info(
      {
        userPhone: request.userPhone,
        providerCount: request.providers.length,
        flowId: "notify_user",
      },
      "Triggering Kestra notify_user flow",
    );

    try {
      const inputs = {
        user_phone: request.userPhone,
        user_name: request.userName || "Customer",
        request_url: request.requestUrl || "",
        providers: request.providers,  // buildRequestBody handles JSON stringification
      };

      // Use FormData - Kestra execution API requires multipart/form-data
      const formData = this.buildRequestBody(inputs);
      const response = await axios.post(
        `${this.baseUrl}/api/v1/executions/${this.namespace}/notify_user`,
        formData,
        {
          headers: this.buildHeaders(true),
        },
      );

      this.logger.info(
        {
          executionId: response.data.id,
          namespace: this.namespace,
          flowId: "notify_user",
        },
        "Kestra notify_user execution triggered",
      );

      // Poll for completion (shorter timeout for notifications - 30 seconds)
      const finalState = await this.pollExecutionWithTimeout(response.data.id, 30000);

      return {
        success: finalState.state.current === "SUCCESS",
        executionId: response.data.id,
        error: finalState.state.current !== "SUCCESS" ? `Execution ${finalState.state.current.toLowerCase()}` : undefined,
      };
    } catch (error) {
      this.logger.error({ error }, "Kestra notify_user flow failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Trigger the schedule_service flow to make booking call
   */
  async triggerScheduleServiceFlow(request: {
    providerPhone: string;
    providerName?: string;
    serviceDescription?: string;
    preferredDate?: string;
    preferredTime?: string;
    customerName?: string;
    customerPhone?: string;
    location?: string;
    serviceRequestId?: string;
    providerId?: string;
  }): Promise<{ success: boolean; executionId?: string; bookingStatus?: string; error?: string }> {
    this.logger.info(
      {
        providerPhone: request.providerPhone,
        providerName: request.providerName,
        flowId: "schedule_service",
      },
      "Triggering Kestra schedule_service flow",
    );

    try {
      const inputs = {
        provider_phone: request.providerPhone,
        provider_name: request.providerName || "Service Provider",
        service_description: request.serviceDescription || "service",
        preferred_date: request.preferredDate || "this week",
        preferred_time: request.preferredTime || "morning",
        customer_name: request.customerName || "Customer",
        customer_phone: request.customerPhone || "",
        location: request.location || "",
        service_request_id: request.serviceRequestId || "",
        provider_id: request.providerId || "",
      };

      // Use FormData - Kestra execution API requires multipart/form-data
      const formData = this.buildRequestBody(inputs);
      const response = await axios.post(
        `${this.baseUrl}/api/v1/executions/${this.namespace}/schedule_service`,
        formData,
        {
          headers: this.buildHeaders(true),
        },
      );

      this.logger.info(
        {
          executionId: response.data.id,
          namespace: this.namespace,
          flowId: "schedule_service",
        },
        "Kestra schedule_service execution triggered",
      );

      // Poll for completion (longer timeout for booking calls - 5 minutes)
      const finalState = await this.pollExecutionWithTimeout(response.data.id, 300000);

      return {
        success: finalState.state.current === "SUCCESS",
        executionId: response.data.id,
        bookingStatus: finalState.outputs?.booking_status as string | undefined,
        error: finalState.state.current !== "SUCCESS" ? `Execution ${finalState.state.current.toLowerCase()}` : undefined,
      };
    } catch (error) {
      this.logger.error({ error }, "Kestra schedule_service flow failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Trigger the recommend_providers flow to analyze call results and recommend top 3
   */
  async triggerRecommendProvidersFlow(request: {
    callResults: any[];
    originalCriteria: string;
    serviceRequestId: string;
    scoringWeights?: {
      availabilityUrgency: number;
      rateCompetitiveness: number;
      allCriteriaMet: number;
      callQuality: number;
      professionalism: number;
    };
  }): Promise<{
    success: boolean;
    executionId?: string;
    recommendations?: any;
    error?: string;
  }> {
    this.logger.info(
      {
        serviceRequestId: request.serviceRequestId,
        callResultsCount: request.callResults.length,
        flowId: "recommend_providers",
      },
      "Triggering Kestra recommend_providers flow",
    );

    try {
      const inputs = {
        call_results: request.callResults,  // buildRequestBody handles JSON stringification
        original_criteria: request.originalCriteria || "",
        service_request_id: request.serviceRequestId,
        scoring_weights: request.scoringWeights || {  // buildRequestBody handles JSON stringification
          availabilityUrgency: 0.30,
          rateCompetitiveness: 0.20,
          allCriteriaMet: 0.25,
          callQuality: 0.15,
          professionalism: 0.10,
        },
      };

      // Use FormData - Kestra execution API requires multipart/form-data
      const formData = this.buildRequestBody(inputs);
      const response = await axios.post(
        `${this.baseUrl}/api/v1/executions/${this.namespace}/recommend_providers`,
        formData,
        {
          headers: this.buildHeaders(true),
        },
      );

      this.logger.info(
        {
          executionId: response.data.id,
          namespace: this.namespace,
          flowId: "recommend_providers",
        },
        "Kestra recommend_providers execution triggered",
      );

      // Poll for completion (60 seconds timeout for AI analysis)
      const finalState = await this.pollExecutionWithTimeout(response.data.id, 60000);

      // Parse recommendations from the workflow output
      let recommendations;
      if (finalState.outputs?.recommendations_json) {
        try {
          recommendations = JSON.parse(finalState.outputs.recommendations_json as string);
        } catch (parseError) {
          this.logger.warn({ parseError }, "Failed to parse recommendations JSON from Kestra output");
        }
      }

      return {
        success: finalState.state.current === "SUCCESS",
        executionId: response.data.id,
        recommendations,
        error: finalState.state.current !== "SUCCESS" ? `Execution ${finalState.state.current.toLowerCase()}` : undefined,
      };
    } catch (error) {
      this.logger.error({ error }, "Kestra recommend_providers flow failed");
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Poll Kestra execution with custom timeout
   */
  private async pollExecutionWithTimeout(
    executionId: string,
    timeoutMs: number,
  ): Promise<KestraExecutionStatus> {
    const pollIntervalMs = 2000; // Poll every 2 seconds
    const maxAttempts = Math.ceil(timeoutMs / pollIntervalMs);
    let attempts = 0;

    while (attempts < maxAttempts) {
      const status = await this.getExecutionStatus(executionId);

      this.logger.debug(
        {
          executionId,
          state: status.state.current,
          attempt: attempts + 1,
          maxAttempts,
        },
        "Polling Kestra execution",
      );

      if (["SUCCESS", "FAILED", "KILLED"].includes(status.state.current)) {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      attempts++;
    }

    throw new Error(
      `Kestra execution ${executionId} timed out after ${timeoutMs / 1000} seconds`,
    );
  }
}
