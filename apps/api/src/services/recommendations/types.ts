/**
 * Types for the AI-powered provider recommendation system
 */

import type { CallResult } from "../vapi/types.js";

/**
 * Extended CallResult with provider metadata from database
 * Used for scoring with Google rating/reviews
 */
export interface CallResultWithMetadata extends CallResult {
  providerId?: string; // Database UUID
  rating?: number; // Google rating (0-5)
  reviewCount?: number; // Number of Google reviews
}

export interface RecommendationRequest {
  callResults: CallResultWithMetadata[];
  originalCriteria: string;
  serviceRequestId: string;
}

export interface ProviderRecommendation {
  providerId?: string; // Database UUID
  providerName: string;
  phone: string;
  rating?: number; // Google rating (0-5)
  reviewCount?: number; // Number of Google reviews
  score: number; // 0-100 (multi-objective score)
  reasoning: string; // Human-readable explanation
  criteriaMatched: string[];
  earliestAvailability?: string;
  estimatedRate?: string;
  // Legacy fields (kept for backward compatibility)
  callQualityScore?: number;
  professionalismScore?: number;
}

export interface RecommendationResponse {
  recommendations: ProviderRecommendation[]; // Top 3 providers
  overallRecommendation: string; // Summary of which provider to choose
  analysisNotes: string; // Additional insights from AI analysis
  stats: {
    totalCalls: number;
    qualifiedProviders: number;
    disqualifiedProviders: number;
    failedCalls: number;
  };
}

export interface ScoringWeights {
  availabilityUrgency: number; // 30% - sooner is better
  rateCompetitiveness: number; // 20%
  allCriteriaMet: number; // 25%
  callQuality: number; // 15%
  professionalism: number; // 10%
}

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  availabilityUrgency: 0.3,
  rateCompetitiveness: 0.2,
  allCriteriaMet: 0.25,
  callQuality: 0.15,
  professionalism: 0.1,
};
