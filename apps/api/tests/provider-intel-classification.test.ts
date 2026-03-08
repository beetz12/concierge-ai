import assert from "node:assert/strict";
import test from "node:test";
import { inferIdentityConfidence } from "../src/services/research/identity-helper.js";
import { classifyProviderTrade } from "../src/services/research/trade-classification-helper.js";

test("classifyProviderTrade gives high fit to design-build landscapers for landscaping requests", () => {
  const result = classifyProviderTrade(
    {
      id: "provider-1",
      name: "Greenville Outdoor Living",
      reason: "Landscape design, hardscape, drainage, and irrigation services",
      website: "https://greenvilleoutdoorliving.com",
    },
    "landscaper",
  );

  assert.equal(result.tradeClass, "design_build");
  assert.equal(result.tradeFit, "high");
});

test("classifyProviderTrade downgrades lawn-maintenance style providers for landscaping requests", () => {
  const result = classifyProviderTrade(
    {
      id: "provider-2",
      name: "Weekly Lawn Care Pros",
      reason: "Mowing, weed control, fertilization, and weekly maintenance",
    },
    "landscaper",
  );

  assert.equal(result.tradeClass, "maintenance");
  assert.equal(result.tradeFit, "low");
});

test("inferIdentityConfidence is high when multiple strong identity anchors and source matches exist", () => {
  const confidence = inferIdentityConfidence({
    id: "provider-3",
    name: "Greenville Outdoor Living",
    phone: "+18647877800",
    website: "https://greenvilleoutdoorliving.com",
    address: "42 Grand Ave, Greenville, SC 29607, USA",
    providerIntel: {
      reputationSources: [
        {
          platform: "facebook",
          label: "Facebook",
          url: "https://www.facebook.com/gvilleoutdoorliving/",
          reviewCountLabel: "Greenville Outdoor Living | Greenville SC | Facebook",
          snippet: "Greenville Outdoor Living, Greenville. 400 likes.",
        },
        {
          platform: "homeadvisor",
          label: "HomeAdvisor",
          url: "https://www.homeadvisor.com/rated.GreenvilleOutdoorLiving.111488229.html",
          reviewCountLabel: "Greenville Outdoor Living, LLC | Greenville, SC 29607 - HomeAdvisor",
          snippet: "Greenville Outdoor Living, LLC prescreened in Greenville.",
        },
      ],
    },
  });

  assert.equal(confidence, "high");
});

test("inferIdentityConfidence is low when identity anchors are sparse and sources do not match well", () => {
  const confidence = inferIdentityConfidence({
    id: "provider-4",
    name: "Affordable Services",
    providerIntel: {
      reputationSources: [
        {
          platform: "yelp",
          label: "Yelp",
          url: "https://www.yelp.com/biz/unrelated-company-greenville",
          reviewCountLabel: "Unrelated Company | Yelp",
          snippet: "A completely different business profile.",
        },
      ],
    },
  });

  assert.equal(confidence, "low");
});
