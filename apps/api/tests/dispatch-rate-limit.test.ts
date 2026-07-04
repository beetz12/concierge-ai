import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import dispatchRoutes from "../src/routes/dispatch.js";
import { InMemoryTokenBucketRateLimiter } from "../src/services/rate-limit/token-bucket.js";

/**
 * Per-org rate limiting on the dispatch surface. Runs in DEMO_MODE so the
 * /plan route is a pure classifier+playbook call (no Supabase, no dialing),
 * letting us assert the limiter behavior in isolation. A capacity-1 bucket
 * means the second request from the same org is throttled (429), while a
 * different org still has its own bucket.
 */

process.env.DEMO_MODE = "true";

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // dispatch routes read fastify.supabase in some paths; /plan (no caseId)
  // does not touch it, but the decorator must exist for construction.
  app.decorate("supabase", {} as never);
  // Stand in for the auth middleware: inject a fixed org context so requireOrg
  // passes and the limiter keys on a stable org id.
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    request.auth = {
      userId: "test-user",
      orgId: "test-org",
      email: "t@example.com",
    };
  });
  await app.register(dispatchRoutes, {
    rateLimiter: new InMemoryTokenBucketRateLimiter({
      capacity: 1,
      refillPerSecond: 0.001,
      now: () => 0,
    }),
  });
  return app;
}

const planBody = {
  taskDescription: "Ask about availability for a plumbing visit",
  contactName: "Acme Plumbing",
};

describe("per-org dispatch rate limiting", () => {
  test("first request allowed, second from same org -> 429", async () => {
    const app = await buildApp();
    await app.ready();

    const first = await app.inject({
      method: "POST",
      url: "/plan",
      payload: planBody,
    });
    assert.equal(first.statusCode, 200);
    assert.equal(first.headers["x-ratelimit-limit"], "1");
    assert.equal(first.headers["x-ratelimit-remaining"], "0");

    const second = await app.inject({
      method: "POST",
      url: "/plan",
      payload: planBody,
    });
    assert.equal(second.statusCode, 429);
    const body = second.json();
    assert.equal(body.error, "Too Many Requests");
    assert.ok(Number(second.headers["retry-after"]) >= 1);

    await app.close();
  });
});
