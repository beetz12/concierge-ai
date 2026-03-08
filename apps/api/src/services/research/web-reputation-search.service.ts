import {
  buildReputationSearchQuery,
  normalizeReputationSources,
} from "./reputation-source-normalizer.js";
import { BraveSearchProvider } from "./brave-search.provider.js";
import type { Provider, ProviderReputationSource } from "./types.js";
import type { WebSearchProvider } from "./web-search-provider.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface WebReputationSearchResult {
  providers: Provider[];
  stats: {
    searchedProviders: number;
    enrichedProviders: number;
    totalSources: number;
  };
}

export class WebReputationSearchService {
  private readonly provider: WebSearchProvider;
  private readonly interRequestDelayMs = 1200;

  constructor(
    private logger: Logger,
    provider: WebSearchProvider = new BraveSearchProvider(logger),
  ) {
    this.provider = provider;
  }

  isAvailable(): boolean {
    return this.provider.isAvailable();
  }

  async enrichProviders(providers: Provider[]): Promise<WebReputationSearchResult> {
    if (!this.provider.isAvailable() || providers.length === 0) {
      return {
        providers,
        stats: {
          searchedProviders: 0,
          enrichedProviders: 0,
          totalSources: 0,
        },
      };
    }

    let enrichedProviders = 0;
    let totalSources = 0;

    const updatedProviders: Provider[] = [];

    for (const provider of providers) {
      const query = buildReputationSearchQuery(provider);
      const documents = await this.provider.search({ query, count: 8 });
      const reputationSources = normalizeReputationSources(documents);
      totalSources += reputationSources.length;

      if (reputationSources.length > 0) {
        enrichedProviders += 1;
      }

      updatedProviders.push(
        this.withReputationSources(provider, reputationSources),
      );

      if (provider !== providers[providers.length - 1]) {
        await this.sleep(this.interRequestDelayMs);
      }
    }

    this.logger.info(
      {
        searchedProviders: providers.length,
        enrichedProviders,
        totalSources,
      },
      "Web reputation enrichment completed",
    );

    return {
      providers: updatedProviders,
      stats: {
        searchedProviders: providers.length,
        enrichedProviders,
        totalSources,
      },
    };
  }

  private withReputationSources(
    provider: Provider,
    reputationSources: ProviderReputationSource[],
  ): Provider {
    if (reputationSources.length === 0) {
      return provider;
    }

    const existingSources = provider.providerIntel?.reputationSources ?? [];
    const mergedSources = [...existingSources, ...reputationSources];
    const dedupedSources = mergedSources.filter((source, index) => {
      return (
        mergedSources.findIndex(
          (candidate) =>
            candidate.platform === source.platform &&
            candidate.url === source.url,
        ) === index
      );
    });

    return {
      ...provider,
      providerIntel: {
        ...provider.providerIntel,
        reputationSources: dedupedSources,
      },
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
