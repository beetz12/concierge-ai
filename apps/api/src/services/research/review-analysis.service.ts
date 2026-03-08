import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { serializeError } from "../../utils/error.js";
import type {
  Provider,
  ProviderContradictionNote,
  ProviderReviewTheme,
  ProviderSeriousComplaint,
} from "./types.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

const reviewThemeSchema = z.object({
  theme: z.string(),
  sentiment: z.enum(["positive", "negative", "mixed"]),
  frequency: z.enum(["single", "repeated", "dominant"]).optional(),
  examples: z.array(z.string()).optional(),
});

const contradictionSchema = z.object({
  summary: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  platforms: z.array(z.string()),
  rationale: z.string().optional(),
});

const complaintSchema = z.object({
  category: z.enum([
    "no_show",
    "damage",
    "pricing",
    "unfinished_work",
    "safety",
    "license_or_insurance",
    "complaint_handling",
    "other",
  ]),
  summary: z.string(),
  repeated: z.boolean(),
  platforms: z.array(z.string()).optional(),
});

const analysisSchema = z.object({
  positiveThemes: z.array(reviewThemeSchema).default([]),
  negativeThemes: z.array(reviewThemeSchema).default([]),
  contradictionNotes: z.array(contradictionSchema).default([]),
  seriousComplaints: z.array(complaintSchema).default([]),
  recentTrend: z.enum(["improving", "stable", "deteriorating", "unknown"]).default("unknown"),
});

type ReviewAnalysis = z.infer<typeof analysisSchema>;

export interface ReviewAnalysisResult {
  providers: Provider[];
  stats: {
    analyzedProviders: number;
    skippedProviders: number;
  };
}

export class ReviewAnalysisService {
  private readonly ai: GoogleGenAI | null;
  private readonly model = "gemini-2.5-flash";

  constructor(private logger: Logger) {
    const apiKey = process.env.GEMINI_API_KEY;
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  isAvailable(): boolean {
    return this.ai !== null;
  }

  async analyzeProviders(providers: Provider[]): Promise<ReviewAnalysisResult> {
    let analyzedProviders = 0;
    let skippedProviders = 0;

    const updatedProviders: Provider[] = [];

    for (const provider of providers) {
      const hasEvidence =
        (provider.providerIntel?.reputationSources?.length ?? 0) > 0 ||
        Boolean(provider.reviewCount) ||
        Boolean(provider.rating);

      if (!hasEvidence) {
        skippedProviders += 1;
        updatedProviders.push(provider);
        continue;
      }

      const analysis = await this.analyzeProvider(provider);
      analyzedProviders += 1;
      updatedProviders.push({
        ...provider,
        providerIntel: {
          ...provider.providerIntel,
          positiveThemes: analysis.positiveThemes,
          negativeThemes: analysis.negativeThemes,
          contradictionNotes: analysis.contradictionNotes,
          seriousComplaints: analysis.seriousComplaints,
          recentTrend: analysis.recentTrend,
        },
      });
    }

    return {
      providers: updatedProviders,
      stats: {
        analyzedProviders,
        skippedProviders,
      },
    };
  }

  private async analyzeProvider(provider: Provider): Promise<ReviewAnalysis> {
    const fallback = this.buildFallbackAnalysis(provider);
    const sources = provider.providerIntel?.reputationSources ?? [];

    if (!this.ai || sources.length === 0) {
      return fallback;
    }

    const sourceSummary = sources
      .map((source) =>
        [
          `platform=${source.platform}`,
          `rating=${source.rating ?? "unknown"}`,
          `reviewCount=${source.reviewCount ?? "unknown"}`,
          `title=${source.reviewCountLabel ?? "unknown"}`,
          `snippet=${source.snippet ?? "none"}`,
        ].join(" | "),
      )
      .join("\n");

    const prompt = `Analyze contractor reputation evidence and return JSON only.

Provider: ${provider.name}
Google rating: ${provider.rating ?? "unknown"}
Google review count: ${provider.reviewCount ?? "unknown"}
Trade class: ${provider.providerIntel?.tradeClass ?? "unknown"}
Trade fit: ${provider.providerIntel?.tradeFit ?? "unknown"}

Sources:
${sourceSummary}

Return concise structured JSON with:
- positiveThemes: repeated strengths, especially craftsmanship, communication, punctuality, pricing, professionalism
- negativeThemes: repeated weaknesses or cautions
- contradictionNotes: conflicts across platforms or signals, especially high Google vs weaker off-platform evidence
- seriousComplaints: only if evidence clearly implies high-risk complaints
- recentTrend

If evidence is thin, keep arrays small and use recentTrend=\"unknown\" or \"stable\".
`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        },
      });

      const parsed = analysisSchema.parse(JSON.parse(response.text || "{}"));
      return this.mergeWithFallback(parsed, fallback);
    } catch (error) {
      this.logger.warn(
        { error: serializeError(error), provider: provider.name },
        "Gemini review analysis failed, using fallback analysis",
      );
      return fallback;
    }
  }

  private buildFallbackAnalysis(provider: Provider): ReviewAnalysis {
    const sources = provider.providerIntel?.reputationSources ?? [];
    const positiveThemes: ProviderReviewTheme[] = [];
    const negativeThemes: ProviderReviewTheme[] = [];
    const contradictionNotes: ProviderContradictionNote[] = [];
    const seriousComplaints: ProviderSeriousComplaint[] = [];

    if ((provider.rating ?? 0) >= 4.8 && (provider.reviewCount ?? 0) >= 10) {
      positiveThemes.push({
        theme: "Strong Google review signal",
        sentiment: "positive",
        frequency: "dominant",
        examples: [`Google rating ${provider.rating} from ${provider.reviewCount} reviews`],
      });
    }

    const lowReviewVolume =
      provider.rating !== undefined && (provider.reviewCount ?? 0) > 0 && (provider.reviewCount ?? 0) < 10;
    if (lowReviewVolume) {
      negativeThemes.push({
        theme: "Thin review volume",
        sentiment: "mixed",
        frequency: "repeated",
        examples: [`Only ${provider.reviewCount} Google reviews despite a ${provider.rating} rating`],
      });
    }

    if (sources.some((source) => source.platform === "facebook")) {
      positiveThemes.push({
        theme: "Has additional social proof",
        sentiment: "positive",
        frequency: "single",
        examples: ["Found an off-platform Facebook presence"],
      });
    }

    if (sources.some((source) => source.platform === "yelp") && (provider.rating ?? 0) >= 4.8) {
      contradictionNotes.push({
        summary: "Cross-platform review evidence should be checked for consistency",
        severity: "low",
        platforms: ["google", "yelp"],
        rationale: "High Google scores paired with Yelp presence merit direct contradiction review.",
      });
    }

    const recentTrend: ReviewAnalysis["recentTrend"] =
      sources.length > 0 ? "stable" : "unknown";

    return {
      positiveThemes,
      negativeThemes,
      contradictionNotes,
      seriousComplaints,
      recentTrend,
    };
  }

  private mergeWithFallback(
    analysis: ReviewAnalysis,
    fallback: ReviewAnalysis,
  ): ReviewAnalysis {
    return {
      positiveThemes:
        analysis.positiveThemes.length > 0
          ? analysis.positiveThemes
          : fallback.positiveThemes,
      negativeThemes:
        analysis.negativeThemes.length > 0
          ? analysis.negativeThemes
          : fallback.negativeThemes,
      contradictionNotes:
        analysis.contradictionNotes.length > 0
          ? analysis.contradictionNotes
          : fallback.contradictionNotes,
      seriousComplaints:
        analysis.seriousComplaints.length > 0
          ? analysis.seriousComplaints
          : fallback.seriousComplaints,
      recentTrend:
        analysis.recentTrend !== "unknown"
          ? analysis.recentTrend
          : fallback.recentTrend,
    };
  }
}
