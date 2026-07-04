import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import providerRoutes from "../src/routes/providers.js";

/**
 * FIX 1: the legacy Research-and-Book calling routes are disabled by default.
 * With ENABLE_RESEARCH_AND_BOOK unset (and DEMO_MODE off), the three real-dialing
 * routes must return 403 ResearchAndBookDisabled AFTER schema validation and
 * BEFORE any CallRequest is built or a call placed.
 */

const CALL_BODY = {
  providerName: "Acme Plumbing",
  providerPhone: "+18035550123",
  serviceNeeded: "plumbing",
  userCriteria: "Licensed and insured",
  location: "Greenville, SC",
  urgency: "flexible" as const,
};

const BATCH_ASYNC_BODY = {
  providers: [{ name: "Acme Plumbing", phone: "+18035550123", id: "prov-1" }],
  serviceNeeded: "plumbing",
  location: "Greenville, SC",
};

const BOOK_BODY = {
  providerId: "prov-1",
  providerName: "Acme Plumbing",
  providerPhone: "+18035550123",
  serviceNeeded: "plumbing",
  serviceRequestId: "req-1",
  location: "Greenville, SC",
};

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(providerRoutes);
  return app;
}

describe("Research-and-Book disabled by default (FIX 1)", () => {
  const saved: Record<string, string | undefined> = {};
  const ENV_KEYS = [
    "ENABLE_RESEARCH_AND_BOOK",
    "DEMO_MODE",
    "VAPI_API_KEY",
    "VAPI_PHONE_NUMBER_ID",
  ];

  before(() => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    delete process.env.ENABLE_RESEARCH_AND_BOOK;
    delete process.env.DEMO_MODE;
    // ProviderCallingService (constructed at route registration) requires these;
    // the flag guard fires before any VAPI client is actually used.
    process.env.VAPI_API_KEY = "test-vapi-key";
    process.env.VAPI_PHONE_NUMBER_ID = "test-vapi-phone-id";
  });

  after(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("POST /call returns 403 ResearchAndBookDisabled when the flag is unset", async () => {
    const app = await buildApp();
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/call",
      payload: CALL_BODY,
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "ResearchAndBookDisabled");
    await app.close();
  });

  test("POST /batch-call-async returns 403 ResearchAndBookDisabled when the flag is unset", async () => {
    const app = await buildApp();
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/batch-call-async",
      payload: BATCH_ASYNC_BODY,
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "ResearchAndBookDisabled");
    await app.close();
  });

  test("POST /book returns 403 ResearchAndBookDisabled when the flag is unset", async () => {
    const app = await buildApp();
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/book",
      payload: BOOK_BODY,
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "ResearchAndBookDisabled");
    await app.close();
  });
});
