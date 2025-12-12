/**
 * Shared types for Research Agent system
 * Used by both Kestra and Direct Gemini research paths
 */

export interface ResearchRequest {
  service: string;
  location: string;
  daysNeeded?: number;
  minRating?: number;
  serviceRequestId?: string;

  // NEW fields for enhanced search
  coordinates?: { latitude: number; longitude: number };
  maxDistance?: number; // Maximum distance in miles
  requirePhone?: boolean; // Only return providers with phone
  minReviewCount?: number; // Minimum number of reviews
  maxResults?: number; // Maximum providers to return (default: 10)
  minEnrichedResults?: number; // Minimum providers with phone after enrichment (default: 3)
}

export interface ResearchResult {
  status: "success" | "partial" | "error";
  method: "kestra" | "direct_gemini" | "google_places" | "hybrid";
  providers: Provider[];
  reasoning?: string;
  error?: string;

  // NEW fields for result metadata
  totalFound?: number; // Total before filtering
  filteredCount?: number; // After filtering
}

export interface Provider {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  address?: string;
  reason?: string;
  source?: "kestra" | "gemini_maps" | "google_places" | "user_input" | "Google Maps" | "User Input";

  // NEW fields for comprehensive data
  reviewCount?: number; // Total number of reviews
  distance?: number; // Miles from user location
  distanceText?: string; // e.g., "2.3 miles"
  hoursOfOperation?: string[] | string; // e.g., ["Mon: 8am-6pm", "Tue: 8am-6pm"] or comma-joined string
  isOpenNow?: boolean; // Currently open
  placeId?: string; // Google Place ID for enrichment
  googleMapsUri?: string; // Direct link to Google Maps
  website?: string; // Business website
  internationalPhone?: string; // E.164 format phone
}

export interface SystemStatus {
  kestraEnabled: boolean;
  kestraUrl: string | null;
  kestraHealthy: boolean;
  geminiConfigured: boolean;
  activeResearchMethod: "kestra" | "direct_gemini";
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

export interface KestraResearchOutput {
  providers: Array<{
    name: string;
    phone?: string;
    rating?: number;
    reviewCount?: number;
    address?: string;
    hours?: string;
    reason?: string;
  }>;
  totalFound?: number;
  filteredCount?: number;
  count: number;
  location: string;
  service: string;
}
