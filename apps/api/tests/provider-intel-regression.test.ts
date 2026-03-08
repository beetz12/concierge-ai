import assert from "node:assert/strict";
import test from "node:test";
import { RecommendationService } from "../src/services/recommendations/recommend.service.js";
import {
  communityProofScenario,
  contradictionScenario,
  identityCollisionScenario,
  selfPromoScenario,
  tradeMismatchScenario,
} from "./fixtures/provider-intel-scenarios.js";

process.env.GEMINI_API_KEY ||= "test-key";

test("provider-intel regression: contradiction-heavy candidate loses to balanced multi-source candidate", async () => {
  const service = new RecommendationService();

  const response = await service.generateRecommendations({
    serviceRequestId: "00000000-0000-0000-0000-000000000000",
    originalCriteria: "Need a landscaper in Greenville, SC",
    callResults: [
      contradictionScenario.contradicted,
      contradictionScenario.balanced,
    ],
  });

  assert.equal(
    response.recommendations[0]?.providerName,
    contradictionScenario.balanced.provider?.name,
  );
});

test("provider-intel regression: identity collision is penalized below verified match", async () => {
  const service = new RecommendationService();

  const response = await service.generateRecommendations({
    serviceRequestId: "00000000-0000-0000-0000-000000000000",
    originalCriteria: "Need a landscaper in Greenville, SC",
    callResults: [
      identityCollisionScenario.ambiguous,
      identityCollisionScenario.verified,
    ],
  });

  assert.equal(
    response.recommendations[0]?.providerName,
    identityCollisionScenario.verified.provider?.name,
  );
});

test("provider-intel regression: trade-matched landscaper outranks maintenance-only candidate", async () => {
  const service = new RecommendationService();

  const response = await service.generateRecommendations({
    serviceRequestId: "00000000-0000-0000-0000-000000000000",
    originalCriteria: "Need a landscaper in Greenville, SC",
    callResults: [
      tradeMismatchScenario.mismatched,
      tradeMismatchScenario.matched,
    ],
  });

  assert.equal(
    response.recommendations[0]?.providerName,
    tradeMismatchScenario.matched.provider?.name,
  );
});

test("provider-intel regression: thin off-platform evidence loses to balanced review depth", async () => {
  const service = new RecommendationService();

  const response = await service.generateRecommendations({
    serviceRequestId: "00000000-0000-0000-0000-000000000000",
    originalCriteria: "Need a landscaper in Greenville, SC",
    callResults: [
      communityProofScenario.thinOffPlatform,
      communityProofScenario.balanced,
    ],
  });

  assert.equal(
    response.recommendations[0]?.providerName,
    communityProofScenario.balanced.provider?.name,
  );
});

test("provider-intel regression: self-promotional reputation signal is penalized", async () => {
  const service = new RecommendationService();

  const response = await service.generateRecommendations({
    serviceRequestId: "00000000-0000-0000-0000-000000000000",
    originalCriteria: "Need a landscaper in Greenville, SC",
    callResults: [
      selfPromoScenario.selfPromotional,
      selfPromoScenario.organic,
    ],
  });

  assert.equal(
    response.recommendations[0]?.providerName,
    selfPromoScenario.organic.provider?.name,
  );
  assert.match(response.recommendations[1]?.reasoning || "", /caution/i);
});
