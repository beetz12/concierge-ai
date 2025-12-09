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
}

export interface ResearchResult {
  status: 'success' | 'error';
  method: 'kestra' | 'direct_gemini';
  providers: Provider[];
  reasoning?: string;
  error?: string;
}

export interface Provider {
  id: string;
  name: string;
  phone?: string;
  rating?: number;
  address?: string;
  reason?: string;
  source?: 'kestra' | 'gemini_maps' | 'user_input';
}

export interface SystemStatus {
  kestraEnabled: boolean;
  kestraUrl: string | null;
  kestraHealthy: boolean;
  geminiConfigured: boolean;
  activeResearchMethod: 'kestra' | 'direct_gemini';
}

export interface KestraExecutionStatus {
  id: string;
  state: 'CREATED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'KILLED';
  outputs?: Record<string, unknown>;
}

export interface KestraResearchOutput {
  providers: Array<{
    name: string;
    phone?: string;
    rating?: number;
    address?: string;
    reason?: string;
  }>;
  count: number;
  location: string;
  service: string;
}
