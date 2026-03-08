/**
 * Provider Recommendation Service
 * Uses deterministic multi-objective scoring combined with Gemini AI analysis
 *
 * Scoring Components (100 points max):
 *
 * SIMPLE MODE (VAPI_ADVANCED_SCREENING=false):
 * - Conversation Quality: 35 points
 * - Service Fit: 30 points
 * - Provider Reputation: 25 points
 * - Trust Signals: 10 points
 *
 * ADVANCED MODE (VAPI_ADVANCED_SCREENING=true):
 * - Conversation Quality: 25 points
 * - Service Fit: 25 points
 * - Provider Reputation: 15 points
 * - Trust Signals: 5 points
 * - Provider Qualifications: 30 points (NEW - from screening answers)
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
import type { StructuredCallData, ScreeningAnswer } from "../vapi/types.js";

/**
 * Check if advanced screening mode is enabled
 */
function isAdvancedScreeningEnabled(): boolean {
  return process.env.VAPI_ADVANCED_SCREENING === "true";
}

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
        providerIntel: result.providerIntel,
        identityConfidence: result.providerIntel?.identityConfidence,
        tradeClass: result.providerIntel?.tradeClass,
        tradeFit: result.providerIntel?.tradeFit,
        positiveThemes:
          result.providerIntel?.positiveThemes?.map((theme) => theme.theme) ?? [],
        negativeThemes:
          result.providerIntel?.negativeThemes?.map((theme) => theme.theme) ?? [],
        contradictionNotes:
          result.providerIntel?.contradictionNotes?.map((note) => note.summary) ?? [],
        seriousComplaintCount:
          result.providerIntel?.seriousComplaints?.length ?? 0,
        reputationSourcePlatforms:
          result.providerIntel?.reputationSources?.map((source) => source.platform) ?? [],
      };

      return recommendation;
    });

    const decisionReadyProviders = scoredProviders.filter((recommendation) =>
      this.isDecisionReadyRecommendation(recommendation),
    );

    const shortlistPool =
      decisionReadyProviders.length > 0 ? decisionReadyProviders : scoredProviders;

    const originalOrder = new Map(
      shortlistPool.map((recommendation, index) => [
        recommendation.providerId ?? recommendation.providerName,
        index,
      ]),
    );

    // Sort by score descending and take top 3
    const recommendations = shortlistPool
      .sort((a, b) => {
        const tieBreakerDiff =
          this.calculateTieBreaker(b) - this.calculateTieBreaker(a);
        if (tieBreakerDiff !== 0) {
          return tieBreakerDiff;
        }

        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) {
          return scoreDiff;
        }

        return (
          (originalOrder.get(a.providerId ?? a.providerName) ?? Number.MAX_SAFE_INTEGER) -
          (originalOrder.get(b.providerId ?? b.providerName) ?? Number.MAX_SAFE_INTEGER)
        );
      })
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
   * SIMPLE MODE (VAPI_ADVANCED_SCREENING=false):
   * - Conversation Quality: 35 points
   * - Service Fit: 30 points
   * - Provider Reputation: 25 points
   * - Trust Signals: 10 points
   *
   * ADVANCED MODE (VAPI_ADVANCED_SCREENING=true):
   * - Conversation Quality: 25 points
   * - Service Fit: 25 points
   * - Provider Reputation: 15 points
   * - Trust Signals: 5 points
   * - Provider Qualifications: 30 points (from screening answers)
   */
  private calculateScore(
    result: CallResultWithMetadata,
    data: StructuredCallData
  ): number {
    const advancedMode = isAdvancedScreeningEnabled();
    let score = 0;

    // === CONVERSATION QUALITY (35 points simple / 25 points advanced) ===
    // Did they actually answer and engage positively?
    const outcomePoints = advancedMode ? 14 : 20;
    const neutralPoints = advancedMode ? 7 : 10;
    if (data.call_outcome === "positive") {
      score += outcomePoints;
    } else if (data.call_outcome === "neutral") {
      score += neutralPoints;
    }
    // Gave specific availability info?
    const availInfoPoints = advancedMode ? 6 : 8;
    if (data.earliest_availability && data.earliest_availability !== "unknown") {
      score += availInfoPoints;
    }
    // Provided pricing info?
    const pricingPoints = advancedMode ? 5 : 7;
    if (
      data.estimated_rate &&
      data.estimated_rate !== "unknown" &&
      data.estimated_rate !== "Quote upon request"
    ) {
      score += pricingPoints;
    }

    // === SERVICE FIT (30 points simple / 25 points advanced) ===
    // Meets ALL user requirements?
    const criteriaPoints = advancedMode ? 15 : 20;
    if (data.all_criteria_met) {
      score += criteriaPoints;
    }
    // Availability status
    const availStatusPoints = advancedMode ? 5 : 7;
    const callbackPoints = advancedMode ? 2 : 3;
    if (data.availability === "available") {
      score += availStatusPoints;
    } else if (data.availability === "callback_requested") {
      score += callbackPoints;
    }
    // Found dedicated person with all skills?
    const singlePersonPoints = advancedMode ? 5 : 3;
    if (data.single_person_found) {
      score += singlePersonPoints;
    }

    // === PROVIDER REPUTATION (25 points simple / 15 points advanced) ===
    // Google rating (tiered points based on 5-star scale)
    const rating = result.rating || 0;
    const ratingTiers = advancedMode
      ? { tier1: 12, tier2: 10, tier3: 7, tier4: 5, tier5: 2 }
      : { tier1: 20, tier2: 16, tier3: 12, tier4: 8, tier5: 4 };
    if (rating >= 4.5) {
      score += ratingTiers.tier1;
    } else if (rating >= 4.0) {
      score += ratingTiers.tier2;
    } else if (rating >= 3.5) {
      score += ratingTiers.tier3;
    } else if (rating >= 3.0) {
      score += ratingTiers.tier4;
    } else if (rating > 0) {
      score += ratingTiers.tier5;
    }
    // Review volume (tiered points) - more reviews = more trust
    const reviews = result.reviewCount || 0;
    const reviewTiers = advancedMode
      ? { tier1: 3, tier2: 2, tier3: 2, tier4: 1, tier5: 1 }
      : { tier1: 5, tier2: 4, tier3: 3, tier4: 2, tier5: 1 };
    if (reviews >= 100) {
      score += reviewTiers.tier1;
    } else if (reviews >= 50) {
      score += reviewTiers.tier2;
    } else if (reviews >= 20) {
      score += reviewTiers.tier3;
    } else if (reviews >= 10) {
      score += reviewTiers.tier4;
    } else if (reviews > 0) {
      score += reviewTiers.tier5;
    }

    // === TRUST SIGNALS (10 points simple / 5 points advanced) ===
    // AI recommended this provider?
    const recommendedPoints = advancedMode ? 5 : 10;
    if (data.recommended) {
      score += recommendedPoints;
    }

    // === PROVIDER QUALIFICATIONS (0 points simple / 30 points advanced) ===
    // Based on screening answer quality (only in advanced mode)
    if (advancedMode && data.screening_answers && data.screening_answers.length > 0) {
      score += this.calculateScreeningScore(data.screening_answers);
    }

    // === PROVIDER-INTEL ADJUSTMENTS (layered on top, capped into final 0-100) ===
    score += this.calculateProviderIntelAdjustment(result);

    return Math.min(Math.round(score), 100);
  }

  private calculateProviderIntelAdjustment(
    result: CallResultWithMetadata,
  ): number {
    const intel = result.providerIntel;
    if (!intel) {
      return 0;
    }

    let adjustment = 0;

    if (intel.tradeFit === "high") adjustment += 8;
    if (intel.tradeFit === "medium") adjustment += 3;
    if (intel.tradeFit === "low") adjustment -= 10;

    if (intel.identityConfidence === "high") adjustment += 6;
    if (intel.identityConfidence === "medium") adjustment += 2;
    if (intel.identityConfidence === "low") adjustment -= 10;

    const platformCount = new Set(
      intel.reputationSources?.map((source) => source.platform) ?? [],
    ).size;
    adjustment += Math.min(platformCount, 3) * 2;

    const positiveThemeCount = intel.positiveThemes?.length ?? 0;
    adjustment += Math.min(positiveThemeCount, 3) * 2;

    const negativeThemes = intel.negativeThemes?.map((theme) => theme.theme) ?? [];
    const negativeThemeCount = negativeThemes.length;
    adjustment -= Math.min(negativeThemeCount, 2) * 3;

    if (negativeThemes.some((theme) => /thin review volume/i.test(theme))) {
      adjustment -= 8;
    }

    if (negativeThemes.some((theme) => /self-promotional/i.test(theme))) {
      adjustment -= 10;
    }

    const contradictionPenalty = intel.contradictionNotes?.reduce((sum, note) => {
      if (note.severity === "high") return sum + 12;
      if (note.severity === "medium") return sum + 8;
      return sum + 3;
    }, 0) ?? 0;
    adjustment -= contradictionPenalty;

    const seriousComplaintPenalty = intel.seriousComplaints?.reduce(
      (sum, complaint) => sum + (complaint.repeated ? 6 : 3),
      0,
    ) ?? 0;
    adjustment -= seriousComplaintPenalty;

    const reviews = result.reviewCount ?? 0;
    if (reviews > 0 && reviews <= 2) {
      adjustment -= 10;
    } else if (reviews <= 5) {
      adjustment -= 6;
    }

    if (platformCount === 0 && reviews < 5) {
      adjustment -= 4;
    }

    return adjustment;
  }

  private calculateTieBreaker(
    recommendation: ProviderRecommendation,
  ): number {
    let score = 0;

    if (recommendation.tradeFit === "high") score += 8;
    if (recommendation.tradeFit === "medium") score += 3;
    if (recommendation.tradeFit === "low") score -= 8;

    if (recommendation.identityConfidence === "high") score += 6;
    if (recommendation.identityConfidence === "medium") score += 2;
    if (recommendation.identityConfidence === "low") score -= 8;

    score += (recommendation.rating ?? 0) * 4;
    score += Math.min(recommendation.reviewCount ?? 0, 100) / 4;
    score += Math.min(recommendation.reputationSourcePlatforms?.length ?? 0, 3) * 3;

    return score;
  }

  private isDecisionReadyRecommendation(
    recommendation: ProviderRecommendation,
  ): boolean {
    const reviewCount = recommendation.reviewCount ?? 0;
    const hasExternalSources =
      (recommendation.reputationSourcePlatforms?.length ?? 0) > 0;
    const hasThinEvidence = recommendation.negativeThemes?.some((theme) =>
      /thin review volume/i.test(theme),
    );

    if (recommendation.tradeFit === "low") {
      return false;
    }

    if (reviewCount < 3 && !hasExternalSources) {
      return false;
    }

    if (hasThinEvidence && reviewCount < 10 && !hasExternalSources) {
      return false;
    }

    return true;
  }

  /**
   * Calculate screening score from advanced screening answers (30 points max)
   *
   * Categories (6 points each, 5 categories = 30 points max):
   * - Experience: Years in business, specialization
   * - Licensing: Licenses, insurance, certifications
   * - Warranty: Guarantees, callbacks, satisfaction policies
   * - Methods: Techniques, equipment, diagnostic process
   * - References: Reviews, portfolio, references
   *
   * Quality scoring per answer:
   * - excellent: 6 points (impressive, specific credentials)
   * - good: 4 points (clear positive answer)
   * - adequate: 2 points (acceptable but not standout)
   * - poor: 0 points (vague or concerning)
   * - no_answer: 0 points (didn't answer or deflected)
   */
  private calculateScreeningScore(answers: ScreeningAnswer[]): number {
    const categoryScores: Record<string, number> = {
      experience: 0,
      licensing: 0,
      warranty: 0,
      methods: 0,
      references: 0,
    };

    const qualityPoints: Record<string, number> = {
      excellent: 6,
      good: 4,
      adequate: 2,
      poor: 0,
      no_answer: 0,
    };

    // Score each answer, keeping only the best score per category
    for (const answer of answers) {
      const points = qualityPoints[answer.quality] || 0;
      const category = answer.category;
      if (category in categoryScores) {
        // Keep the best score if multiple answers in same category
        const currentScore = categoryScores[category] ?? 0;
        categoryScores[category] = Math.max(currentScore, points);
      }
    }

    // Sum all category scores (max 30 points: 5 categories × 6 points)
    const totalScore = Object.values(categoryScores).reduce((sum, pts) => sum + pts, 0);

    console.log(`[Screening Score] Categories: ${JSON.stringify(categoryScores)}, Total: ${totalScore}/30`);

    return totalScore;
  }

  /**
   * Build personalized reasoning from actual call data
   */
  private buildReasoning(
    result: CallResultWithMetadata,
    data: StructuredCallData
  ): string {
    const parts: string[] = [];
    const advancedMode = isAdvancedScreeningEnabled();

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

    if (result.providerIntel?.tradeFit === "high") {
      parts.push("Strong trade match");
    } else if (result.providerIntel?.tradeFit === "low") {
      parts.push("Weaker trade match");
    }

    if (result.providerIntel?.identityConfidence === "high") {
      parts.push("Identity strongly matched across sources");
    }

    const platforms = result.providerIntel?.reputationSources?.map(
      (source) => source.platform,
    );
    if (platforms && platforms.length > 0) {
      parts.push(`Cross-platform sources: ${Array.from(new Set(platforms)).join(", ")}`);
    }

    const positiveThemes = result.providerIntel?.positiveThemes
      ?.map((theme) => theme.theme)
      .slice(0, 2);
    if (positiveThemes && positiveThemes.length > 0) {
      parts.push(`Strengths: ${positiveThemes.join(", ")}`);
    }

    const negativeThemes = result.providerIntel?.negativeThemes
      ?.map((theme) => theme.theme)
      .slice(0, 1);
    if (negativeThemes && negativeThemes.length > 0) {
      parts.push(`Caution: ${negativeThemes.join(", ")}`);
    }

    const contradictions = result.providerIntel?.contradictionNotes
      ?.map((note) => note.summary)
      .slice(0, 1);
    if (contradictions && contradictions.length > 0) {
      parts.push(`Contradiction: ${contradictions[0]}`);
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

    // 5. Screening insights (only in advanced mode)
    if (advancedMode && data.screening_answers && data.screening_answers.length > 0) {
      const screeningInsights = this.buildScreeningInsights(data.screening_answers);
      if (screeningInsights) {
        parts.push(screeningInsights);
      }
    }

    // 6. AI-generated insight from actual conversation (call summary)
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
   * Build screening insights summary from screening answers
   * Highlights the best qualifications from the call
   */
  private buildScreeningInsights(answers: ScreeningAnswer[]): string | null {
    // Find excellent and good answers
    const highlights: string[] = [];

    // Group by category and find best answers
    const categoryBest: Record<string, ScreeningAnswer | null> = {
      experience: null,
      licensing: null,
      warranty: null,
      methods: null,
      references: null,
    };

    for (const answer of answers) {
      const current = categoryBest[answer.category];
      const qualityRank = { excellent: 4, good: 3, adequate: 2, poor: 1, no_answer: 0 };
      if (!current || qualityRank[answer.quality] > qualityRank[current.quality]) {
        categoryBest[answer.category] = answer;
      }
    }

    // Extract highlights from excellent/good answers
    for (const [category, answer] of Object.entries(categoryBest)) {
      if (answer && (answer.quality === "excellent" || answer.quality === "good")) {
        const categoryLabels: Record<string, string> = {
          experience: "Experience",
          licensing: "Licensed",
          warranty: "Warranty",
          methods: "Methods",
          references: "References",
        };

        // Create concise highlight
        if (answer.quality === "excellent") {
          highlights.push(`★ ${categoryLabels[category]}: ${this.truncateAnswer(answer.answer)}`);
        } else if (answer.quality === "good" && highlights.length < 2) {
          highlights.push(`${categoryLabels[category]}: ${this.truncateAnswer(answer.answer)}`);
        }
      }
    }

    // Return top 2 highlights max
    if (highlights.length === 0) return null;
    return highlights.slice(0, 2).join(" • ");
  }

  /**
   * Truncate answer to reasonable length for display
   */
  private truncateAnswer(answer: string): string {
    if (answer.length <= 40) return answer;
    return answer.substring(0, 37) + "...";
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
