/**
 * Types for the AI-powered provider recommendation system
 */

import type { CallResult } from "../vapi/types.js";

export interface RecommendationRequest {
  callResults: CallResult[];
  originalCriteria: string;
  serviceRequestId: string;
}

export interface ProviderRecommendation {
  providerName: string;
  phone: string;
  score: number; // 0-100
  reasoning: string;
  criteriaMatched: string[];
  earliestAvailability?: string;
  estimatedRate?: string;
  callQualityScore: number; // How well the call went (0-100)
  professionalismScore: number; // Professionalism assessment (0-100)
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
