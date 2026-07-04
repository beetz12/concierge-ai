import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import voiceCallRoutes from "../src/routes/voice-calls.js";
import {
  recordDispatch,
  resetDispatchRegistry,
} from "../src/services/dispatch/registry.js";

/**
 * FIX 2: voice-calls capability gate + 24h redial guard.
 *
 * (a) With a non-livekit CALL_BACKEND (mock), the LiveKit-only supervision and
 *     pause endpoints return 501 and never touch the LiveKit service.
 * (b) POST /voice/call-contractor computes the 24h same-number redial guard and
 *     threads it into complianceDispatcher.authorize, so a blocked retry is
 *     denied (403 ComplianceDenied with a redial_blocked reason) before dialing.
 */

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const USER_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const CONTRACTOR_PHONE = "+18035550123";

/**
 * Minimal chainable Supabase stub: kill-switch + suppression reads resolve
 * "clear", and audit inserts succeed. Enough for the compliance authorize path
 * to run without a real database.
 */
function stubSupabase() {
  const single = async () => ({ data: { id: "audit-1" }, error: null });
  const maybeSingle = async () => ({ data: null, error: null });
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    or: self,
    limit: async () => ({ data: [], error: null }),
    maybeSingle,
    single,
    insert: () => chain,
  });
  return {
    from: () => chain,
  } as never;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("supabase", stubSupabase());
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    request.auth = { userId: USER_ID, orgId: ORG_ID, email: "t@example.com" };
  });
  await app.register(voiceCallRoutes);
  return app;
}

const CONTRACTOR_BODY = {
  mode: "qualification" as const,
  contractorName: "Acme Plumbing",
  contractorPhone: CONTRACTOR_PHONE,
  serviceNeeded: "plumbing",
  location: "Greenville, SC",
  userApproved: true,
};

describe("voice-calls capability gate + redial guard (FIX 2)", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ["CALL_BACKEND", "DEMO_MODE"]) saved[key] = process.env[key];
    resetDispatchRegistry();
  });

  afterEach(() => {
    for (const key of ["CALL_BACKEND", "DEMO_MODE"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetDispatchRegistry();
  });

  test("non-livekit backend returns 501 for the supervisor browser-token endpoint", async () => {
    process.env.CALL_BACKEND = "mock";
    delete process.env.DEMO_MODE;
    const app = await buildApp();
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/calls/session-1/supervisor/browser-token",
      payload: {},
    });
    assert.equal(response.statusCode, 501);
    assert.equal(response.json().error, "SupervisionUnsupported");
    await app.close();
  });

  test("non-livekit backend returns 501 for the pause endpoint", async () => {
    process.env.CALL_BACKEND = "mock";
    delete process.env.DEMO_MODE;
    const app = await buildApp();
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/calls/session-1/pause",
      payload: {},
    });
    assert.equal(response.statusCode, 501);
    assert.equal(response.json().error, "PauseUnsupported");
    await app.close();
  });

  test("call-contractor denies a redial-blocked retry with a redial_blocked reason", async () => {
    process.env.CALL_BACKEND = "mock";
    delete process.env.DEMO_MODE;

    // Seed the registry as if this org already dialed the number just now, so
    // the 24h same-number redial guard is active.
    recordDispatch({
      callId: "prior-call",
      orgId: ORG_ID,
      plan: {
        businessName: "Acme Plumbing",
        phoneNumber: CONTRACTOR_PHONE,
        objective: "prior",
        context: "",
        mustAsk: [],
        callerIdentity: "a client",
        voicemailPolicy: "hang_up",
        preAuthorizations: [],
      },
      taskType: "make_inquiry",
      complianceTaskType: "availability_inquiry",
      dispatchedAt: new Date().toISOString(),
    });

    const app = await buildApp();
    await app.ready();

    const response = await app.inject({
      method: "POST",
      url: "/call-contractor",
      payload: CONTRACTOR_BODY,
    });
    assert.equal(response.statusCode, 403);
    const body = response.json();
    assert.equal(body.error, "ComplianceDenied");
    assert.ok(
      Array.isArray(body.reasons) && body.reasons.includes("redial_blocked"),
      `expected redial_blocked in reasons, got ${JSON.stringify(body.reasons)}`,
    );
    await app.close();
  });
});
