/**
 * Direct VAPI Client
 * Makes direct API calls to VAPI.ai without Kestra orchestration
 * Used as fallback when Kestra is unavailable (e.g., in Railway production)
 */

import { VapiClient } from "@vapi-ai/server-sdk";
import type { CallRequest, CallResult, StructuredCallData } from "./types.js";
import { createAssistantConfig } from "./assistant-config.js";
import {
  createWebhookAssistantConfig,
  createWebhookMetadata,
} from "./webhook-config.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

// Type for VAPI call response (based on SDK return types)
interface VapiCall {
  id: string;
  status: string;
  endedReason?: string;
  durationMinutes?: number;
  artifact?: {
    transcript?: string | unknown[];
    recording?: string;
    messages?: unknown[];
  };
  analysis?: {
    summary?: string;
    structuredData?: Record<string, unknown>;
    successEvaluation?: string;
  };
  costBreakdown?: {
    total?: number;
    voiceModel?: number;
    transcriber?: number;
    llm?: number;
  };
}

export class DirectVapiClient {
  private client: VapiClient;
  private phoneNumberId: string;
  private webhookUrl: string | undefined;
  private backendUrl: string;

  constructor(private logger: Logger) {
    const apiKey = process.env.VAPI_API_KEY;
    this.phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || "";
    this.webhookUrl = process.env.VAPI_WEBHOOK_URL;
    this.backendUrl = process.env.BACKEND_URL || "http://localhost:8000";

    if (!apiKey || !this.phoneNumberId) {
      throw new Error(
        "VAPI_API_KEY and VAPI_PHONE_NUMBER_ID environment variables are required",
      );
    }

    this.client = new VapiClient({ token: apiKey });

    if (this.webhookUrl) {
      this.logger.info(
        { webhookUrl: this.webhookUrl },
        "Webhook URL configured - using hybrid mode",
      );
    } else {
      this.logger.info({}, "No webhook URL - using polling-only mode");
    }
  }

  /**
   * Initiate a phone call to a service provider
   * This method handles the full call lifecycle: creation, polling/webhook, and result extraction
   *
   * HYBRID APPROACH:
   * - When VAPI_WEBHOOK_URL is set: Try webhook first (fast path), fall back to polling
   * - When not set: Use polling only (original behavior)
   */
  async initiateCall(request: CallRequest): Promise<CallResult> {
    // Pass customPrompt to createAssistantConfig for dynamic Direct Task prompts
    const assistantConfig = createAssistantConfig(request, request.customPrompt);

    this.logger.info(
      {
        provider: request.providerName,
        phone: request.providerPhone,
        service: request.serviceNeeded,
        webhookEnabled: !!this.webhookUrl,
      },
      "Initiating direct VAPI call",
    );

    try {
      // Build call parameters
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callParams: any = {
        phoneNumberId: this.phoneNumberId,
        customer: {
          number: request.providerPhone,
          name: request.providerName,
        },
        assistant: assistantConfig,
      };

      // Add webhook config when URL is available
      if (this.webhookUrl) {
        // Replace assistant with webhook-enabled version (uses assistant.server.url)
        callParams.assistant = createWebhookAssistantConfig(
          request,
          this.webhookUrl,
          request.customPrompt
        );
        callParams.metadata = createWebhookMetadata(request);
        this.logger.debug(
          { metadata: callParams.metadata },
          "Adding webhook metadata to call",
        );
      }

      // Create the call using the SDK
      const callResponse = await this.client.calls.create(callParams);

      // Extract call data - handle both single call and batch responses
      const call = this.extractCallFromResponse(callResponse);

      this.logger.info(
        {
          callId: call.id,
          status: call.status,
          webhookEnabled: !!this.webhookUrl,
        },
        "VAPI call created",
      );

      // HYBRID APPROACH: Try webhook first if configured
      if (this.webhookUrl) {
        const webhookResult = await this.waitForWebhookResult(call.id);
        if (webhookResult) {
          this.logger.info(
            { callId: call.id },
            "Got result from webhook (fast path)",
          );
          return webhookResult;
        }
        this.logger.info(
          { callId: call.id },
          "Webhook timeout, falling back to VAPI polling",
        );
      }

      // FALLBACK: Poll VAPI directly (original behavior)
      const completedCall = await this.pollCallCompletion(call.id);

      return this.formatCallResult(completedCall, request);
    } catch (error) {
      this.logger.error(
        {
          error,
          provider: request.providerName,
        },
        "Failed to initiate VAPI call",
      );

      return this.createErrorResult(request, error);
    }
  }

  /**
   * Wait for webhook result by polling the backend cache
   * Returns the result if found, or null to trigger fallback to VAPI polling
   *
   * IMPORTANT: If webhook (ngrok) is not running, we'll get 404s from the cache.
   * We detect this pattern and fall back to VAPI polling early instead of waiting
   * the full timeout.
   */
  private async waitForWebhookResult(
    callId: string,
    timeoutMs: number = 300000, // 5 minutes default
  ): Promise<CallResult | null> {
    const startTime = Date.now();
    const pollInterval = 2000; // Poll backend cache every 2s

    // Early fallback detection: if we get too many consecutive 404s,
    // the webhook likely isn't working (e.g., ngrok not running)
    const MAX_CONSECUTIVE_404S = 30; // 30 * 2s = 60 seconds of 404s before giving up
    let consecutive404Count = 0;
    let hasEverReceivedData = false;

    this.logger.debug(
      { callId, timeoutMs, maxConsecutive404s: MAX_CONSECUTIVE_404S },
      "Waiting for webhook result from backend cache",
    );

    while (Date.now() - startTime < timeoutMs) {
      try {
        const response = await fetch(
          `${this.backendUrl}/api/v1/vapi/calls/${callId}`,
        );

        if (response.ok) {
          const result = (await response.json()) as { data?: CallResult & { dataStatus?: string } };
          const data = result.data;

          // Reset 404 counter on successful response
          consecutive404Count = 0;
          hasEverReceivedData = true;

          // Check if data is complete (webhook received and enriched)
          if (data && data.dataStatus === "complete") {
            this.logger.info(
              { callId, dataStatus: data.dataStatus },
              "Got complete result from webhook cache",
            );
            return data as CallResult;
          }

          // Data exists but still partial - keep waiting
          if (data && data.dataStatus === "partial") {
            this.logger.debug(
              { callId, dataStatus: "partial" },
              "Webhook received but enrichment in progress",
            );
          }
        } else if (response.status === 404) {
          consecutive404Count++;

          // Only log periodically to avoid spam
          if (consecutive404Count % 10 === 0) {
            this.logger.debug(
              { callId, consecutive404Count, max: MAX_CONSECUTIVE_404S },
              "Webhook cache returning 404s (webhook may not be configured)",
            );
          }

          // If we've never received data and keep getting 404s, webhook likely isn't working
          if (!hasEverReceivedData && consecutive404Count >= MAX_CONSECUTIVE_404S) {
            this.logger.warn(
              { callId, consecutive404Count },
              "Too many consecutive 404s - webhook appears unavailable (is ngrok running?). Falling back to VAPI polling.",
            );
            return null;
          }
        }
      } catch (error) {
        this.logger.debug(
          { callId, error },
          "Error polling webhook cache, will retry",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    this.logger.warn(
      { callId, timeoutMs },
      "Webhook result timeout, will fall back to polling",
    );
    return null;
  }

  /**
   * Extract call data from SDK response
   * Handles different response types from the SDK
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private extractCallFromResponse(response: any): VapiCall {
    // If it's a direct call object
    if (response && typeof response.id === "string") {
      return response as VapiCall;
    }
    // If it's wrapped in a data property
    if (response?.data && typeof response.data.id === "string") {
      return response.data as VapiCall;
    }
    // If it's an array (batch response)
    if (Array.isArray(response) && response.length > 0) {
      return response[0] as VapiCall;
    }
    throw new Error("Unexpected response format from VAPI calls.create");
  }

  /**
   * Poll for call completion
   * Checks call status every 5 seconds for up to 5 minutes
   */
  private async pollCallCompletion(callId: string): Promise<VapiCall> {
    const maxAttempts = 60; // 5 minutes (60 * 5 seconds)
    let attempts = 0;

    while (attempts < maxAttempts) {
      // SDK uses object parameter for get
      const callResponse = await this.client.calls.get({ id: callId });
      let call = this.extractCallFromResponse(callResponse);

      this.logger.debug(
        {
          callId,
          status: call.status,
          attempt: attempts + 1,
          maxAttempts,
        },
        "Polling call status",
      );

      // Check if call has ended (not in active states)
      if (!["queued", "ringing", "in-progress"].includes(call.status)) {
        // VAPI processes analysis ASYNC after call ends
        // Wait and retry to ensure we get structuredData
        const ENRICHMENT_DELAYS_MS = [3000, 5000, 8000]; // 3s, 5s, 8s

        for (let enrichAttempt = 0; enrichAttempt < ENRICHMENT_DELAYS_MS.length; enrichAttempt++) {
          // Check if we already have analysis data
          const hasAnalysis = !!(call.analysis?.structuredData || call.analysis?.summary);
          const hasTranscript = (call.artifact?.transcript || "").length > 50;

          if (hasAnalysis && hasTranscript) {
            this.logger.info(
              { callId, enrichAttempt },
              "Call data complete, returning"
            );
            return call;
          }

          // Wait before re-fetching
          const delay = ENRICHMENT_DELAYS_MS[enrichAttempt];
          this.logger.info(
            { callId, delay, enrichAttempt: enrichAttempt + 1 },
            "Waiting for VAPI analysis processing"
          );
          await new Promise((resolve) => setTimeout(resolve, delay));

          // Re-fetch to get updated analysis
          const enrichedResponse = await this.client.calls.get({ id: callId });
          const enrichedCall = this.extractCallFromResponse(enrichedResponse);

          // Check if analysis is now ready
          const enrichedHasAnalysis = !!(
            enrichedCall.analysis?.structuredData || enrichedCall.analysis?.summary
          );
          const enrichedHasTranscript = (enrichedCall.artifact?.transcript || "").length > 50;

          if (enrichedHasAnalysis && enrichedHasTranscript) {
            this.logger.info(
              { callId, enrichAttempt: enrichAttempt + 1 },
              "Analysis data ready after enrichment"
            );
            return enrichedCall;
          }

          // Update call reference for next iteration check
          call = enrichedCall;
        }

        // Fallback: return whatever we have after all retries
        this.logger.warn(
          { callId, hasAnalysis: !!call.analysis?.structuredData },
          "Analysis not ready after enrichment attempts, returning partial data"
        );
        return call;
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error(
      `Call ${callId} timed out after ${maxAttempts * 5} seconds`,
    );
  }

  /**
   * Format the VAPI call response into our standard CallResult format
   */
  private formatCallResult(call: VapiCall, request: CallRequest): CallResult {
    // Determine status based on call state and ended reason
    let status: CallResult["status"] = "completed";

    if (call.status !== "ended") {
      status = "error";
    } else if (
      call.endedReason?.includes("no-answer") ||
      call.endedReason?.includes("no_answer")
    ) {
      status = "no_answer";
    } else if (call.endedReason?.includes("voicemail")) {
      status = "voicemail";
    }

    // Extract transcript - could be in artifact or directly on call
    const transcript = call.artifact?.transcript || "";
    const transcriptStr =
      typeof transcript === "string" ? transcript : JSON.stringify(transcript);

    // Extract messages array from artifact or call
    const messages = call.artifact?.messages || [];
    const formattedMessages = Array.isArray(messages)
      ? messages.map((msg: any) => ({
          role: msg.role || "unknown",
          message: msg.message || msg.content || "",
          time: msg.time || msg.secondsFromStart,
        }))
      : [];

    // Extract analysis data
    const analysis = call.analysis || {};
    const structuredData = (analysis.structuredData ||
      {}) as unknown as StructuredCallData;

    return {
      status,
      callId: call.id,
      callMethod: "direct_vapi",
      duration: call.durationMinutes || 0,
      endedReason: call.endedReason || "unknown",
      transcript: transcriptStr,
      analysis: {
        summary: analysis.summary || "",
        structuredData,
        successEvaluation: analysis.successEvaluation || "",
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
      cost: call.costBreakdown?.total,
      messages: formattedMessages,
    };
  }

  /**
   * Create an error result when call fails
   */
  private createErrorResult(request: CallRequest, error: unknown): CallResult {
    return {
      status: "error",
      callId: "",
      callMethod: "direct_vapi",
      duration: 0,
      endedReason: "api_error",
      transcript: "",
      analysis: {
        summary: "",
        structuredData: {
          availability: "unclear",
          estimated_rate: "",
          single_person_found: false,
          all_criteria_met: false,
          call_outcome: "no_answer",
          recommended: false,
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
}
