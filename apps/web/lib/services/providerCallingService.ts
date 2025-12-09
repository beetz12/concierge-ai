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
 * Request payload for calling a provider
 */
export interface CallProviderRequest {
  providerName: string;
  providerPhone: string; // Must be E.164 format (+1XXXXXXXXXX)
  serviceNeeded: string;
  userCriteria: string;
  location: string;
  urgency: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
  serviceRequestId?: string;
  providerId?: string;
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
  try {
    const response = await fetch(`${API_BASE}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: result.error || `API error: ${response.status}`,
      };
    }

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
    return {
      success: false,
      error: errorMessage,
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

  if (data.status === "completed") {
    const structuredData = data.analysis?.structuredData as Record<string, unknown> | undefined;

    // Check if provider was disqualified
    if (structuredData?.disqualified) {
      status = "warning";
      detail = `${providerName} was disqualified: ${structuredData.disqualification_reason || "Does not meet criteria"}`;
    } else if (structuredData?.all_criteria_met === false) {
      status = "warning";
      detail = `${providerName}: ${data.analysis?.summary || "Does not meet all criteria"}`;
    } else {
      // Successful call with matching criteria
      const availability = structuredData?.earliest_availability || structuredData?.availability;
      const rate = structuredData?.estimated_rate;
      detail = `${providerName}: ${data.analysis?.summary || "Call completed successfully"}`;
      if (availability) detail += ` Available: ${availability}.`;
      if (rate) detail += ` Rate: ${rate}.`;
    }
  } else if (data.status === "no_answer" || data.endedReason === "no-answer") {
    status = "warning";
    detail = `${providerName}: No answer - call went unanswered`;
  } else if (data.status === "voicemail") {
    status = "warning";
    detail = `${providerName}: Reached voicemail`;
  } else if (data.status === "failed" || data.status === "error") {
    status = "error";
    detail = `${providerName}: Call failed - ${data.error || data.endedReason || "Unknown error"}`;
  } else {
    status = "warning";
    detail = `${providerName}: ${data.analysis?.summary || `Call ended: ${data.endedReason || "Unknown reason"}`}`;
  }

  return {
    timestamp: new Date().toISOString(),
    stepName: `Calling ${providerName}`,
    detail,
    status,
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
