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
}

export interface ResearchResult {
  status: 'success' | 'error';
  method: 'kestra' | 'direct_gemini';
  providers: Provider[];
  reasoning?: string;
  error?: string;
}

export interface WorkflowStatus {
  kestraEnabled: boolean;
  kestraUrl: string | null;
  kestraHealthy: boolean;
  geminiConfigured: boolean;
  activeResearchMethod: 'kestra' | 'direct_gemini';
}

/**
 * Search for providers using the workflow API
 * Automatically uses Kestra or direct Gemini based on availability
 */
export async function searchProviders(request: ResearchRequest): Promise<ResearchResult> {
  const response = await fetch('/api/v1/workflows/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  });

  if (!response.ok) {
    throw new Error(`Research failed: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data;
}

/**
 * Get workflow system status
 */
export async function getWorkflowStatus(): Promise<WorkflowStatus> {
  const response = await fetch('/api/v1/workflows/status');
  if (!response.ok) {
    throw new Error(`Status check failed: ${response.statusText}`);
  }
  return response.json();
}
