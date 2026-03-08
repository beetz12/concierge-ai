import type { Provider, ProviderIntelConfidence } from "./types.js";

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (value: string): string[] =>
  normalize(value)
    .split(" ")
    .filter((token) => token.length > 2);

const overlapScore = (left: string, right: string): number => {
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
};

export const inferIdentityConfidence = (
  provider: Provider,
): ProviderIntelConfidence => {
  let score = 0;

  if (provider.phone || provider.internationalPhone) {
    score += 1;
  }

  if (provider.website) {
    score += 1;
  }

  if (provider.address) {
    score += 1;
  }

  const sourceMatches =
    provider.providerIntel?.reputationSources?.reduce((count, source) => {
      const searchableText = [
        source.reviewCountLabel,
        source.snippet,
        source.url,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ");

      return count + (overlapScore(provider.name, searchableText) >= 0.34 ? 1 : 0);
    }, 0) ?? 0;

  score += Math.min(sourceMatches, 2);

  if (score >= 3) {
    return "high";
  }

  if (score >= 2) {
    return "medium";
  }

  return "low";
};
