/**
 * Direct VAPI Client
 * Makes direct API calls to VAPI.ai without Kestra orchestration
 * Used as fallback when Kestra is unavailable (e.g., in Railway production)
 */

import { VapiClient } from "@vapi-ai/server-sdk";
import type { CallRequest, CallResult, StructuredCallData } from "./types.js";
import { createAssistantConfig } from "./assistant-config.js";

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

  constructor(private logger: Logger) {
    const apiKey = process.env.VAPI_API_KEY;
    this.phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || "";

    if (!apiKey || !this.phoneNumberId) {
      throw new Error(
        "VAPI_API_KEY and VAPI_PHONE_NUMBER_ID environment variables are required",
      );
    }

    this.client = new VapiClient({ token: apiKey });
  }

  /**
   * Initiate a phone call to a service provider
   * This method handles the full call lifecycle: creation, polling, and result extraction
   */
  async initiateCall(request: CallRequest): Promise<CallResult> {
    // Pass customPrompt to createAssistantConfig for dynamic Direct Task prompts
    const assistantConfig = createAssistantConfig(request, request.customPrompt);

    this.logger.info(
      {
        provider: request.providerName,
        phone: request.providerPhone,
        service: request.serviceNeeded,
      },
      "Initiating direct VAPI call",
    );

    try {
      // Create the call using the SDK
      // The SDK may return different response types, so we handle it generically
      const callResponse = await this.client.calls.create({
        phoneNumberId: this.phoneNumberId,
        customer: {
          number: request.providerPhone,
          name: request.providerName,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        assistant: assistantConfig as any,
      });

      // Extract call data - handle both single call and batch responses
      const call = this.extractCallFromResponse(callResponse);

      this.logger.info(
        {
          callId: call.id,
          status: call.status,
        },
        "VAPI call created",
      );

      // Poll for completion
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
      const call = this.extractCallFromResponse(callResponse);

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
