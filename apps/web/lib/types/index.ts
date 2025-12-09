// Export database types
export type { Database, Tables, Enums } from "./database";

// Enums for client-side use (kept for backward compatibility)
export enum RequestStatus {
  PENDING = "PENDING",
  SEARCHING = "SEARCHING",
  CALLING = "CALLING",
  ANALYZING = "ANALYZING",
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
}

export interface InteractionLog {
  timestamp: string;
  stepName: string;
  detail: string;
  transcript?: { speaker: string; text: string }[];
  status: "success" | "warning" | "error" | "info";
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
}
