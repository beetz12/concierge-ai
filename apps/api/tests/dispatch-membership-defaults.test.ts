import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import dispatchRoutes from "../src/routes/dispatch.js";
import { resetDispatchRegistry } from "../src/services/dispatch/registry.js";
import { InMemoryMembershipStore } from "../src/services/membership/memory-store.js";
import { InMemoryTokenBucketRateLimiter } from "../src/services/rate-limit/token-bucket.js";
import type {
  CallBackend,
  CallPlan,
} from "../src/services/call-backend/types.js";

/**
 * Membership threading through the dispatch route (goal: membership-api):
 * - the org's dedicated number (active or simulated) becomes plan.fromNumber;
 * - org_call_settings fill callerIdentity / voicemailPolicy when the request
 *   body does not specify them, and never override explicit values.
 *
 * Runs in DEMO_MODE (pure policy engine, no Supabase) with an injected stub
 * backend that captures the dispatched CallPlan.
 */

const ORG_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

const DISPATCH_BODY = {
  contactName: "Acme Plumbing",
  phoneNumber: "+18035550123",
  objective: "Ask about drain repair availability",
  taskType: "make_inquiry" as const,
  userApproved: true as const,
  channel: "voice" as const,
};

function captureBackend(dispatched: CallPlan[]): CallBackend {
  return {
    id: "mock",
    capabilities: {
      supportsPause: false,
      supportsSupervision: false,
      supportsWarmTransfer: false,
      supportsDtmf: false,
    },
    async dispatchCall(plan) {
      dispatched.push(plan);
      return { callId: `stub-${dispatched.length}` };
    },
    async getStatus(callId) {
      return {
        callId,
        state: "queued",
        completed: false,
        disposition: null,
        summary: null,
      };
    },
    async getArtifacts() {
      throw new Error("not implemented");
    },
    async cancelCall() {},
  };
}

async function buildApp(
  backend: CallBackend,
  store: InMemoryMembershipStore,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("supabase", {} as never);
  app.decorateRequest("auth", null);
  app.addHook("onRequest", async (request) => {
    request.auth = { userId: "user-1", orgId: ORG_ID };
  });
  await app.register(dispatchRoutes, {
    backend,
    membershipStore: store,
    rateLimiter: new InMemoryTokenBucketRateLimiter({
      capacity: 100,
      refillPerSecond: 100,
      now: () => 0,
    }),
  });
  return app;
}

describe("dispatch membership defaults + fromNumber threading", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ["DEMO_MODE", "CALL_BACKEND"]) {
      saved[key] = process.env[key];
    }
    process.env.DEMO_MODE = "true";
    delete process.env.CALL_BACKEND;
    resetDispatchRegistry();
  });

  afterEach(() => {
    for (const key of ["DEMO_MODE", "CALL_BACKEND"]) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetDispatchRegistry();
  });

  test("the org's dedicated number and settings defaults reach the backend plan", async () => {
    const dispatched: CallPlan[] = [];
    const store = new InMemoryMembershipStore();
    await store.insertOrgPhoneNumber({
      orgId: ORG_ID,
      phoneE164: "+18645550777",
      retellNumberRef: null,
      status: "simulated",
      areaCode: "864",
    });
    await store.upsertCallSettings(ORG_ID, {
      callerIdentity: "Riley at Monli Pets",
      voicemailPolicy: "retry_later",
      transferNumber: "+18645551234",
    });

    const app = await buildApp(captureBackend(dispatched), store);
    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: DISPATCH_BODY, // no clientName, no voicemailPolicy
    });
    assert.equal(response.statusCode, 200, response.body);

    assert.equal(dispatched.length, 1);
    const plan = dispatched[0]!;
    assert.equal(plan.fromNumber, "+18645550777");
    assert.equal(plan.callerIdentity, "Riley at Monli Pets");
    assert.equal(plan.voicemailPolicy, "retry_later");
    await app.close();
  });

  test("explicit request values are never overridden by org settings", async () => {
    const dispatched: CallPlan[] = [];
    const store = new InMemoryMembershipStore();
    await store.insertOrgPhoneNumber({
      orgId: ORG_ID,
      phoneE164: "+18645550777",
      retellNumberRef: null,
      status: "active",
      areaCode: "864",
    });
    await store.upsertCallSettings(ORG_ID, {
      callerIdentity: "Riley at Monli Pets",
      voicemailPolicy: "retry_later",
    });

    const app = await buildApp(captureBackend(dispatched), store);
    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: {
        ...DISPATCH_BODY,
        clientName: "Dana",
        voicemailPolicy: "hang_up",
      },
    });
    assert.equal(response.statusCode, 200, response.body);

    const plan = dispatched[0]!;
    assert.equal(plan.fromNumber, "+18645550777", "active number still threads");
    assert.equal(plan.callerIdentity, "Dana");
    assert.equal(plan.voicemailPolicy, "hang_up");
    await app.close();
  });

  test("a released number does not become the caller id", async () => {
    const dispatched: CallPlan[] = [];
    const store = new InMemoryMembershipStore();
    await store.insertOrgPhoneNumber({
      orgId: ORG_ID,
      phoneE164: "+18645550777",
      retellNumberRef: null,
      status: "released",
      areaCode: "864",
    });

    const app = await buildApp(captureBackend(dispatched), store);
    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: DISPATCH_BODY,
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(dispatched[0]!.fromNumber, undefined);
    await app.close();
  });

  test("dispatch proceeds when the org has no number and no settings", async () => {
    const dispatched: CallPlan[] = [];
    const app = await buildApp(
      captureBackend(dispatched),
      new InMemoryMembershipStore(),
    );
    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: DISPATCH_BODY,
    });
    assert.equal(response.statusCode, 200, response.body);
    const plan = dispatched[0]!;
    assert.equal(plan.fromNumber, undefined);
    assert.equal(plan.callerIdentity, "a client");
    assert.equal(plan.voicemailPolicy, "hang_up");
    await app.close();
  });
});
