import assert from "node:assert/strict";
import test from "node:test";
import { ResearchService } from "../src/services/research/research.service.js";
import type { ResearchResult } from "../src/services/research/types.js";

// Snapshot at module load: sibling test files mutate process.env.GEMINI_API_KEY,
// so read it once here to keep the skip decision deterministic (skip in CI, where
// the key is absent from the start).
const SKIP_GEMINI = !process.env.GEMINI_API_KEY && "no GEMINI_API_KEY";

const logger = {
  info() {},
  debug() {},
  warn() {},
  error() {},
};

test("research ranking prefers corroborated multi-platform landscaper over thinner single-platform profile", {
  skip: SKIP_GEMINI,
}, () => {
  const service = new ResearchService(logger);

  const result: ResearchResult = {
    status: "success",
    method: "direct_gemini",
    providers: [
      {
        id: "southern-stripes",
        name: "Southern Stripes Lawn & Landscapes",
        rating: 4.8,
        reviewCount: 110,
        phone: "+18644320211",
        providerIntel: {
          tradeClass: "design_build",
          tradeFit: "medium",
          identityConfidence: "high",
          reputationSources: [
            {
              platform: "facebook",
              label: "Facebook",
            },
          ],
          positiveThemes: [
            {
              theme: "Strong Google review signal",
              sentiment: "positive",
            },
          ],
        },
      },
      {
        id: "reedy-river",
        name: "Reedy River Landscapes",
        rating: 4.9,
        reviewCount: 80,
        phone: "+18646686008",
        providerIntel: {
          tradeClass: "design_build",
          tradeFit: "medium",
          identityConfidence: "high",
          reputationSources: [
            {
              platform: "houzz",
              label: "Houzz",
              rating: 5,
              reviewCount: 18,
            },
            {
              platform: "homeadvisor",
              label: "HomeAdvisor",
              rating: 4.8,
              reviewCount: 11,
            },
            {
              platform: "bbb",
              label: "BBB",
            },
            {
              platform: "facebook",
              label: "Facebook",
            },
          ],
          contradictionNotes: [
            {
              summary:
                "Direct customer feedback is strong, but the BBB profile is not accredited.",
              severity: "low",
              platforms: ["houzz", "bbb"],
            },
          ],
        },
      },
    ],
    pipelineStages: [],
  };

  const ranked = (service as any).rankDecisionReadyProviders(result) as ResearchResult;

  assert.equal(ranked.providers[0]?.name, "Reedy River Landscapes");
  assert.equal(ranked.providers[1]?.name, "Southern Stripes Lawn & Landscapes");
});
