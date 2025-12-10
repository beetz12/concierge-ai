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
  private concurrentFlowId = "contact_providers_concurrent";

  constructor(private logger: Logger) {
    this.baseUrl = process.env.KESTRA_URL || "http://localhost:8082";
    this.namespace = process.env.KESTRA_NAMESPACE || "ai_concierge";
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
      const response = await axios.get(`${this.baseUrl}/api/v1/health`, {
        timeout,
      });
      return response.status === 200;
    } catch (error) {
      this.logger.error({ error }, "Kestra health check failed");
      return false;
    }
  }

  /**
   * Trigger the contact_providers flow and wait for completion
   */
  async triggerContactFlow(request: CallRequest): Promise<CallResult> {
    this.logger.info(
      {
        provider: request.providerName,
        phone: request.providerPhone,
        flowId: this.flowId,
      },
      "Triggering Kestra contact flow",
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

      return {
        status: "error",
        callId: "",
        callMethod: "kestra",
        duration: 0,
        endedReason: "kestra_error",
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
        error: error instanceof Error ? error.message : "Unknown error",
      };
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

    const response = await axios.post(
      `${this.baseUrl}/api/v1/executions/${this.namespace}/${this.flowId}`,
      inputs,
      {
        headers: { "Content-Type": "application/json" },
      },
    );

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
          state: status.state,
          attempt: attempts + 1,
          maxAttempts,
        },
        "Polling Kestra execution",
      );

      if (["SUCCESS", "FAILED", "KILLED"].includes(status.state)) {
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
      `${this.baseUrl}/api/v1/executions/${executionId}`,
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

    if (!rawOutput || state.state !== "SUCCESS") {
      return {
        status: state.state === "SUCCESS" ? "error" : "error",
        callId: state.id,
        callMethod: "kestra",
        duration: 0,
        endedReason:
          state.state === "SUCCESS" ? "no_output" : state.state.toLowerCase(),
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
          state.state !== "SUCCESS"
            ? `Kestra execution ${state.state.toLowerCase()}`
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
   * Trigger concurrent contact flow for multiple providers
   * Uses Kestra's EachParallel or custom concurrent flow
   */
  async triggerConcurrentContactFlow(
    providers: Array<{ name: string; phone: string }>,
    config: {
      serviceNeeded: string;
      userCriteria: string;
      location: string;
      urgency: string;
      maxConcurrent?: number;
    },
  ): Promise<CallResult[]> {
    this.logger.info(
      {
        providerCount: providers.length,
        flowId: this.concurrentFlowId,
        maxConcurrent: config.maxConcurrent || 5,
      },
      "Triggering Kestra concurrent contact flow",
    );

    try {
      // Prepare inputs for Kestra flow
      const inputs = {
        providers: JSON.stringify(providers),
        service_needed: config.serviceNeeded,
        user_criteria: config.userCriteria,
        location: config.location,
        urgency: config.urgency,
        max_concurrent: config.maxConcurrent || 5,
      };

      // Trigger execution
      const execution = await this.triggerConcurrentExecution(inputs);

      // Poll for completion
      const finalState = await this.pollExecution(execution.id);

      // Parse and return results
      return this.parseConcurrentExecutionResults(
        finalState,
        providers,
        config,
      );
    } catch (error) {
      this.logger.error(
        { error, providerCount: providers.length },
        "Kestra concurrent flow failed",
      );

      // Return error results for all providers
      return providers.map((provider) => ({
        status: "error" as const,
        callId: "",
        callMethod: "kestra" as const,
        duration: 0,
        endedReason: "kestra_error",
        transcript: "",
        analysis: {
          summary: "",
          structuredData: {
            availability: "unavailable" as const,
            estimated_rate: "unknown",
            single_person_found: false,
            all_criteria_met: false,
            call_outcome: "negative" as const,
            recommended: false,
            disqualified: true,
            disqualification_reason: error instanceof Error ? error.message : "Kestra flow failed",
          },
          successEvaluation: "",
        },
        provider: {
          name: provider.name,
          phone: provider.phone,
          service: config.serviceNeeded,
          location: config.location,
        },
        request: {
          criteria: config.userCriteria,
          urgency: config.urgency,
        },
        error: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  }

  /**
   * Trigger concurrent Kestra execution with flow inputs
   */
  private async triggerConcurrentExecution(
    inputs: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const response = await axios.post(
      `${this.baseUrl}/api/v1/executions/${this.namespace}/${this.concurrentFlowId}`,
      inputs,
      {
        headers: { "Content-Type": "application/json" },
      },
    );

    this.logger.info(
      {
        executionId: response.data.id,
        namespace: this.namespace,
        flowId: this.concurrentFlowId,
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
    providers: Array<{ name: string; phone: string }>,
    config: {
      serviceNeeded: string;
      userCriteria: string;
      location: string;
      urgency: string;
    },
  ): CallResult[] {
    if (state.state !== "SUCCESS") {
      this.logger.error(
        { state: state.state, executionId: state.id },
        "Kestra concurrent execution failed",
      );

      // Return error results for all providers
      return providers.map((provider) => ({
        status: "error" as const,
        callId: state.id,
        callMethod: "kestra" as const,
        duration: 0,
        endedReason: state.state.toLowerCase(),
        transcript: "",
        analysis: {
          summary: "",
          structuredData: {
            availability: "unavailable" as const,
            estimated_rate: "unknown",
            single_person_found: false,
            all_criteria_met: false,
            call_outcome: "negative" as const,
            recommended: false,
          },
          successEvaluation: "",
        },
        provider: {
          name: provider.name,
          phone: provider.phone,
          service: config.serviceNeeded,
          location: config.location,
        },
        request: {
          criteria: config.userCriteria,
          urgency: config.urgency,
        },
        error: `Kestra execution ${state.state.toLowerCase()}`,
      }));
    }

    // Try to extract results from different possible output keys
    const rawOutput =
      state.outputs?.call_results || state.outputs?.results;

    if (!rawOutput) {
      this.logger.warn(
        { executionId: state.id },
        "No results found in Kestra concurrent execution output",
      );

      // Return empty/error results
      return providers.map((provider) => ({
        status: "error" as const,
        callId: state.id,
        callMethod: "kestra" as const,
        duration: 0,
        endedReason: "no_output",
        transcript: "",
        analysis: {
          summary: "",
          structuredData: {
            availability: "unavailable" as const,
            estimated_rate: "unknown",
            single_person_found: false,
            all_criteria_met: false,
            call_outcome: "negative" as const,
            recommended: false,
          },
          successEvaluation: "",
        },
        provider: {
          name: provider.name,
          phone: provider.phone,
          service: config.serviceNeeded,
          location: config.location,
        },
        request: {
          criteria: config.userCriteria,
          urgency: config.urgency,
        },
        error: "No output from Kestra execution",
      }));
    }

    // Parse the results
    const results: CallResult[] =
      typeof rawOutput === "string" ? JSON.parse(rawOutput) : rawOutput;

    // Ensure all results have kestra method identifier
    return results.map((result) => ({
      ...result,
      callMethod: "kestra" as const,
    }));
  }
}
