import type {
  Provider,
  ProviderIntelConfidence,
  ProviderTradeClass,
} from "./types.js";

const KEYWORDS: Record<ProviderTradeClass, string[]> = {
  design_build: [
    "landscape design",
    "outdoor living",
    "hardscape",
    "patio",
    "retaining wall",
    "paver",
    "drainage",
    "irrigation",
    "design build",
  ],
  maintenance: [
    "lawn care",
    "mowing",
    "maintenance",
    "yard maintenance",
    "grass cutting",
    "fertilization",
    "weed control",
    "landscaping",
  ],
  specialty: [
    "tree service",
    "arborist",
    "lighting",
    "sod",
    "mulch",
    "sprinkler",
    "outdoor kitchen",
    "fence",
    "pressure washing",
  ],
  unknown: [],
};

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const providerText = (provider: Provider): string => {
  const reputationText = provider.providerIntel?.reputationSources
    ?.flatMap((source) => [source.reviewCountLabel, source.snippet, source.url])
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return normalize(
    [
      provider.name,
      provider.reason,
      provider.website,
      provider.address,
      reputationText,
    ]
      .filter(Boolean)
      .join(" "),
  );
};

const inferRequestedTrade = (service: string): ProviderTradeClass => {
  const normalized = normalize(service);

  if (
    normalized.includes("landscap") ||
    normalized.includes("hardscape") ||
    normalized.includes("outdoor")
  ) {
    return "design_build";
  }

  if (
    normalized.includes("lawn") ||
    normalized.includes("mowing") ||
    normalized.includes("maintenance")
  ) {
    return "maintenance";
  }

  return "specialty";
};

export interface TradeClassificationResult {
  tradeClass: ProviderTradeClass;
  tradeFit: ProviderIntelConfidence;
}

export const classifyProviderTrade = (
  provider: Provider,
  requestedService: string,
): TradeClassificationResult => {
  const text = providerText(provider);
  const requestedTrade = inferRequestedTrade(requestedService);

  const scores = (Object.keys(KEYWORDS) as ProviderTradeClass[]).map(
    (tradeClass) => ({
      tradeClass,
      score: KEYWORDS[tradeClass].reduce(
        (count, keyword) => count + (text.includes(keyword) ? 1 : 0),
        0,
      ),
    }),
  );

  const bestMatch = scores.sort((a, b) => b.score - a.score)[0];
  const tradeClass =
    bestMatch && bestMatch.score > 0 ? bestMatch.tradeClass : "unknown";

  let tradeFit: ProviderIntelConfidence = "low";
  if (tradeClass === requestedTrade && bestMatch && bestMatch.score >= 2) {
    tradeFit = "high";
  } else if (tradeClass === requestedTrade || (bestMatch?.score ?? 0) >= 1) {
    tradeFit = "medium";
  }

  if (
    requestedTrade === "design_build" &&
    tradeClass === "maintenance" &&
    text.includes("lawn care")
  ) {
    tradeFit = "low";
  }

  return { tradeClass, tradeFit };
};
