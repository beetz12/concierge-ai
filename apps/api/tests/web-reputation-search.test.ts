import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReputationSearchQuery,
  normalizeReputationSources,
} from "../src/services/research/reputation-source-normalizer.js";
import { WebReputationSearchService } from "../src/services/research/web-reputation-search.service.js";
import type {
  WebSearchDocument,
} from "../src/services/research/types.js";
import type { WebSearchProvider } from "../src/services/research/web-search-provider.js";

const logger = {
  info() {},
  debug() {},
  error() {},
  warn() {},
};

test("buildReputationSearchQuery includes provider name, address, and review intent", () => {
  const query = buildReputationSearchQuery({
    id: "provider-1",
    name: "Greenville Outdoor Living",
    address: "Greenville, SC",
  });

  assert.match(query, /"Greenville Outdoor Living"/);
  assert.match(query, /Greenville, SC/);
  assert.match(query, /reviews OR rating OR BBB OR Yelp/i);
});

test("normalizeReputationSources keeps only supported reputation platforms and deduplicates", () => {
  const documents: WebSearchDocument[] = [
    {
      title: "Greenville Outdoor Living | Yelp",
      url: "https://www.yelp.com/biz/greenville-outdoor-living-greenville",
      snippet: "4.8 stars",
      sourceEngine: "brave",
    },
    {
      title: "Greenville Outdoor Living | Yelp duplicate",
      url: "https://www.yelp.com/biz/greenville-outdoor-living-greenville",
      snippet: "duplicate",
      sourceEngine: "brave",
    },
    {
      title: "Greenville Outdoor Living | BBB",
      url: "https://www.bbb.org/us/sc/greenville/profile/landscape-contractors/example",
      snippet: "BBB listing",
      sourceEngine: "brave",
    },
    {
      title: "Random blog mention",
      url: "https://example.com/blog/greenville-outdoor-living",
      snippet: "not a supported review platform",
      sourceEngine: "brave",
    },
  ];

  const sources = normalizeReputationSources(documents);

  assert.equal(sources.length, 2);
  assert.deepEqual(
    sources.map((source) => source.platform).sort(),
    ["bbb", "yelp"],
  );
});

test("WebReputationSearchService merges normalized sources onto providerIntel", async () => {
  const fakeProvider: WebSearchProvider = {
    isAvailable() {
      return true;
    },
    async search() {
      return [
        {
          title: "Greenville Outdoor Living | Yelp",
          url: "https://www.yelp.com/biz/greenville-outdoor-living-greenville",
          snippet: "Top rated landscaping company",
          sourceEngine: "brave",
        },
        {
          title: "Greenville Outdoor Living | Facebook",
          url: "https://www.facebook.com/greenvilleoutdoorliving",
          snippet: "Local business",
          sourceEngine: "brave",
        },
      ];
    },
  };

  const service = new WebReputationSearchService(logger, fakeProvider);
  const result = await service.enrichProviders([
    {
      id: "provider-1",
      name: "Greenville Outdoor Living",
      address: "Greenville, SC",
    },
  ]);

  assert.equal(result.stats.searchedProviders, 1);
  assert.equal(result.stats.enrichedProviders, 1);
  assert.equal(result.stats.totalSources, 2);
  assert.equal(
    result.providers[0]?.providerIntel?.reputationSources?.length,
    2,
  );
  assert.deepEqual(
    result.providers[0]?.providerIntel?.reputationSources?.map(
      (source) => source.platform,
    ),
    ["yelp", "facebook"],
  );
});
