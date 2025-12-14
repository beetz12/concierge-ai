/**
 * Shared types for VAPI provider calling system
 * Used by both Kestra and Direct VAPI paths
 */

import type { GeneratedPrompt } from "../direct-task/types.js";

export interface CallRequest {
  providerName: string;
  providerPhone: string; // E.164 format: +1XXXXXXXXXX
  serviceNeeded: string;
  userCriteria: string;
  problemDescription?: string; // Detailed problem description
  clientName?: string; // Client's name for personalized greeting
  location: string; // City/state (backward compatible)
  clientAddress?: string; // Full street address for VAPI prompts
  urgency: "immediate" | "within_24_hours" | "within_2_days" | "flexible";
  serviceRequestId?: string; // For DB linking
  providerId?: string; // For DB linking
  customPrompt?: GeneratedPrompt; // Optional Gemini-generated dynamic prompt for Direct Tasks
}

// Re-export GeneratedPrompt for convenience
export type { GeneratedPrompt } from "../direct-task/types.js";

export interface CallResult {
  status: "completed" | "timeout" | "error" | "no_answer" | "voicemail";
  callId: string;
  callMethod: "kestra" | "direct_vapi" | "simulated";
  duration: number; // minutes
  endedReason: string;
  transcript: string;
  analysis: {
    summary: string;
    structuredData: StructuredCallData;
    successEvaluation: string;
  };
  provider: {
    name: string;
    phone: string;
    service: string;
    location: string;
  };
  request: {
    criteria: string;
    urgency: string;
  };
  cost?: number;
  error?: string;
  // Data enrichment status - indicates if complete data has been fetched from VAPI API
  dataStatus?: "partial" | "complete" | "fetching" | "fetch_failed";
  webhookReceivedAt?: string; // ISO timestamp when webhook was received
  fetchedAt?: string; // ISO timestamp when REST API fetch completed
  fetchAttempts?: number; // Number of fetch attempts made
  fetchError?: string; // Error message if fetch failed
  // Structured conversation messages from VAPI
  messages?: Array<{
    role: string;
    message: string;
    time?: number;
  }>;
}

export interface StructuredCallData {
  availability: "available" | "unavailable" | "callback_requested" | "unclear";
  earliest_availability?: string; // Specific date/time when provider can come (e.g., "Tomorrow at 2pm")
  estimated_rate: string;
  single_person_found: boolean;
  technician_name?: string;
  all_criteria_met: boolean;
  criteria_details?: Record<string, boolean>;
  call_outcome: "positive" | "negative" | "neutral" | "no_answer" | "voicemail";
  recommended: boolean;
  disqualified?: boolean;
  disqualification_reason?: string;
  notes?: string;
}

export interface KestraExecutionState {
  current: "CREATED" | "RUNNING" | "SUCCESS" | "FAILED" | "KILLED";
  histories?: Array<{ state: string; date: string }>;
  duration?: string;
  startDate?: string;
  endDate?: string;
}

export interface KestraExecutionStatus {
  id: string;
  state: KestraExecutionState;
  outputs?: Record<string, unknown>;
}

export type UrgencyType = CallRequest["urgency"];
export type CallStatus = CallResult["status"];
export type CallMethod = CallResult["callMethod"];
export type AvailabilityStatus = StructuredCallData["availability"];
export type CallOutcome = StructuredCallData["call_outcome"];

/**
 * Factory function to create standardized error results
 * Used by both Direct VAPI and Kestra paths for consistent error handling
 */
export function createErrorResult(
  error: Error | string,
  request: Partial<CallRequest>,
  callMethod: CallMethod
): CallResult {
  const errorMessage = error instanceof Error ? error.message : error;
  return {
    status: "error",
    callId: "",
    callMethod,
    duration: 0,
    endedReason: errorMessage,
    transcript: "",
    analysis: {
      summary: "",
      structuredData: {
        availability: "unclear",
        earliest_availability: "",
        estimated_rate: "",
        single_person_found: false,
        all_criteria_met: false,
        criteria_details: {},
        disqualified: true,
        disqualification_reason: errorMessage,
        call_outcome: "negative",
        recommended: false,
        notes: errorMessage,
      },
      successEvaluation: "",
    },
    provider: {
      name: request.providerName || "Unknown",
      phone: request.providerPhone || "",
      service: request.serviceNeeded || "",
      location: request.location || "",
    },
    request: {
      criteria: request.userCriteria || "",
      urgency: request.urgency || "flexible",
    },
    error: errorMessage,
  };
}
