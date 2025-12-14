/**
 * Provider Recommendation Service
 * Uses deterministic multi-objective scoring combined with Gemini AI analysis
 *
 * Scoring Components (100 points max):
 * - Conversation Quality: 35 points
 * - Service Fit: 30 points
 * - Provider Reputation: 25 points
 * - Trust Signals: 10 points
 */

import { GoogleGenAI } from "@google/genai";
import type {
  RecommendationRequest,
  RecommendationResponse,
  ProviderRecommendation,
  ScoringWeights,
  CallResultWithMetadata,
} from "./types.js";
import { DEFAULT_SCORING_WEIGHTS } from "./types.js";
import type { StructuredCallData } from "../vapi/types.js";

export class RecommendationService {
  private ai: GoogleGenAI;
  private model = "gemini-2.5-flash";

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate recommendations from call results using deterministic scoring
   * Combined with Gemini AI for overall recommendation text
   */
  async generateRecommendations(
    request: RecommendationRequest,
    _weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS
  ): Promise<RecommendationResponse> {
    // Filter out disqualified, unavailable, and failed calls
    const qualifiedResults = this.filterQualifiedProviders(request.callResults);

    // Calculate stats
    const stats = {
      totalCalls: request.callResults.length,
      qualifiedProviders: qualifiedResults.length,
      disqualifiedProviders: request.callResults.filter(
        (r) => r.analysis?.structuredData?.disqualified
      ).length,
      failedCalls: request.callResults.filter(
        (r) => r.status === "error" || r.status === "timeout"
      ).length,
    };

    // Handle edge case: no qualified providers
    if (qualifiedResults.length === 0) {
      const noAnswerCount = request.callResults.filter((r) => {
        const callOutcome = r.analysis?.structuredData?.call_outcome;
        return callOutcome === "no_answer" || callOutcome === "voicemail";
      }).length;

      let emptyMessage =
        "Unfortunately, we couldn't find a qualified provider. ";
      if (noAnswerCount > 0) {
        emptyMessage += `${noAnswerCount} provider${noAnswerCount > 1 ? "s" : ""} didn't answer our calls. `;
      }
      emptyMessage +=
        "Please review the call logs for details, or try expanding your search criteria.";

      return {
        recommendations: [],
        overallRecommendation: emptyMessage,
        analysisNotes:
          "Consider expanding your search criteria or trying additional providers.",
        stats,
      };
    }

    // Generate deterministic scores for each qualified provider
    const scoredProviders = qualifiedResults.map((result) => {
      const structuredData = result.analysis.structuredData;
      const score = this.calculateScore(result, structuredData);
      const reasoning = this.buildReasoning(result, structuredData);

      const recommendation: ProviderRecommendation = {
        providerId: result.providerId,
        providerName: result.provider.name,
        phone: result.provider.phone,
        rating: result.rating,
        reviewCount: result.reviewCount,
        score,
        reasoning,
        criteriaMatched: structuredData.all_criteria_met
          ? ["All criteria met"]
          : structuredData.call_outcome === "positive"
            ? ["Positive response"]
            : [],
        earliestAvailability:
          structuredData.earliest_availability || "Contact for availability",
        estimatedRate: structuredData.estimated_rate || "Quote upon request",
      };

      return recommendation;
    });

    // Sort by score descending and take top 3
    const recommendations = scoredProviders
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    // Generate overall recommendation text
    const overallRecommendation = this.buildOverallRecommendation(recommendations);

    // Use Gemini AI for additional analysis notes (optional enhancement)
    const analysisNotes = await this.generateAnalysisNotes(
      recommendations,
      request.originalCriteria
    );

    return {
      recommendations,
      overallRecommendation,
      analysisNotes,
      stats,
    };
  }

  /**
   * Filter to only qualified providers (hard filters)
   */
  private filterQualifiedProviders(
    callResults: CallResultWithMetadata[]
  ): CallResultWithMetadata[] {
    return callResults.filter((result) => {
      const structuredData = result.analysis?.structuredData;

      // Require valid structuredData with call_outcome (proves we reached them)
      if (!structuredData || typeof structuredData !== 'object' || !structuredData.call_outcome) {
        console.log(`[Filter] Excluding ${result.provider.name}: no/invalid structured data or missing call_outcome`);
        return false;
      }

      // Only recommend providers from completed calls
      // This single check handles error, timeout, voicemail, no_answer, etc.
      if (result.status !== "completed") {
        console.log(`[Filter] Excluding ${result.provider.name}: call not completed (status: ${result.status})`);
        return false;
      }

      // Filter by call outcome (voicemail/no_answer in structured data)
      const callOutcome = structuredData.call_outcome;
      if (
        callOutcome === "no_answer" ||
        callOutcome === "voicemail"
      ) {
        console.log(`[Filter] Excluding ${result.provider.name}: ${callOutcome}`);
        return false;
      }

      // Filter out explicitly disqualified
      if (structuredData.disqualified) {
        console.log(
          `[Filter] Excluding ${result.provider.name}: disqualified - ${structuredData.disqualification_reason}`
        );
        return false;
      }

      return true;
    });
  }

  /**
   * Deterministic multi-objective scoring (100 points max)
   *
   * Components:
   * - Conversation Quality: 35 points
   * - Service Fit: 30 points
   * - Provider Reputation: 25 points
   * - Trust Signals: 10 points
   */
  private calculateScore(
    result: CallResultWithMetadata,
    data: StructuredCallData
  ): number {
    let score = 0;

    // === CONVERSATION QUALITY (35 points max) ===
    // Did they actually answer and engage positively?
    if (data.call_outcome === "positive") {
      score += 20;
    } else if (data.call_outcome === "neutral") {
      score += 10;
    }
    // Gave specific availability info?
    if (data.earliest_availability && data.earliest_availability !== "unknown") {
      score += 8;
    }
    // Provided pricing info?
    if (
      data.estimated_rate &&
      data.estimated_rate !== "unknown" &&
      data.estimated_rate !== "Quote upon request"
    ) {
      score += 7;
    }

    // === SERVICE FIT (30 points max) ===
    // Meets ALL user requirements?
    if (data.all_criteria_met) {
      score += 20;
    }
    // Availability status
    if (data.availability === "available") {
      score += 7;
    } else if (data.availability === "callback_requested") {
      score += 3;
    }
    // Found dedicated person with all skills?
    if (data.single_person_found) {
      score += 3;
    }

    // === PROVIDER REPUTATION (25 points max) ===
    // Google rating (0-20 points based on 5-star scale)
    const rating = result.rating || 0;
    if (rating >= 4.5) {
      score += 20;
    } else if (rating >= 4.0) {
      score += 16;
    } else if (rating >= 3.5) {
      score += 12;
    } else if (rating >= 3.0) {
      score += 8;
    } else if (rating > 0) {
      score += 4;
    }
    // Review volume (0-5 points) - more reviews = more trust
    const reviews = result.reviewCount || 0;
    if (reviews >= 100) {
      score += 5;
    } else if (reviews >= 50) {
      score += 4;
    } else if (reviews >= 20) {
      score += 3;
    } else if (reviews >= 10) {
      score += 2;
    } else if (reviews > 0) {
      score += 1;
    }

    // === TRUST SIGNALS (10 points max) ===
    // AI recommended this provider?
    if (data.recommended) {
      score += 10;
    }

    return Math.min(Math.round(score), 100);
  }

  /**
   * Build personalized reasoning from actual call data
   */
  private buildReasoning(
    result: CallResultWithMetadata,
    data: StructuredCallData
  ): string {
    const parts: string[] = [];

    // 1. Lead with criteria match (most important to user)
    if (data.all_criteria_met) {
      parts.push("✓ Meets all your requirements");
    } else if (data.call_outcome === "positive") {
      parts.push("Positive conversation");
    }

    // 2. Availability specifics (actionable info)
    if (data.earliest_availability && data.earliest_availability !== "unknown") {
      parts.push(`Available: ${data.earliest_availability}`);
    } else if (data.availability === "available") {
      parts.push("Available now");
    }

    // 3. Trust signals: Rating + reviews
    if (result.rating && result.rating >= 3.5) {
      const reviewText = result.reviewCount
        ? ` (${result.reviewCount} reviews)`
        : "";
      parts.push(`${result.rating}★${reviewText}`);
    }

    // 4. Pricing transparency
    if (
      data.estimated_rate &&
      data.estimated_rate !== "unknown" &&
      data.estimated_rate !== "Quote upon request" &&
      data.estimated_rate !== ""
    ) {
      parts.push(`Quoted: ${data.estimated_rate}`);
    }

    // 5. AI-generated insight from actual conversation (call summary)
    const summary = result.analysis?.summary;
    if (summary && summary.length > 10) {
      // Skip summaries focused on the user's request
      const isUserFocused =
        summary.toLowerCase().includes("information gathered for") ||
        summary.toLowerCase().includes("looking for") ||
        summary.toLowerCase().includes("here's the summary");

      if (!isUserFocused) {
        // Extract first meaningful sentence for key insight
        const sentences = summary
          .split(/[.!?]+/)
          .filter((s) => s.trim().length > 10);
        if (sentences[0]) {
          const insight = sentences[0].trim();
          // Avoid duplicating info already shown
          if (
            !insight.toLowerCase().includes("available") &&
            !insight.toLowerCase().includes("rating")
          ) {
            parts.push(insight);
          }
        }
      }
    }

    return parts.length > 0
      ? parts.join(" • ")
      : "Provider contacted successfully";
  }

  /**
   * Build professional overall recommendation text
   */
  private buildOverallRecommendation(
    recommendations: ProviderRecommendation[]
  ): string {
    if (recommendations.length === 0) {
      return "Unfortunately, we couldn't find a qualified provider. Please review the call logs for details.";
    }

    const topProvider = recommendations[0]!; // Safe: length > 0
    const topScore = topProvider.score;
    const topName = topProvider.providerName;

    if (recommendations.length === 1) {
      return `Based on our research and phone calls, we recommend **${topName}** (Score: ${topScore}/100). They were the only provider who answered and could meet your needs.`;
    }

    const scoreDiff = topScore - (recommendations[1]?.score || 0);
    if (scoreDiff >= 15) {
      return `Based on our research and phone calls, we strongly recommend **${topName}** (Score: ${topScore}/100). They significantly outperformed other options in availability, service fit, and reputation.`;
    }

    return `Based on our research and phone calls, we recommend **${topName}** (Score: ${topScore}/100) as your top choice. We've included ${recommendations.length - 1} alternative${recommendations.length > 2 ? "s" : ""} for comparison.`;
  }

  /**
   * Generate analysis notes using Gemini AI (optional enhancement)
   */
  private async generateAnalysisNotes(
    recommendations: ProviderRecommendation[],
    originalCriteria: string
  ): Promise<string> {
    if (recommendations.length === 0) {
      return "No qualified providers to analyze.";
    }

    try {
      const prompt = `Given these provider recommendations for a service request, provide 1-2 brief analysis notes (max 100 words total) with additional insights:

ORIGINAL CRITERIA: ${originalCriteria}

TOP PROVIDERS:
${recommendations.map((r, i) => `${i + 1}. ${r.providerName} - Score: ${r.score}/100, ${r.reasoning}`).join("\n")}

Focus on: pricing comparison, timing considerations, or any notable differences. Be concise.`;

      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          maxOutputTokens: 150,
        },
      });

      return response.text || "Analysis complete.";
    } catch (error) {
      console.error("Error generating analysis notes:", error);
      return "Recommendations generated using multi-objective scoring based on call quality, service fit, and provider reputation.";
    }
  }

}
