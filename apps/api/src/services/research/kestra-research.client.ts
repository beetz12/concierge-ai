/**
 * Kestra Research Client
 * Triggers Kestra workflows for provider research
 * Used when Kestra is available (local/staging environments)
 */

import axios from "axios";
import type {
  ResearchRequest,
  ResearchResult,
  Provider,
  KestraExecutionStatus,
  KestraResearchOutput,
} from "./types.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export class KestraResearchClient {
  private baseUrl: string;
  private namespace: string;
  private flowId = "research_providers";
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
   * Build request body - FormData for cloud, JSON for local
   */
  private buildRequestBody(inputs: Record<string, unknown>): FormData | Record<string, unknown> {
    if (this.isCloudMode) {
      const formData = new FormData();
      Object.entries(inputs).forEach(([key, value]) => {
        formData.append(key, String(value));
      });
      return formData;
    }
    return inputs;
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
        headers: this.buildHeaders(),
      });
      return response.status === 200;
    } catch (error) {
      this.logger.error({ error }, "Kestra health check failed");
      return false;
    }
  }

  /**
   * Trigger the research_providers flow and wait for completion
   */
  async research(request: ResearchRequest): Promise<ResearchResult> {
    this.logger.info(
      {
        service: request.service,
        location: request.location,
        flowId: this.flowId,
      },
      "Triggering Kestra research flow",
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
        { error, service: request.service },
        "Kestra research flow failed",
      );
      // Throw to surface error when KESTRA_ENABLED=true - let ResearchService handle
      throw error;
    }
  }

  /**
   * Trigger Kestra execution with flow inputs
   */
  private async triggerExecution(
    request: ResearchRequest,
  ): Promise<{ id: string }> {
    const inputs = {
      service: request.service,
      location: request.location,
      days_needed: request.daysNeeded || 7,
      min_rating: request.minRating || 4.0,
    };

    const url = this.buildExecutionUrl(this.flowId);
    const body = this.buildRequestBody(inputs);
    const headers = this.buildHeaders(this.isCloudMode);

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
   * Checks every 5 seconds for up to 3 minutes
   */
  private async pollExecution(
    executionId: string,
  ): Promise<KestraExecutionStatus> {
    const maxAttempts = 36; // 3 minutes (36 * 5 seconds)
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
      this.buildStatusUrl(executionId),
      { headers: this.buildHeaders() }
    );
    return response.data;
  }

  /**
   * Parse Kestra execution result into ResearchResult format
   */
  private parseExecutionResult(
    state: KestraExecutionStatus,
    request: ResearchRequest,
  ): ResearchResult {
    // Kestra outputs are in state.outputs.json (from flow output)
    const rawOutput = state.outputs?.json;

    if (!rawOutput || state.state !== "SUCCESS") {
      return {
        status: "error",
        method: "kestra",
        providers: [],
        error:
          state.state === "SUCCESS"
            ? "No output from Kestra execution"
            : `Kestra execution ${state.state.toLowerCase()}`,
      };
    }

    // Parse the JSON output from research flow
    const parsed: KestraResearchOutput =
      typeof rawOutput === "string" ? JSON.parse(rawOutput) : rawOutput;

    // Normalize providers
    const providers: Provider[] = (parsed.providers || []).map((p, index) => ({
      id: `kestra-${Date.now()}-${index}`,
      name: p.name,
      phone: p.phone,
      rating: p.rating,
      address: p.address,
      reason: p.reason,
      source: "kestra" as const,
    }));

    return {
      status: "success",
      method: "kestra",
      providers,
      reasoning: `Found ${providers.length} providers via Kestra research flow`,
    };
  }
}
