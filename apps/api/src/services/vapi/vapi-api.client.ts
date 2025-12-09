/**
 * VAPI REST API Client
 * Fetches complete call data from VAPI's REST API
 * Used for enriching webhook data with complete transcript and analysis
 */

import type { CallResult, StructuredCallData } from "./types.js";

// VAPI API Response types
export interface VAPICallResponse {
  id: string;
  orgId?: string;
  type: "webCall" | "inboundPhoneCall" | "outboundPhoneCall";
  status: "queued" | "ringing" | "in-progress" | "forwarding" | "ended";
  endedReason?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  transcript?: string;
  recordingUrl?: string;
  summary?: string;
  messages?: Array<{
    role: string;
    message: string;
    time: number;
    endTime?: number;
    secondsFromStart?: number;
  }>;
  analysis?: {
    summary?: string;
    structuredData?: Record<string, unknown>;
    successEvaluation?: string;
  };
  artifact?: {
    transcript?: string;
    messages?: unknown[];
    recordingUrl?: string;
  };
  cost?: number;
  costBreakdown?: {
    transport?: number;
    stt?: number;
    llm?: number;
    tts?: number;
    vapi?: number;
    total?: number;
    llmPromptTokens?: number;
    llmCompletionTokens?: number;
    ttsCharacters?: number;
  };
  metadata?: Record<string, unknown>;
  phoneNumber?: {
    number?: string;
  };
  customer?: {
    number?: string;
    name?: string;
  };
}

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export class VAPIApiClient {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.vapi.ai";

  constructor(
    apiKey: string,
    private logger?: Logger,
  ) {
    this.apiKey = apiKey;
  }

  /**
   * Fetch a call by ID from VAPI REST API
   */
  async getCall(callId: string): Promise<VAPICallResponse> {
    const url = `${this.baseUrl}/call/${callId}`;

    this.logger?.debug({ callId, url }, "Fetching call from VAPI API");

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`VAPI API error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as VAPICallResponse;

    this.logger?.debug(
      {
        callId,
        status: data.status,
        hasTranscript: !!data.transcript || !!data.artifact?.transcript,
        hasAnalysis: !!data.analysis,
      },
      "VAPI API response received",
    );

    return data;
  }

  /**
   * Check if call data is complete (has transcript and analysis)
   */
  isDataComplete(call: VAPICallResponse): boolean {
    const transcript = call.transcript || call.artifact?.transcript || "";
    const hasTranscript = transcript.length > 50;
    const hasAnalysis = !!(
      call.analysis?.summary || call.analysis?.structuredData
    );
    const isEnded = call.status === "ended";

    return isEnded && hasTranscript && hasAnalysis;
  }

  /**
   * Transform VAPI API response to CallResult format
   */
  transformToCallResult(
    call: VAPICallResponse,
    existingResult?: Partial<CallResult>,
  ): CallResult {
    // Get transcript from various possible locations
    const transcript = call.transcript || call.artifact?.transcript || "";

    // Calculate duration
    let duration = 0;
    if (call.startedAt && call.endedAt) {
      const start = new Date(call.startedAt).getTime();
      const end = new Date(call.endedAt).getTime();
      duration = (end - start) / 1000 / 60; // Convert to minutes
    }

    // Determine status
    let status: CallResult["status"] = "completed";
    if (call.endedReason) {
      const reason = call.endedReason.toLowerCase();
      if (reason.includes("no") || reason.includes("voicemail")) {
        status = "voicemail";
      } else if (reason.includes("error") || reason.includes("failed")) {
        status = "error";
      } else if (reason.includes("timeout")) {
        status = "timeout";
      }
    }

    // Build structured data from analysis
    const structuredData: StructuredCallData = {
      availability: "unclear",
      estimated_rate: "unknown",
      single_person_found: false,
      all_criteria_met: false,
      call_outcome: status === "completed" ? "positive" : "no_answer",
      recommended: false,
      ...((call.analysis?.structuredData as Partial<StructuredCallData>) || {}),
    };

    // Extract metadata for provider info
    const metadata = call.metadata || {};

    return {
      status,
      callId: call.id,
      callMethod: existingResult?.callMethod || "direct_vapi",
      duration,
      endedReason: call.endedReason || "unknown",
      transcript,
      analysis: {
        summary:
          call.analysis?.summary || call.summary || "No summary available",
        structuredData,
        successEvaluation: call.analysis?.successEvaluation || "unknown",
      },
      provider: existingResult?.provider || {
        name: (metadata.providerName as string) || "Unknown Provider",
        phone: call.customer?.number || call.phoneNumber?.number || "unknown",
        service: (metadata.serviceNeeded as string) || "unknown",
        location: (metadata.location as string) || "unknown",
      },
      request: existingResult?.request || {
        criteria: (metadata.userCriteria as string) || "",
        urgency: (metadata.urgency as string) || "flexible",
      },
      cost: call.cost || call.costBreakdown?.total || 0,
      dataStatus: "complete",
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Merge VAPI API data with existing webhook data
   * API data takes precedence for transcript/analysis
   */
  mergeCallData(existing: CallResult, apiCall: VAPICallResponse): CallResult {
    // Get transcript from API response
    const apiTranscript =
      apiCall.transcript || apiCall.artifact?.transcript || "";

    // Extract analysis from API response
    const apiAnalysis = apiCall.analysis || {};
    const apiStructuredData = apiAnalysis.structuredData || {};

    return {
      ...existing,
      // Prefer API transcript if it's longer/more complete
      transcript:
        apiTranscript.length > existing.transcript.length
          ? apiTranscript
          : existing.transcript,
      // Merge analysis, preferring API data
      analysis: {
        summary: apiAnalysis.summary || existing.analysis.summary,
        structuredData: {
          ...existing.analysis.structuredData,
          ...(apiStructuredData as Partial<StructuredCallData>),
        },
        successEvaluation:
          apiAnalysis.successEvaluation || existing.analysis.successEvaluation,
      },
      // Update cost if available
      cost: apiCall.cost || apiCall.costBreakdown?.total || existing.cost,
      // Mark as complete
      dataStatus: "complete",
      fetchedAt: new Date().toISOString(),
    };
  }
}
