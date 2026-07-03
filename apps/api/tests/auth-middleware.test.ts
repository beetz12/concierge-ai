import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import authMiddleware, {
  AuthMiddlewareOptions,
  VerifiedToken,
} from "../src/middleware/auth.js";

/**
 * Auth middleware tests with mocked JWT verification and org resolution:
 * - 401 without / with an invalid token
 * - 403 when requesting an org the user is not a member of
 * - 200 with a valid token (auth context injected)
 * - webhook/health exemptions
 * - DEMO_MODE bypass
 */

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const validToken: VerifiedToken = {
  sub: USER_ID,
  email: "member@example.com",
  app_metadata: {},
};

async function buildApp(
  options: AuthMiddlewareOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(authMiddleware, {
    verifyToken: async (token: string) => {
      if (token === "valid-token") return validToken;
      if (token === "valid-token-with-org-claim") {
        return { ...validToken, app_metadata: { org_id: ORG_A } };
      }
      throw new Error("invalid token");
    },
    resolveOrgIds: async (userId: string) =>
      userId === USER_ID ? [ORG_A] : [],
    ...options,
  });

  app.get("/api/v1/whoami", async (request) => ({ auth: request.auth }));
  app.post("/api/v1/vapi/webhook", async () => ({ ok: true }));
  app.post("/api/v1/billing/webhook", async () => ({ ok: true }));
  app.get("/health", async () => ({ status: "ok" }));

  return app;
}

describe("auth middleware", () => {
  afterEach(() => {
    delete process.env.DEMO_MODE;
  });

  test("returns 401 without a bearer token", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/api/v1/whoami" });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json().error, "Unauthorized");
    await app.close();
  });

  test("returns 401 for an invalid token", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/whoami",
      headers: { authorization: "Bearer garbage" },
    });
    assert.equal(response.statusCode, 401);
    await app.close();
  });

  test("returns 200 and injects {userId, orgId} for a valid token", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/whoami",
      headers: { authorization: "Bearer valid-token" },
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json().auth, {
      userId: USER_ID,
      orgId: ORG_A,
      email: "member@example.com",
    });
    await app.close();
  });

  test("prefers the org_id JWT claim when present", async () => {
    const app = await buildApp({
      // Resolver would return nothing; the claim must win without a lookup.
      resolveOrgIds: async () => [],
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/whoami",
      headers: { authorization: "Bearer valid-token-with-org-claim" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().auth.orgId, ORG_A);
    await app.close();
  });

  test("returns 403 when x-org-id names an org the user is not in", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/whoami",
      headers: {
        authorization: "Bearer valid-token",
        "x-org-id": ORG_B,
      },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "Forbidden");
    await app.close();
  });

  test("honors x-org-id when the user is a member", async () => {
    const app = await buildApp({
      resolveOrgIds: async () => [ORG_A, ORG_B],
    });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/whoami",
      headers: {
        authorization: "Bearer valid-token",
        "x-org-id": ORG_B,
      },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().auth.orgId, ORG_B);
    await app.close();
  });

  test("resolves orgId to null when the user has no memberships", async () => {
    const app = await buildApp({ resolveOrgIds: async () => [] });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/whoami",
      headers: { authorization: "Bearer valid-token" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().auth.orgId, null);
    await app.close();
  });

  test("leaves webhook routes reachable without a token", async () => {
    const app = await buildApp();
    for (const url of ["/api/v1/vapi/webhook", "/api/v1/billing/webhook"]) {
      const response = await app.inject({ method: "POST", url });
      assert.equal(response.statusCode, 200, `${url} should be exempt`);
    }
    await app.close();
  });

  test("leaves /health reachable without a token", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/health" });
    assert.equal(response.statusCode, 200);
    await app.close();
  });

  test("DEMO_MODE bypasses verification with the demo identity", async () => {
    process.env.DEMO_MODE = "true";
    const app = await buildApp({
      verifyToken: async () => {
        throw new Error("must not be called in demo mode");
      },
    });
    const response = await app.inject({ method: "GET", url: "/api/v1/whoami" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().auth.userId, "demo-user-000");
    await app.close();
  });
});
