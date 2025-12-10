/**
 * Workflow Service
 * Client for the unified workflow API with Kestra/Direct fallback
 */

// Types
export interface ResearchRequest {
  service: string;
  location: string;
  daysNeeded?: number;
  minRating?: number;
  serviceRequestId?: string;
}

export interface Provider {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  address?: string;
  reason?: string;
  source?: string;
  // Google Places enrichment data
  placeId?: string;
  reviewCount?: number;
  distance?: number;
  distanceText?: string;
  hoursOfOperation?: string[] | string;
  isOpenNow?: boolean;
  googleMapsUri?: string;
  website?: string;
  internationalPhone?: string;
}

export interface ResearchResult {
  status: "success" | "error";
  method: "kestra" | "direct_gemini";
  providers: Provider[];
  reasoning?: string;
  error?: string;
}

export interface WorkflowStatus {
  kestraEnabled: boolean;
  kestraUrl: string | null;
  kestraHealthy: boolean;
  geminiConfigured: boolean;
  activeResearchMethod: "kestra" | "direct_gemini";
}

/**
 * Search for providers using the workflow API
 * Automatically uses Kestra or direct Gemini based on availability
 */
export async function searchProviders(
  request: ResearchRequest,
): Promise<ResearchResult> {
  const response = await fetch("/api/v1/workflows/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  // Check response.ok BEFORE parsing JSON to handle non-JSON error responses
  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: `Research failed: ${response.status}` }));
    throw new Error(errorData.message || `Research failed: ${response.status}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Get workflow system status
 */
export async function getWorkflowStatus(): Promise<WorkflowStatus> {
  const response = await fetch("/api/v1/workflows/status");

  // Check response.ok BEFORE parsing JSON to handle non-JSON error responses
  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: `Status check failed: ${response.status}` }));
    throw new Error(
      errorData.message || `Status check failed: ${response.status}`,
    );
  }

  return response.json();
}
