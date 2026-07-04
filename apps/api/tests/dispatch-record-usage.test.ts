import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import dispatchRoutes from "../src/routes/dispatch.js";
import {
  recordDispatch,
  resetDispatchRegistry,
} from "../src/services/dispatch/registry.js";
import { InMemoryTokenBucketRateLimiter } from "../src/services/rate-limit/token-bucket.js";

/**
 * FIX 4 (dispatch route):
 * (a) GET /:callId and /:callId/artifacts return 404 when the registry has no
 *     record for the call id, or the record belongs to another org.
 * (b) recordUsage is invoked (usage_events insert) on a successful voice dispatch.
 * (c) DEMO_MODE selects the in-memory mock backend so the GEMINI-only demo
 *     doesn't require LiveKit config.
 */

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER_ORG = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const DISPATCH_BODY = {
  contactName: "Acme Plumbing",
  phoneNumber: "+18035550123",
  objective: "Ask about drain repair availability",
  taskType: "make_inquiry" as const,
  userApproved: true as const,
  channel: "voice" as const,
};

interface UsageCapture {
  inserts: Array<{ table: string; values: Record<string, unknown> }>;
}

/**
 * Capturing Supabase stub covering the full compliance-authorize voice path:
 * tenant_settings + suppression reads resolve "clear", audit/authorization
 * inserts return ids, the audit call_id update succeeds, and usage_events
 * inserts are captured.
 */
function capturingSupabase(capture: UsageCapture) {
  let idCounter = 0;
  const from = (table: string) => {
    const insertResult = (values: Record<string, unknown>) => {
      capture.inserts.push({ table, values });
      return {
        select() {
          return {
            async single() {
              idCounter += 1;
              return { data: { id: `${table}-${idCounter}` }, error: null };
            },
          };
        },
        // usage_events / other inserts awaited directly.
        then(resolve: (v: { error: null }) => void) {
          resolve({ error: null });
        },
      };
    };
    return {
      insert: insertResult,
      select() {
        return {
          eq() {
            return this;
          },
          or() {
            return this;
          },
          async maybeSingle() {
            return { data: null, error: null };
          },
          async limit() {
            return { data: [], error: null };
          },
        };
      },
      update() {
        return {
          async eq() {
            return { error: null };
          },
        };
      },
    };
  };
  return { from } as never;
}

async function buildApp(capture: UsageCapture): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("supabase", capturingSupabase(capture));
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    request.auth = { userId: "user-1", orgId: ORG_ID, email: "t@example.com" };
  });
  await app.register(dispatchRoutes, {
    rateLimiter: new InMemoryTokenBucketRateLimiter({
      capacity: 100,
      refillPerSecond: 100,
      now: () => 0,
    }),
    // Pin the compliance clock to 3pm EDT so quiet-hours never flakes the test.
    now: () => new Date("2026-07-01T19:00:00Z"),
  });
  return app;
}

describe("dispatch record check + usage metering (FIX 4)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ["CALL_BACKEND", "DEMO_MODE"]) saved[key] = process.env[key];
    process.env.CALL_BACKEND = "mock";
    delete process.env.DEMO_MODE;
    resetDispatchRegistry();
  });

  afterEach(() => {
    for (const key of ["CALL_BACKEND", "DEMO_MODE"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetDispatchRegistry();
  });

  test("GET /:callId returns 404 for an unknown call id", async () => {
    const app = await buildApp({ inserts: [] });
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/unknown-call" });
    assert.equal(response.statusCode, 404);
    await app.close();
  });

  test("GET /:callId returns 404 for a record owned by another org", async () => {
    recordDispatch({
      callId: "foreign-call",
      orgId: OTHER_ORG,
      plan: {
        businessName: "Acme",
        phoneNumber: "+18035550123",
        objective: "x",
        context: "",
        mustAsk: [],
        callerIdentity: "a client",
        voicemailPolicy: "hang_up",
        preAuthorizations: [],
      },
      taskType: "make_inquiry",
      complianceTaskType: "general_inquiry",
      dispatchedAt: new Date().toISOString(),
    });
    const app = await buildApp({ inserts: [] });
    await app.ready();
    const response = await app.inject({ method: "GET", url: "/foreign-call" });
    assert.equal(response.statusCode, 404);
    await app.close();
  });

  test("GET /:callId/artifacts returns 404 for a foreign record", async () => {
    recordDispatch({
      callId: "foreign-call",
      orgId: OTHER_ORG,
      plan: {
        businessName: "Acme",
        phoneNumber: "+18035550123",
        objective: "x",
        context: "",
        mustAsk: [],
        callerIdentity: "a client",
        voicemailPolicy: "hang_up",
        preAuthorizations: [],
      },
      taskType: "make_inquiry",
      complianceTaskType: "general_inquiry",
      dispatchedAt: new Date().toISOString(),
    });
    const app = await buildApp({ inserts: [] });
    await app.ready();
    const response = await app.inject({
      method: "GET",
      url: "/foreign-call/artifacts",
    });
    assert.equal(response.statusCode, 404);
    await app.close();
  });

  test("a successful voice dispatch records a call_count usage event", async () => {
    const capture: UsageCapture = { inserts: [] };
    const app = await buildApp(capture);
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: DISPATCH_BODY,
    });
    assert.equal(response.statusCode, 200, response.body);
    const usage = capture.inserts.find((i) => i.table === "usage_events");
    assert.ok(usage, "expected a usage_events insert");
    assert.equal(usage?.values.type, "call_count");
    assert.equal(usage?.values.org_id, ORG_ID);
    assert.equal(usage?.values.quantity, 1);
    await app.close();
  });

  test("DEMO_MODE dispatch succeeds without LiveKit config (mock backend)", async () => {
    process.env.DEMO_MODE = "true";
    delete process.env.CALL_BACKEND;
    const app = await buildApp({ inserts: [] });
    await app.ready();
    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: DISPATCH_BODY,
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(response.json().callId, "demo dispatch should return a callId");
    await app.close();
  });
});
