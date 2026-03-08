import assert from "node:assert/strict";
import test from "node:test";
import { ReviewAnalysisService } from "../src/services/research/review-analysis.service.js";

const logger = {
  info() {},
  debug() {},
  error() {},
  warn() {},
};

test("ReviewAnalysisService fallback adds a strong positive theme for high-volume strong Google ratings", async () => {
  const service = new ReviewAnalysisService(logger);
  const result = await service.analyzeProviders([
    {
      id: "provider-1",
      name: "Greenville Outdoor Living",
      rating: 4.9,
      reviewCount: 38,
      providerIntel: {
        reputationSources: [
          {
            platform: "facebook",
            label: "Facebook",
            url: "https://www.facebook.com/gvilleoutdoorliving/",
            snippet: "Local business page",
          },
        ],
      },
    },
  ]);

  const provider = result.providers[0];
  assert.equal(result.stats.analyzedProviders, 1);
  assert.match(
    provider?.providerIntel?.positiveThemes?.[0]?.theme || "",
    /Strong Google review signal/,
  );
});

test("ReviewAnalysisService fallback flags thin review volume for low-count profiles", async () => {
  const service = new ReviewAnalysisService(logger);
  const result = await service.analyzeProviders([
    {
      id: "provider-2",
      name: "Aydan's Landscaping",
      rating: 5,
      reviewCount: 1,
    },
  ]);

  const provider = result.providers[0];
  assert.equal(result.stats.analyzedProviders, 1);
  assert.match(
    provider?.providerIntel?.negativeThemes?.[0]?.theme || "",
    /Thin review volume/,
  );
});

test("ReviewAnalysisService fallback adds a low-severity contradiction note when Google is strong and Yelp exists", async () => {
  const service = new ReviewAnalysisService(logger);
  const result = await service.analyzeProviders([
    {
      id: "provider-3",
      name: "Graham Kimak Landscape Designs",
      rating: 4.9,
      reviewCount: 12,
      providerIntel: {
        reputationSources: [
          {
            platform: "yelp",
            label: "Yelp",
            url: "https://www.yelp.com/biz/graham-kimak-landscape-designs",
            snippet: "Yelp profile",
          },
        ],
      },
    },
  ]);

  const contradiction = result.providers[0]?.providerIntel?.contradictionNotes?.[0];
  assert.equal(contradiction?.severity, "low");
  assert.deepEqual(contradiction?.platforms, ["google", "yelp"]);
});
