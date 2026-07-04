import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import demoCallRoutes, { type DemoCallRoutesOptions } from "./demo-call.js";
import {
  InMemoryTokenBucketRateLimiter,
} from "../services/rate-limit/token-bucket.js";
import type { CallBackend, CallPlan } from "../services/call-backend/index.js";

/**
 * Route tests for the public POST /api/v1/demo-call endpoint. The real tenant
 * auth middleware exempts this path (it is anonymous by design); here we mount
 * the plugin directly and inject a stub backend so no real telephony runs.
 */

const VALID_NUMBER = "+18645550132";
const DAY_SECONDS = 24 * 60 * 60;

/** A dispatch-recording stub backend; other methods are unused here. */
function makeBackend(): { backend: CallBackend; plans: CallPlan[] } {
  const plans: CallPlan[] = [];
  const backend: CallBackend = {
    id: "mock",
    capabilities: {
      supportsPause: false,
      supportsSupervision: false,
      supportsWarmTransfer: false,
      supportsDtmf: false,
    },
    async dispatchCall(plan) {
      plans.push(plan);
      return { callId: `call-${plans.length}` };
    },
    async getStatus() {
      throw new Error("not used");
    },
    async getArtifacts() {
      throw new Error("not used");
    },
    async cancelCall() {
      throw new Error("not used");
    },
  };
  return { backend, plans };
}

/** One demo call per number per 24h (capacity 1, negligible refill). */
function dailyLimiter(): InMemoryTokenBucketRateLimiter {
  return new InMemoryTokenBucketRateLimiter({
    capacity: 1,
    refillPerSecond: 1 / DAY_SECONDS,
  });
}

async function buildApp(
  options: DemoCallRoutesOptions,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate("supabase", {} as never);
  await app.register(demoCallRoutes, { prefix: "/api/v1/demo-call", ...options });
  return app;
}

function post(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/api/v1/demo-call", payload });
}

describe("POST /api/v1/demo-call — validation", () => {
  test("rejects a non-E.164 number with 400", async () => {
    const app = await buildApp({ demoCallEnabled: () => false });
    const res = await post(app, { phoneNumber: "864-555-0132", consent: true });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().error, "Bad Request");
    await app.close();
  });

  test("rejects a non-US E.164 number with 400", async () => {
    const app = await buildApp({ demoCallEnabled: () => false });
    const res = await post(app, { phoneNumber: "+447700900123", consent: true });
    assert.equal(res.statusCode, 400);
    await app.close();
  });

  test("rejects a missing or false consent with 400", async () => {
    const app = await buildApp({ demoCallEnabled: () => false });
    const noConsent = await post(app, { phoneNumber: VALID_NUMBER });
    assert.equal(noConsent.statusCode, 400);
    const falseConsent = await post(app, {
      phoneNumber: VALID_NUMBER,
      consent: false,
    });
    assert.equal(falseConsent.statusCode, 400);
    await app.close();
  });
});

describe("POST /api/v1/demo-call — disabled posture", () => {
  test("returns 200 unavailable and never dials when the flag is off", async () => {
    const { backend, plans } = makeBackend();
    const app = await buildApp({
      demoCallEnabled: () => false,
      retellConfigured: () => true,
      backend,
    });
    const res = await post(app, { phoneNumber: VALID_NUMBER, consent: true });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, "unavailable");
    assert.equal(plans.length, 0, "no call dispatched while disabled");
    await app.close();
  });

  test("returns 200 unavailable when Retell is not configured", async () => {
    const { backend, plans } = makeBackend();
    const app = await buildApp({
      demoCallEnabled: () => true,
      retellConfigured: () => false,
      backend,
    });
    const res = await post(app, { phoneNumber: VALID_NUMBER, consent: true });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, "unavailable");
    assert.equal(plans.length, 0);
    await app.close();
  });
});

describe("POST /api/v1/demo-call — rate limiting", () => {
  test("locks a number to one demo call per 24h window", async () => {
    const app = await buildApp({
      demoCallEnabled: () => false,
      numberRateLimiter: dailyLimiter(),
    });
    const first = await post(app, { phoneNumber: VALID_NUMBER, consent: true });
    assert.equal(first.statusCode, 200);
    const second = await post(app, { phoneNumber: VALID_NUMBER, consent: true });
    assert.equal(second.statusCode, 429);
    assert.equal(second.json().error, "Too Many Requests");
    await app.close();
  });

  test("applies a per-IP ceiling across distinct numbers", async () => {
    const app = await buildApp({
      demoCallEnabled: () => false,
      ipRateLimiter: dailyLimiter(),
    });
    const first = await post(app, { phoneNumber: "+18645550101", consent: true });
    assert.equal(first.statusCode, 200);
    const second = await post(app, {
      phoneNumber: "+18645550102",
      consent: true,
    });
    assert.equal(second.statusCode, 429);
    await app.close();
  });
});

describe("POST /api/v1/demo-call — enabled dispatch", () => {
  test("dispatches a consented, server-approved demo call when enabled", async () => {
    const { backend, plans } = makeBackend();
    const app = await buildApp({
      demoCallEnabled: () => true,
      retellConfigured: () => true,
      backend,
    });
    const res = await post(app, { phoneNumber: VALID_NUMBER, consent: true });
    assert.equal(res.statusCode, 202);
    assert.equal(res.json().status, "dispatched");
    assert.equal(plans.length, 1);
    assert.equal(plans[0]?.phoneNumber, VALID_NUMBER);
    assert.equal(
      plans[0]?.userApproved,
      true,
      "server sets the two-gate approval for this consented demo",
    );
    await app.close();
  });

  test("fails soft to unavailable when the backend throws", async () => {
    const backend: CallBackend = {
      ...makeBackend().backend,
      async dispatchCall() {
        throw new Error("telephony boom");
      },
    };
    const app = await buildApp({
      demoCallEnabled: () => true,
      retellConfigured: () => true,
      backend,
    });
    const res = await post(app, { phoneNumber: VALID_NUMBER, consent: true });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, "unavailable");
    await app.close();
  });
});
