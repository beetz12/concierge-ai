/**
 * Provider Calling Service
 *
 * Frontend service for making real VAPI calls to service providers.
 * Used when NEXT_PUBLIC_LIVE_CALL_ENABLED=true.
 *
 * The backend automatically handles:
 * - KESTRA_ENABLED=true: Uses Kestra workflow orchestration
 * - KESTRA_ENABLED=false: Uses direct VAPI API calls
 */

import { InteractionLog } from "../types";

// API base URL - uses Next.js rewrite to proxy to backend
const API_BASE = "/api/v1/providers";

/**
 * Generated prompt structure from Gemini task analyzer
 */
export interface GeneratedPrompt {
  systemPrompt: string;
  firstMessage: string;
  closingScript: string;
}

/**
 * Request payload for calling a provider
 */
export interface CallProviderRequest {
  providerName: string;
  providerPhone: string; // Must be E.164 format (+1XXXXXXXXXX)
  serviceNeeded: string;
  userCriteria: string;
  problemDescription?: string; // Detailed problem description
  clientName?: string; // Client's name for personalized greeting
  location: string;
  urgency: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
  serviceRequestId?: string;
  providerId?: string;
  customPrompt?: GeneratedPrompt; // Gemini-generated dynamic prompt for Direct Tasks
}

/**
 * Response from the provider call API
 */
export interface CallProviderResponse {
  success: boolean;
  data?: {
    status: string;
    callId?: string;
    callMethod?: string;
    duration?: number;
    endedReason?: string;
    transcript?: string;
    messages?: Array<{
      role: string;
      message: string;
      time?: number;
    }>;
    analysis?: {
      summary?: string;
      structuredData?: Record<string, unknown>;
      successEvaluation?: string;
    };
    provider?: {
      name: string;
      phone: string;
    };
    request?: {
      criteria: string;
      urgency: string;
    };
    cost?: number;
    error?: string;
  };
  error?: string;
}

/**
 * Normalizes a phone number to E.164 format (+1XXXXXXXXXX)
 * Required by VAPI for making calls
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");

  // Handle US numbers
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  // Already has country code
  if (phone.startsWith("+")) {
    return phone.replace(/[^\d+]/g, "");
  }

  return `+${digits}`;
}

/**
 * Validates if a phone number is in valid E.164 format
 */
export function isValidE164Phone(phone: string): boolean {
  return /^\+1\d{10}$/.test(phone);
}

/**
 * Masks a phone number for privacy-safe logging
 * @example "+12345678901" -> "***8901"
 */
function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) return "****";
  return `***${phone.slice(-4)}`;
}

/**
 * Makes a real phone call to a service provider via VAPI.
 *
 * The backend handles routing:
 * - If KESTRA_ENABLED=true, uses Kestra workflow
 * - If KESTRA_ENABLED=false, uses direct VAPI
 *
 * @returns CallProviderResponse with call details and analysis
 */
export async function callProviderLive(
  request: CallProviderRequest
): Promise<CallProviderResponse> {
  const timestamp = new Date().toISOString();

  // Log call initiation
  console.log("[ProviderCalling] Initiating call:", {
    provider: request.providerName,
    phone: maskPhoneNumber(request.providerPhone),
    serviceNeeded: request.serviceNeeded,
    urgency: request.urgency,
    location: request.location,
    hasCustomPrompt: !!request.customPrompt,
    timestamp,
  });

  try {
    const response = await fetch(`${API_BASE}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    // Check response.ok BEFORE parsing JSON to handle non-JSON error responses
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ error: `API error: ${response.status}` }));

      const errorDetails = {
        provider: request.providerName,
        phone: maskPhoneNumber(request.providerPhone),
        error: errorData.error || `API error: ${response.status}`,
        statusCode: response.status,
        statusText: response.statusText,
        timestamp: new Date().toISOString(),
      };

      console.error("[ProviderCalling] Call failed:", errorDetails);

      return {
        success: false,
        error: errorData.error || `API error: ${response.status} ${response.statusText}`,
      };
    }

    const result = await response.json();

    // Log successful response
    console.log("[ProviderCalling] Call response received:", {
      provider: request.providerName,
      phone: maskPhoneNumber(request.providerPhone),
      success: result.success,
      status: result.data?.status,
      callId: result.data?.callId,
      duration: result.data?.duration,
      endedReason: result.data?.endedReason,
      hasTranscript: !!result.data?.transcript,
      hasAnalysis: !!result.data?.analysis,
      timestamp: new Date().toISOString(),
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    const errorDetails = {
      provider: request.providerName,
      phone: maskPhoneNumber(request.providerPhone),
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    };

    console.error("[ProviderCalling] Call exception:", errorDetails);

    return {
      success: false,
      error: `Failed to call provider: ${errorMessage}`,
    };
  }
}

/**
 * Converts a CallProviderResponse to an InteractionLog for UI display.
 * This allows seamless integration with the existing UI components.
 */
export function callResponseToInteractionLog(
  providerName: string,
  response: CallProviderResponse
): InteractionLog {
  if (!response.success || !response.data) {
    return {
      timestamp: new Date().toISOString(),
      stepName: `Calling ${providerName}`,
      detail: response.error || "Call failed to connect",
      status: "error",
    };
  }

  const { data } = response;

  // Determine status based on call outcome
  let status: "success" | "error" | "warning" = "success";
  let detail = "";

  // Status logic:
  // - "completed" status = "success" (the call itself succeeded)
  // - Detail message indicates if provider was disqualified or criteria unmet
  // - Only set warning/error for actual call failures
  if (data.status === "completed") {
    const structuredData = data.analysis?.structuredData as Record<string, unknown> | undefined;
    status = "success"; // Completed call is always a success

    if (structuredData?.disqualified) {
      detail = `${providerName}: Disqualified - ${structuredData.disqualification_reason || "Does not meet requirements"}`;
    } else if (structuredData?.all_criteria_met === false) {
      detail = `${providerName}: ${data.analysis?.summary || "Some criteria not met"}`;
    } else {
      // Successful call with all criteria met - show summary and available data
      const availability = structuredData?.earliest_availability || structuredData?.availability;
      const rate = structuredData?.estimated_rate;
      detail = `${providerName}: ${data.analysis?.summary || "Call completed successfully"}`;
      if (availability) detail += ` Available: ${availability}.`;
      if (rate) detail += ` Rate: ${rate}.`;
    }
  } else if (data.status === "no_answer") {
    status = "warning";
    detail = `${providerName}: No answer`;
  } else if (data.status === "voicemail") {
    status = "warning";
    detail = `${providerName}: Reached voicemail`;
  } else if (data.status === "error" || data.status === "timeout") {
    status = "error";
    detail = `${providerName}: ${data.error || "Call failed"}`;
  } else {
    status = "warning";
    detail = `${providerName}: ${data.endedReason || "Unknown status"}`;
  }

  // Transform VAPI messages array to UI transcript format
  let transcript: { speaker: string; text: string }[] | undefined;

  if (data.messages && Array.isArray(data.messages) && data.messages.length > 0) {
    const speakerMap: Record<string, string> = {
      assistant: "AI",
      user: "Provider",
      bot: "AI"  // Some VAPI versions use "bot"
    };
    transcript = data.messages
      .filter((m: { role: string }) => m.role !== "system" && m.role !== "function")
      .map((m: { role: string; message: string }) => ({
        speaker: speakerMap[m.role] || m.role,
        text: m.message
      }));
  }

  // Fallback: parse raw transcript string if messages not available
  if (!transcript && data.transcript && typeof data.transcript === "string" && data.transcript.length > 0) {
    transcript = data.transcript
      .split("\n")
      .filter((line: string) => line.trim())
      .map((line: string) => {
        const colonIndex = line.indexOf(": ");
        if (colonIndex > -1) {
          const speaker = line.substring(0, colonIndex);
          const speakerMap: Record<string, string> = { Assistant: "AI", User: "Provider" };
          return {
            speaker: speakerMap[speaker] || speaker,
            text: line.substring(colonIndex + 2),
          };
        }
        return { speaker: "Call", text: line };
      })
      .filter((entry: { text: string }) => entry.text.trim().length > 0);
  }

  return {
    timestamp: new Date().toISOString(),
    stepName: `Calling ${providerName}`,
    detail,
    status,
    transcript,
    // Store additional data for analysis phase
    callData: {
      callId: data.callId,
      duration: data.duration,
      transcript: data.transcript,
      structuredData: data.analysis?.structuredData,
    },
  };
}

/**
 * Gets the current status of the provider calling system
 */
export async function getCallingSystemStatus(): Promise<{
  kestraEnabled: boolean;
  vapiConfigured: boolean;
  activeMethod: string;
}> {
  try {
    const response = await fetch(`${API_BASE}/call/status`);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  } catch {
    return {
      kestraEnabled: false,
      vapiConfigured: false,
      activeMethod: "unknown",
    };
  }
}

/**
 * Recommendation from AI analysis
 */
export interface ProviderRecommendation {
  providerId: string;
  providerName: string;
  phone: string;
  rating?: number;
  reviewCount?: number;
  earliestAvailability: string;
  estimatedRate: string;
  score: number;
  reasoning: string;
  criteriaMatched?: string[];
  callQualityScore?: number;
  professionalismScore?: number;
}

/**
 * Response from recommend API
 */
export interface RecommendationsResponse {
  recommendations: ProviderRecommendation[];
  overallRecommendation: string;
  analysisNotes?: string;
  stats: {
    totalCalls: number;
    qualifiedProviders: number;
    disqualifiedProviders: number;
    failedCalls: number;
  };
}

/**
 * Get AI recommendations for top 3 providers based on call results
 */
export async function getProviderRecommendations(request: {
  callResults: Array<{
    status: string;
    callId?: string;
    duration?: number;
    transcript?: string;
    analysis?: {
      summary?: string;
      structuredData?: Record<string, unknown>;
    };
    provider?: {
      name: string;
      phone?: string;
    };
  }>;
  originalCriteria: string;
  serviceRequestId: string;
}): Promise<RecommendationsResponse | null> {
  try {
    const response = await fetch(`${API_BASE}/recommend`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("Recommend API error:", error);
      return null;
    }

    const result = await response.json();
    return result.data || result;
  } catch (error) {
    console.error("Failed to get recommendations:", error);
    return null;
  }
}
