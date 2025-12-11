/**
 * Provider Recommendation Service
 * Analyzes call results using Gemini 2.0 Flash to recommend top 3 providers
 */

import { GoogleGenAI } from "@google/genai";
import type {
  RecommendationRequest,
  RecommendationResponse,
  ProviderRecommendation,
  ScoringWeights,
} from "./types.js";
import { DEFAULT_SCORING_WEIGHTS } from "./types.js";
import type { CallResult } from "../vapi/types.js";

export class RecommendationService {
  private ai: GoogleGenAI;
  private model = "gemini-2.0-flash-exp";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate recommendations from call results
   */
  async generateRecommendations(
    request: RecommendationRequest,
    weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
  ): Promise<RecommendationResponse> {
    // Filter out disqualified, unavailable, and failed calls
    const qualifiedResults = this.filterQualifiedProviders(request.callResults);

    // Calculate stats
    const stats = {
      totalCalls: request.callResults.length,
      qualifiedProviders: qualifiedResults.length,
      disqualifiedProviders: request.callResults.filter(
        (r) => r.analysis.structuredData.disqualified
      ).length,
      failedCalls: request.callResults.filter((r) => r.status === "error" || r.status === "timeout").length,
    };

    // Handle edge case: no qualified providers
    if (qualifiedResults.length === 0) {
      return {
        recommendations: [],
        overallRecommendation:
          "Unfortunately, none of the providers were qualified based on the criteria. All providers were either unavailable, failed to answer, or did not meet the requirements.",
        analysisNotes:
          "Consider expanding your search criteria or trying additional providers.",
        stats,
      };
    }

    // Use Gemini to analyze and score providers
    const aiAnalysis = await this.analyzeWithGemini(
      qualifiedResults,
      request.originalCriteria,
      weights
    );

    return {
      ...aiAnalysis,
      stats,
    };
  }

  /**
   * Filter to only qualified providers
   */
  private filterQualifiedProviders(callResults: CallResult[]): CallResult[] {
    return callResults.filter((result) => {
      const structuredData = result.analysis.structuredData;

      // Filter out disqualified
      if (structuredData.disqualified) {
        return false;
      }

      // Filter out unavailable
      if (structuredData.availability === "unavailable") {
        return false;
      }

      // Filter out failed calls
      if (result.status === "error" || result.status === "timeout") {
        return false;
      }

      // Filter out voicemail/no answer
      if (result.status === "voicemail" || result.status === "no_answer") {
        return false;
      }

      return true;
    });
  }

  /**
   * Use Gemini AI to analyze call results and provide recommendations
   */
  private async analyzeWithGemini(
    qualifiedResults: CallResult[],
    originalCriteria: string,
    weights: ScoringWeights
  ): Promise<Omit<RecommendationResponse, "stats">> {
    const systemInstruction = `You are an expert service provider analyst. Your job is to analyze phone call results and recommend the TOP 3 providers based on multiple factors.

SCORING WEIGHTS:
- Availability/Urgency (${weights.availabilityUrgency * 100}%): Providers available sooner score higher
- Rate Competitiveness (${weights.rateCompetitiveness * 100}%): Lower/reasonable rates score higher
- All Criteria Met (${weights.allCriteriaMet * 100}%): Meeting all client requirements scores highest
- Call Quality (${weights.callQuality * 100}%): Positive, informative calls score higher
- Professionalism (${weights.professionalism * 100}%): Professional, clear communication scores higher

EVALUATION GUIDELINES:
- Availability: Immediate > 24hrs > 2 days > Flexible
- Rate: Consider competitiveness, clarity, and reasonableness
- Criteria: Providers meeting ALL criteria score highest
- Call Quality: Assess how informative and helpful the conversation was
- Professionalism: Evaluate courtesy, clarity, and responsiveness

Return EXACTLY 3 recommendations (or fewer if less than 3 qualified). Each should have:
- score: 0-100 (weighted total)
- reasoning: Clear explanation of why this provider scored as they did
- criteriaMatched: Array of specific criteria met
- callQualityScore: 0-100
- professionalismScore: 0-100

Also provide:
- overallRecommendation: Which provider to choose and why
- analysisNotes: Additional insights or considerations`;

    const prompt = `Analyze these call results and recommend the top 3 providers.

ORIGINAL CLIENT CRITERIA:
${originalCriteria}

CALL RESULTS:
${JSON.stringify(qualifiedResults, null, 2)}

Return your analysis in this JSON format:
{
  "recommendations": [
    {
      "providerName": "string",
      "phone": "string",
      "score": 95,
      "reasoning": "Detailed explanation of score",
      "criteriaMatched": ["criterion1", "criterion2"],
      "earliestAvailability": "Tomorrow at 2pm",
      "estimatedRate": "$150/hr",
      "callQualityScore": 90,
      "professionalismScore": 95
    }
  ],
  "overallRecommendation": "Provider X is the best choice because...",
  "analysisNotes": "Additional insights..."
}`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
        },
      });

      const data = JSON.parse(this.cleanJson(response.text || "{}"));

      // Validate and ensure we have at most 3 recommendations
      const recommendations: ProviderRecommendation[] = (
        data.recommendations || []
      )
        .slice(0, 3)
        .map((rec: any) => ({
          providerName: rec.providerName || "Unknown",
          phone: rec.phone || "",
          score: Math.min(100, Math.max(0, rec.score || 0)),
          reasoning: rec.reasoning || "No reasoning provided",
          criteriaMatched: rec.criteriaMatched || [],
          earliestAvailability: rec.earliestAvailability,
          estimatedRate: rec.estimatedRate,
          callQualityScore: Math.min(
            100,
            Math.max(0, rec.callQualityScore || 0)
          ),
          professionalismScore: Math.min(
            100,
            Math.max(0, rec.professionalismScore || 0)
          ),
        }));

      // Sort by score descending
      recommendations.sort((a, b) => b.score - a.score);

      return {
        recommendations,
        overallRecommendation:
          data.overallRecommendation ||
          "Unable to provide recommendation",
        analysisNotes: data.analysisNotes || "",
      };
    } catch (error) {
      console.error("Gemini analysis error:", error);

      // Fallback: Return basic recommendations without AI analysis
      return this.generateFallbackRecommendations(qualifiedResults);
    }
  }

  /**
   * Fallback recommendations if AI analysis fails
   */
  private generateFallbackRecommendations(
    qualifiedResults: CallResult[]
  ): Omit<RecommendationResponse, "stats"> {
    const recommendations: ProviderRecommendation[] = qualifiedResults
      .slice(0, 3)
      .map((result, index) => {
        const structuredData = result.analysis.structuredData;
        return {
          providerName: result.provider.name,
          phone: result.provider.phone,
          score: 70 - index * 5, // Simple descending score
          reasoning: `Provider ${index + 1}: ${structuredData.availability === "available" ? "Available" : "Status unclear"}. ${structuredData.all_criteria_met ? "Meets all criteria" : "Some criteria unclear"}.`,
          criteriaMatched: structuredData.all_criteria_met
            ? ["Availability confirmed"]
            : [],
          earliestAvailability: structuredData.earliest_availability,
          estimatedRate: structuredData.estimated_rate,
          callQualityScore: 70,
          professionalismScore: 70,
        };
      });

    return {
      recommendations,
      overallRecommendation:
        "AI analysis unavailable. Providers are listed in order of call success.",
      analysisNotes:
        "Recommendations generated using basic filtering. For detailed analysis, please retry.",
    };
  }

  /**
   * Clean JSON response from AI
   */
  private cleanJson(text: string): string {
    if (!text) return "{}";

    // Match JSON object or array
    const match = text.match(/(\{|\[)[\s\S]*(\}|\])/);
    if (match) {
      return match[0];
    }

    return text.replace(/```json/g, "").replace(/```/g, "").trim();
  }
}
