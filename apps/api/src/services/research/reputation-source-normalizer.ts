import type {
  Provider,
  ProviderIntelConfidence,
  ProviderReputationSource,
  WebSearchDocument,
} from "./types.js";

const PLATFORM_HOSTS: Array<{
  platform: ProviderReputationSource["platform"];
  hosts: string[];
  label: string;
  sourceType: NonNullable<ProviderReputationSource["sourceType"]>;
  confidence: ProviderIntelConfidence;
}> = [
  {
    platform: "google",
    hosts: ["google.com", "g.page"],
    label: "Google",
    sourceType: "review_platform",
    confidence: "high",
  },
  {
    platform: "facebook",
    hosts: ["facebook.com", "fb.com"],
    label: "Facebook",
    sourceType: "social",
    confidence: "medium",
  },
  {
    platform: "yelp",
    hosts: ["yelp.com"],
    label: "Yelp",
    sourceType: "review_platform",
    confidence: "high",
  },
  {
    platform: "bbb",
    hosts: ["bbb.org"],
    label: "BBB",
    sourceType: "directory",
    confidence: "high",
  },
  {
    platform: "thumbtack",
    hosts: ["thumbtack.com"],
    label: "Thumbtack",
    sourceType: "review_platform",
    confidence: "medium",
  },
  {
    platform: "angi",
    hosts: ["angi.com", "angieslist.com"],
    label: "Angi",
    sourceType: "review_platform",
    confidence: "medium",
  },
  {
    platform: "houzz",
    hosts: ["houzz.com"],
    label: "Houzz",
    sourceType: "review_platform",
    confidence: "medium",
  },
  {
    platform: "homeadvisor",
    hosts: ["homeadvisor.com"],
    label: "HomeAdvisor",
    sourceType: "review_platform",
    confidence: "medium",
  },
  {
    platform: "nextdoor",
    hosts: ["nextdoor.com"],
    label: "Nextdoor",
    sourceType: "community",
    confidence: "medium",
  },
];

const hostForUrl = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const parseRating = (text: string): number | undefined => {
  const match = text.match(/\b([1-5](?:\.\d)?)\s*(?:stars?|star rating|rating)\b/i);
  if (!match) {
    return undefined;
  }

  const rating = Number(match[1]);
  return Number.isFinite(rating) ? rating : undefined;
};

const parseReviewCount = (text: string): number | undefined => {
  const match = text.match(/\b(\d[\d,]*)\s*(?:reviews?|ratings?)\b/i);
  if (!match) {
    return undefined;
  }

  const count = Number(match[1]!.replace(/,/g, ""));
  return Number.isFinite(count) ? count : undefined;
};

const matchPlatform = (url: string) => {
  const hostname = hostForUrl(url);
  if (!hostname) {
    return null;
  }

  return (
    PLATFORM_HOSTS.find((platform) =>
      platform.hosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      ),
    ) ?? null
  );
};

export const buildReputationSearchQuery = (provider: Provider): string => {
  const locationParts = [provider.address]
    .filter((value): value is string => Boolean(value))
    .join(" ");

  return [
    `"${provider.name}"`,
    locationParts,
    "(reviews OR rating OR BBB OR Yelp OR Facebook OR Thumbtack OR Houzz OR Angi OR HomeAdvisor)",
  ]
    .filter(Boolean)
    .join(" ");
};

export const normalizeReputationSources = (
  documents: WebSearchDocument[],
): ProviderReputationSource[] => {
  const normalized = documents
    .map((document) => {
      const platformMatch = matchPlatform(document.url);
      if (!platformMatch) {
        return null;
      }

      return {
        platform: platformMatch.platform,
        label: platformMatch.label,
        url: document.url,
        rating: parseRating(`${document.title} ${document.snippet || ""}`),
        reviewCount: parseReviewCount(
          `${document.title} ${document.snippet || ""}`,
        ),
        sourceType: platformMatch.sourceType,
        confidence: platformMatch.confidence,
        snippet: document.snippet,
        reviewCountLabel: document.title,
      } satisfies ProviderReputationSource;
    })
    .filter((source) => source !== null);

  const seen = new Set<string>();
  return normalized.filter((source) => {
    const key = `${source.platform}:${source.url}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};
