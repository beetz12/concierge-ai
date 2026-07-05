import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import membersRoutes from "./members.js";
import { InMemoryMembershipStore } from "../services/membership/memory-store.js";
import {
  recordDispatch,
  resetDispatchRegistry,
} from "../services/dispatch/registry.js";
import type {
  CallBackend,
  CallPlan,
  CallStatus,
} from "../services/call-backend/types.js";

/**
 * Route tests for /api/v1/members with a stubbed auth context, the in-memory
 * membership store, and a stubbed call backend (same pattern as
 * cases.test.ts). The purchase gate stays OFF in every test — no real
 * numbers are ever bought.
 */

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function makePlan(overrides: Partial<CallPlan> = {}): CallPlan {
  return {
    businessName: "Acme Plumbing",
    phoneNumber: "+18645550123",
    objective: "Ask about availability",
    context: "",
    mustAsk: [],
    callerIdentity: "a client",
    voicemailPolicy: "hang_up",
    preAuthorizations: [],
    userApproved: true,
    ...overrides,
  };
}

function stubBackend(
  statusByCall: Record<string, Partial<CallStatus>> = {},
): CallBackend {
  return {
    id: "mock",
    capabilities: {
      supportsPause: false,
      supportsSupervision: false,
      supportsWarmTransfer: false,
      supportsDtmf: false,
    },
    async dispatchCall() {
      return { callId: "stub-call" };
    },
    async getStatus(callId) {
      return {
        callId,
        state: "completed",
        completed: true,
        disposition: "completed",
        summary: "All questions answered.",
        ...statusByCall[callId],
      };
    },
    async getArtifacts() {
      throw new Error("not implemented");
    },
    async cancelCall() {},
  };
}

interface BuildOptions {
  store?: InMemoryMembershipStore;
  orgId?: string | null;
  demoMode?: boolean;
  backend?: CallBackend;
}

async function buildApp(options: BuildOptions = {}): Promise<{
  app: FastifyInstance;
  store: InMemoryMembershipStore;
}> {
  const store = options.store ?? new InMemoryMembershipStore();
  const app = Fastify({ logger: false });
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    request.auth = {
      userId: USER_ID,
      orgId: options.orgId === undefined ? ORG_A : options.orgId,
    };
  });
  await app.register(membersRoutes, {
    prefix: "/api/v1/members",
    store,
    backend: options.backend ?? stubBackend(),
    demoMode: () => options.demoMode ?? false,
    purchase: { enabled: false },
  });
  return { app, store };
}

describe("GET /api/v1/members/me", () => {
  test("reports empty subscription, no number, and default settings", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/members/me",
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.deepEqual(body.subscription, { status: null, plan: null });
    assert.equal(body.dedicatedNumber, null);
    assert.equal(body.settings.voicemailPolicy, "hang_up");
    assert.equal(body.org.id, ORG_A);
    await app.close();
  });

  test("reports the durable subscription state and the provisioned number", async () => {
    const { app, store } = await buildApp();
    store.setSubscription(ORG_A, { status: "active", plan: "pro" });
    store.setOrganization({ id: ORG_A, name: "Monli Pets" });
    await store.insertOrgPhoneNumber({
      orgId: ORG_A,
      phoneE164: "+18645550777",
      retellNumberRef: null,
      status: "simulated",
      areaCode: "864",
    });

    const body = (
      await app.inject({ method: "GET", url: "/api/v1/members/me" })
    ).json();
    assert.deepEqual(body.subscription, { status: "active", plan: "pro" });
    assert.equal(body.org.name, "Monli Pets");
    assert.equal(body.dedicatedNumber.phoneE164, "+18645550777");
    assert.equal(body.dedicatedNumber.status, "simulated");
    await app.close();
  });

  test("DEMO_MODE reports a synthetic demo_active subscription", async () => {
    const { app } = await buildApp({ demoMode: true });
    const body = (
      await app.inject({ method: "GET", url: "/api/v1/members/me" })
    ).json();
    assert.equal(body.subscription.status, "demo_active");
    await app.close();
  });

  test("403 without an org context", async () => {
    const { app } = await buildApp({ orgId: null });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/members/me",
    });
    assert.equal(response.statusCode, 403);
    await app.close();
  });
});

describe("POST /api/v1/members/onboarding/number", () => {
  test("402 subscription_required without an active subscription", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/members/onboarding/number",
      payload: { areaCode: "864" },
    });
    assert.equal(response.statusCode, 402);
    assert.equal(response.json().reason, "subscription_required");
    await app.close();
  });

  test("provisions a simulated number for an active subscription; idempotent on repeat", async () => {
    const { app, store } = await buildApp();
    store.setSubscription(ORG_A, { status: "active", plan: "starter" });

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/members/onboarding/number",
      payload: { areaCode: "864" },
    });
    assert.equal(first.statusCode, 200, first.body);
    const firstBody = first.json();
    assert.equal(firstBody.simulated, true);
    assert.equal(firstBody.alreadyProvisioned, false);
    assert.match(firstBody.number.phoneE164, /^\+1864555\d{4}$/);

    const second = await app.inject({
      method: "POST",
      url: "/api/v1/members/onboarding/number",
      payload: {},
    });
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().alreadyProvisioned, true);
    assert.equal(second.json().number.id, firstBody.number.id);
    await app.close();
  });

  test("a trialing subscription may onboard", async () => {
    const { app, store } = await buildApp();
    store.setSubscription(ORG_A, { status: "trialing", plan: "starter" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/members/onboarding/number",
      payload: {},
    });
    assert.equal(response.statusCode, 200, response.body);
    await app.close();
  });

  test("DEMO_MODE succeeds without any subscription", async () => {
    const { app } = await buildApp({ demoMode: true });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/members/onboarding/number",
      payload: {},
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().simulated, true);
    await app.close();
  });

  test("rejects a malformed area code", async () => {
    const { app, store } = await buildApp();
    store.setSubscription(ORG_A, { status: "active", plan: "starter" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/members/onboarding/number",
      payload: { areaCode: "86" },
    });
    assert.equal(response.statusCode, 400);
    await app.close();
  });
});

describe("GET/PUT /api/v1/members/settings", () => {
  test("round-trips a settings update", async () => {
    const { app } = await buildApp();
    const put = await app.inject({
      method: "PUT",
      url: "/api/v1/members/settings",
      payload: {
        callerIdentity: "Riley at Monli Pets",
        voicemailPolicy: "retry_later",
        transferNumber: "+18645551234",
      },
    });
    assert.equal(put.statusCode, 200, put.body);
    assert.equal(put.json().settings.voicemailPolicy, "retry_later");

    const get = await app.inject({
      method: "GET",
      url: "/api/v1/members/settings",
    });
    assert.deepEqual(get.json().settings, {
      callerIdentity: "Riley at Monli Pets",
      voicemailPolicy: "retry_later",
      transferNumber: "+18645551234",
      updatedAt: get.json().settings.updatedAt,
    });
    assert.ok(get.json().settings.updatedAt);
    await app.close();
  });

  test("partial updates keep unspecified fields", async () => {
    const { app } = await buildApp();
    await app.inject({
      method: "PUT",
      url: "/api/v1/members/settings",
      payload: { callerIdentity: "Front desk" },
    });
    const second = await app.inject({
      method: "PUT",
      url: "/api/v1/members/settings",
      payload: { voicemailPolicy: "leave_message" },
    });
    const settings = second.json().settings;
    assert.equal(settings.callerIdentity, "Front desk");
    assert.equal(settings.voicemailPolicy, "leave_message");
    await app.close();
  });

  test("rejects an invalid voicemail policy", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "PUT",
      url: "/api/v1/members/settings",
      payload: { voicemailPolicy: "scream" },
    });
    assert.equal(response.statusCode, 400);
    await app.close();
  });

  test("rejects a non-US-E.164 transfer number", async () => {
    const { app } = await buildApp();
    for (const transferNumber of ["867-5309", "+448645550123", "5551234"]) {
      const response = await app.inject({
        method: "PUT",
        url: "/api/v1/members/settings",
        payload: { transferNumber },
      });
      assert.equal(response.statusCode, 400, `accepted ${transferNumber}`);
    }
    await app.close();
  });
});

describe("GET /api/v1/members/calls", () => {
  beforeEach(() => resetDispatchRegistry());
  afterEach(() => resetDispatchRegistry());

  function seedDispatch(callId: string, orgId: string, dispatchedAt: string) {
    recordDispatch({
      callId,
      orgId,
      plan: makePlan({ businessName: `Business ${callId}` }),
      taskType: "make_inquiry",
      complianceTaskType: "general_inquiry",
      dispatchedAt,
    });
  }

  test("lists only the org's calls, newest first, with live status", async () => {
    seedDispatch("call-old", ORG_A, "2026-07-01T10:00:00.000Z");
    seedDispatch("call-new", ORG_A, "2026-07-02T10:00:00.000Z");
    seedDispatch("call-foreign", ORG_B, "2026-07-03T10:00:00.000Z");

    const { app } = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/members/calls",
    });
    assert.equal(response.statusCode, 200);
    const { calls, nextCursor } = response.json();
    assert.equal(calls.length, 2);
    assert.equal(nextCursor, null);
    assert.deepEqual(
      calls.map((call: { callId: string }) => call.callId),
      ["call-new", "call-old"],
    );
    assert.deepEqual(calls[0], {
      callId: "call-new",
      businessName: "Business call-new",
      status: "completed",
      disposition: "completed",
      summary: "All questions answered.",
      createdAt: "2026-07-02T10:00:00.000Z",
      hasArtifacts: true,
    });
    await app.close();
  });

  test("paginates with limit and cursor", async () => {
    seedDispatch("call-1", ORG_A, "2026-07-01T10:00:00.000Z");
    seedDispatch("call-2", ORG_A, "2026-07-02T10:00:00.000Z");
    seedDispatch("call-3", ORG_A, "2026-07-03T10:00:00.000Z");

    const { app } = await buildApp();
    const page1 = (
      await app.inject({ method: "GET", url: "/api/v1/members/calls?limit=2" })
    ).json();
    assert.deepEqual(
      page1.calls.map((call: { callId: string }) => call.callId),
      ["call-3", "call-2"],
    );
    assert.equal(page1.nextCursor, "call-2");

    const page2 = (
      await app.inject({
        method: "GET",
        url: `/api/v1/members/calls?limit=2&cursor=${page1.nextCursor}`,
      })
    ).json();
    assert.deepEqual(
      page2.calls.map((call: { callId: string }) => call.callId),
      ["call-1"],
    );
    assert.equal(page2.nextCursor, null);
    await app.close();
  });

  test("a failing status lookup degrades to unknown instead of erroring", async () => {
    seedDispatch("call-err", ORG_A, "2026-07-01T10:00:00.000Z");
    const backend = stubBackend();
    backend.getStatus = async () => {
      throw new Error("provider down");
    };
    const { app } = await buildApp({ backend });
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/members/calls",
    });
    assert.equal(response.statusCode, 200);
    const call = response.json().calls[0];
    assert.equal(call.status, "unknown");
    assert.equal(call.hasArtifacts, false);
    await app.close();
  });
});
