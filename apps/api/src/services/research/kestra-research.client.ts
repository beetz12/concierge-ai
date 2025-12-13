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
import { serializeError } from "../../utils/error.js";

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
   * Build request body - FormData for both cloud and local modes
   * Kestra execution API requires multipart/form-data, not JSON
   * Handles objects/arrays by JSON stringifying, primitives as-is
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
      this.logger.error({ error: serializeError(error) }, "Kestra health check failed");
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
        { error: serializeError(error), service: request.service },
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
   * Extract JSON from text that may contain markdown code fences and preamble text
   * Handles:
   *   - ```json\n{...}\n```
   *   - ```\n{...}\n```
   *   - "Some text...\n\n```json\n{...}\n```"  (text before fence)
   *   - Raw JSON without fences
   */
  private extractJsonFromText(text: string): string {
    const trimmed = text.trim();

    // Find the start of a JSON code fence (```json or ```)
    const jsonFenceMatch = trimmed.match(/```(?:json)?\s*\n/);
    if (jsonFenceMatch && jsonFenceMatch.index !== undefined) {
      // Extract content after the opening fence
      const startIndex = jsonFenceMatch.index + jsonFenceMatch[0].length;
      let content = trimmed.slice(startIndex);

      // Remove closing fence
      const closingFenceIndex = content.lastIndexOf("```");
      if (closingFenceIndex !== -1) {
        content = content.slice(0, closingFenceIndex);
      }

      return content.trim();
    }

    // No code fence found - try to extract raw JSON object/array
    // Look for first { or [ and last } or ]
    const jsonStartObj = trimmed.indexOf("{");
    const jsonStartArr = trimmed.indexOf("[");
    const jsonStart =
      jsonStartObj === -1
        ? jsonStartArr
        : jsonStartArr === -1
          ? jsonStartObj
          : Math.min(jsonStartObj, jsonStartArr);

    if (jsonStart !== -1) {
      const isObject = trimmed[jsonStart] === "{";
      const jsonEnd = isObject
        ? trimmed.lastIndexOf("}")
        : trimmed.lastIndexOf("]");

      if (jsonEnd > jsonStart) {
        return trimmed.slice(jsonStart, jsonEnd + 1);
      }
    }

    // Return as-is if no JSON structure found
    return trimmed;
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

    this.logger.debug(
      {
        executionId: state.id,
        stateStatus: state.state.current,
        hasOutputs: !!state.outputs,
        outputKeys: state.outputs ? Object.keys(state.outputs) : [],
        rawOutputType: typeof rawOutput,
        rawOutputLength: typeof rawOutput === "string" ? rawOutput.length : 0,
        rawOutputPreview: typeof rawOutput === "string" ? rawOutput.slice(0, 200) : String(rawOutput),
      },
      "Parsing Kestra execution result",
    );

    if (!rawOutput || state.state.current !== "SUCCESS") {
      this.logger.warn(
        {
          rawOutputExists: !!rawOutput,
          stateStatus: state.state.current,
        },
        "Kestra execution has no output or failed",
      );
      return {
        status: "error",
        method: "kestra",
        providers: [],
        error:
          state.state.current === "SUCCESS"
            ? "No output from Kestra execution"
            : `Kestra execution ${state.state.current.toLowerCase()}`,
      };
    }

    try {
      // Parse the JSON output from research flow
      // Extract JSON from text that may have preamble text and/or markdown code fences
      // Gemini often returns: "Here's the list...\n\n```json\n{...}\n```"
      const cleanOutput = typeof rawOutput === "string"
        ? this.extractJsonFromText(rawOutput)
        : rawOutput;

      this.logger.debug(
        {
          cleanOutputType: typeof cleanOutput,
          cleanOutputLength: typeof cleanOutput === "string" ? cleanOutput.length : 0,
          cleanOutputPreview: typeof cleanOutput === "string" ? cleanOutput.slice(0, 200) : String(cleanOutput),
        },
        "Extracted JSON from Kestra output",
      );

      const parsed: KestraResearchOutput =
        typeof cleanOutput === "string" ? JSON.parse(cleanOutput) : cleanOutput;

      this.logger.debug(
        {
          providersCount: parsed.providers?.length || 0,
          hasProviders: !!parsed.providers,
          parsedKeys: Object.keys(parsed),
        },
        "Parsed Kestra output successfully",
      );

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
    } catch (parseError) {
      this.logger.error(
        {
          error: serializeError(parseError),
          rawOutputPreview: typeof rawOutput === "string" ? rawOutput.slice(0, 500) : String(rawOutput),
        },
        "Failed to parse Kestra execution output",
      );
      return {
        status: "error",
        method: "kestra",
        providers: [],
        error: `Failed to parse Kestra output: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      };
    }
  }
}
