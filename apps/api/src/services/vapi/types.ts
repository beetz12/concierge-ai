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
  location: string;
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
  callMethod: "kestra" | "direct_vapi";
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

export interface KestraExecutionStatus {
  id: string;
  state: "CREATED" | "RUNNING" | "SUCCESS" | "FAILED" | "KILLED";
  outputs?: Record<string, unknown>;
}

export type UrgencyType = CallRequest["urgency"];
export type CallStatus = CallResult["status"];
export type CallMethod = CallResult["callMethod"];
export type AvailabilityStatus = StructuredCallData["availability"];
export type CallOutcome = StructuredCallData["call_outcome"];
