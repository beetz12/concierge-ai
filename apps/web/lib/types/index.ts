// Export database types
export type { Database, Tables, Enums } from "./database";

// Enums for client-side use (kept for backward compatibility)
export enum RequestStatus {
  PENDING = "PENDING",
  SEARCHING = "SEARCHING",
  CALLING = "CALLING",
  ANALYZING = "ANALYZING",
  RECOMMENDED = "RECOMMENDED", // Recommendations generated, awaiting user selection
  BOOKING = "BOOKING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

export enum RequestType {
  RESEARCH_AND_BOOK = "RESEARCH_AND_BOOK",
  DIRECT_TASK = "DIRECT_TASK",
}

// Client-side interfaces (kept for backward compatibility with localStorage)
export interface Provider {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  address?: string;
  source?: "Google Maps" | "User Input";
  // Call tracking
  callStatus?: string;
  callResult?: {
    availability?: string;
    estimated_rate?: string;
    all_criteria_met?: boolean;
    earliest_availability?: string;
    disqualified?: boolean;
    disqualification_reason?: string;
    call_outcome?: string;
    notes?: string;
  };
  callTranscript?: string;
  callSummary?: string;
  callDurationMinutes?: number;
  calledAt?: string;
  // Research data
  reviewCount?: number;
  distance?: number;
  distanceText?: string;
  hoursOfOperation?: string[];
  isOpenNow?: boolean;
  googleMapsUri?: string;
  website?: string;
  placeId?: string;
  // Booking confirmation
  booking_confirmed?: boolean;
  booking_date?: string;
  booking_time?: string;
  confirmation_number?: string;
}

export interface InteractionLog {
  id?: string;
  timestamp: string;
  stepName: string;
  detail: string;
  transcript?: { speaker: string; text: string }[];
  status: "success" | "warning" | "error" | "info";
  providerName?: string;
  providerId?: string;
  /** Optional call data from real VAPI calls (when LIVE_CALL_ENABLED=true) */
  callData?: {
    callId?: string;
    duration?: number;
    transcript?: string;
    structuredData?: Record<string, unknown>;
  };
}

export interface ServiceRequest {
  id: string;
  type: RequestType;
  title: string;
  description: string;
  criteria: string;
  location?: string;
  status: RequestStatus;
  createdAt: string;
  providersFound: Provider[];
  interactions: InteractionLog[];
  selectedProvider?: Provider | null;
  finalOutcome?: string;
  directContactInfo?: {
    name: string;
    phone: string;
  };
  preferredContact?: "phone" | "text";
  userPhone?: string;
  notificationSentAt?: string;
}

/**
 * Safely converts a database status value to a RequestStatus enum.
 * Falls back to PENDING if the value is null, undefined, or invalid.
 *
 * @param status - The status value from the database
 * @returns A valid RequestStatus enum value
 */
export function safeRequestStatus(status: unknown): RequestStatus {
  if (typeof status !== "string" || !status) {
    console.warn(
      `[safeRequestStatus] Invalid status value: ${status}, defaulting to PENDING`
    );
    return RequestStatus.PENDING;
  }

  const upperStatus = status.toUpperCase();
  if (upperStatus in RequestStatus) {
    return RequestStatus[upperStatus as keyof typeof RequestStatus];
  }

  console.warn(
    `[safeRequestStatus] Unknown status value: ${status}, defaulting to PENDING`
  );
  return RequestStatus.PENDING;
}
