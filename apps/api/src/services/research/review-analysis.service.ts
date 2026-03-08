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

type RawReviewAnalysis = {
  positiveThemes?: unknown[];
  negativeThemes?: unknown[];
  contradictionNotes?: unknown[];
  seriousComplaints?: unknown[];
  recentTrend?: unknown;
};

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
      const evidenceLevel = this.assessEvidenceLevel(provider);

      if (evidenceLevel === "none") {
        skippedProviders += 1;
        updatedProviders.push(provider);
        continue;
      }

      if (evidenceLevel === "thin") {
        skippedProviders += 1;
        const fallback = this.buildFallbackAnalysis(provider);
        updatedProviders.push({
          ...provider,
          providerIntel: {
            ...provider.providerIntel,
            positiveThemes: fallback.positiveThemes,
            negativeThemes: fallback.negativeThemes,
            contradictionNotes: fallback.contradictionNotes,
            seriousComplaints: fallback.seriousComplaints,
            recentTrend: fallback.recentTrend,
          },
        });
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

  private assessEvidenceLevel(provider: Provider): "none" | "thin" | "rich" {
    const sources = provider.providerIntel?.reputationSources ?? [];
    const hasGoogleSignal =
      provider.rating !== undefined || (provider.reviewCount ?? 0) > 0;

    if (provider.providerIntel?.tradeFit === "low") {
      return hasGoogleSignal || sources.length > 0 ? "thin" : "none";
    }

    const richSnippetCount = sources.filter(
      (source) => (source.snippet?.trim().length ?? 0) >= 60,
    ).length;
    const nuancedSnippetCount = sources.filter(
      (source) => (source.snippet?.trim().length ?? 0) >= 140,
    ).length;
    const ratedSourceCount = sources.filter(
      (source) =>
        source.rating !== undefined || (source.reviewCount ?? 0) > 0,
    ).length;
    const distinctPlatforms = new Set(sources.map((source) => source.platform)).size;
    const contradictionSignal = sources.some((source) =>
      /complaint|damage|late|poor|issue|problem|mixed|warning|dispute|refund|excellent|recommend/i.test(
        source.snippet ?? "",
      ),
    );

    if (!hasGoogleSignal && sources.length === 0) {
      return "none";
    }

    if (
      contradictionSignal &&
      richSnippetCount >= 1 &&
      (distinctPlatforms >= 2 || ratedSourceCount >= 2)
    ) {
      return "rich";
    }

    if (
      nuancedSnippetCount >= 2 &&
      (distinctPlatforms >= 2 || ratedSourceCount >= 3)
    ) {
      return "rich";
    }

    return "thin";
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

      const raw = this.parseModelJson(response.text || "{}");
      const parsed = analysisSchema.parse(this.normalizeAnalysis(raw));
      return this.mergeWithFallback(parsed, fallback);
    } catch (error) {
      this.logger.warn(
        { error: serializeError(error), provider: provider.name },
        "Gemini review analysis failed, using fallback analysis",
      );
      return fallback;
    }
  }

  private normalizeAnalysis(raw: RawReviewAnalysis): ReviewAnalysis {
    return {
      positiveThemes: this.normalizeThemes(raw.positiveThemes, "positive"),
      negativeThemes: this.normalizeThemes(raw.negativeThemes, "negative"),
      contradictionNotes: this.normalizeContradictions(raw.contradictionNotes),
      seriousComplaints: this.normalizeComplaints(raw.seriousComplaints),
      recentTrend:
        raw.recentTrend === "improving" ||
        raw.recentTrend === "stable" ||
        raw.recentTrend === "deteriorating" ||
        raw.recentTrend === "unknown"
          ? raw.recentTrend
          : "unknown",
    };
  }

  private parseModelJson(text: string): RawReviewAnalysis {
    const candidates = [
      text,
      this.extractJsonBlock(text),
      this.sanitizeJson(text),
      this.sanitizeJson(this.extractJsonBlock(text)),
    ].filter((candidate, index, all): candidate is string =>
      Boolean(candidate) && all.indexOf(candidate) === index,
    );

    let lastError: unknown = null;

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as RawReviewAnalysis;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error("Failed to parse model JSON");
  }

  private extractJsonBlock(text: string): string {
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1] ?? text;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start >= 0 && end > start) {
      return candidate.slice(start, end + 1);
    }

    return candidate.trim();
  }

  private sanitizeJson(text: string): string {
    return text
      .replace(/```(?:json)?/gi, "")
      .replace(/```/g, "")
      .replace(/,\s*([}\]])/g, "$1")
      .trim();
  }

  private normalizeThemes(
    values: unknown[] | undefined,
    sentiment: "positive" | "negative",
  ): ProviderReviewTheme[] {
    return (values ?? [])
      .map((value) => {
        if (typeof value === "string") {
          return {
            theme: value,
            sentiment,
            frequency: "single" as const,
          };
        }

        if (!value || typeof value !== "object") {
          return null;
        }

        const record = value as Record<string, unknown>;
        const theme = typeof record.theme === "string" ? record.theme : null;
        if (!theme) return null;

        const parsedSentiment =
          record.sentiment === "positive" ||
          record.sentiment === "negative" ||
          record.sentiment === "mixed"
            ? record.sentiment
            : sentiment;

        const frequency =
          record.frequency === "single" ||
          record.frequency === "repeated" ||
          record.frequency === "dominant"
            ? record.frequency
            : undefined;

        const examples = Array.isArray(record.examples)
          ? record.examples.filter(
              (example): example is string => typeof example === "string",
            )
          : undefined;

        return {
          theme,
          sentiment: parsedSentiment,
          frequency,
          examples,
        };
      })
      .filter((theme): theme is ProviderReviewTheme => Boolean(theme));
  }

  private normalizeContradictions(
    values: unknown[] | undefined,
  ): ProviderContradictionNote[] {
    const normalized: ProviderContradictionNote[] = [];

    for (const value of values ?? []) {
      if (typeof value === "string") {
        normalized.push({
          summary: value,
          severity: "medium",
          platforms: [],
        });
        continue;
      }

      if (!value || typeof value !== "object") {
        continue;
      }

      const record = value as Record<string, unknown>;
      const summary = typeof record.summary === "string" ? record.summary : null;
      if (!summary) continue;

      const severity: ProviderContradictionNote["severity"] =
        record.severity === "low" ||
        record.severity === "medium" ||
        record.severity === "high"
          ? record.severity
          : "medium";

      const platforms = Array.isArray(record.platforms)
        ? record.platforms.filter(
            (platform): platform is string => typeof platform === "string",
          )
        : [];

      const rationale =
        typeof record.rationale === "string" ? record.rationale : undefined;

      normalized.push({
        summary,
        severity,
        platforms,
        rationale,
      });
    }

    return normalized;
  }

  private normalizeComplaints(
    values: unknown[] | undefined,
  ): ProviderSeriousComplaint[] {
    const normalized: ProviderSeriousComplaint[] = [];

    for (const value of values ?? []) {
      if (!value || typeof value !== "object") {
        continue;
      }

      const record = value as Record<string, unknown>;
      const summary = typeof record.summary === "string" ? record.summary : null;
      if (!summary) continue;

      const category: ProviderSeriousComplaint["category"] =
        record.category === "no_show" ||
        record.category === "damage" ||
        record.category === "pricing" ||
        record.category === "unfinished_work" ||
        record.category === "safety" ||
        record.category === "license_or_insurance" ||
        record.category === "complaint_handling" ||
        record.category === "other"
          ? record.category
          : "other";

      const repeated = Boolean(record.repeated);
      const platforms = Array.isArray(record.platforms)
        ? record.platforms.filter(
            (platform): platform is string => typeof platform === "string",
          )
        : undefined;

      normalized.push({
        category,
        summary,
        repeated,
        platforms,
      });
    }

    return normalized;
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
