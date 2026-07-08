import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import demoFunnelRoutes, {
  type DemoFunnelRoutesOptions,
} from "./demo-funnel.js";
import { InMemoryDemoFunnelStore } from "../services/demo-funnel/store.js";
import { issueVerificationToken } from "../services/demo-funnel/otp.js";
import type { OtpSmsSender } from "../services/demo-funnel/sms.js";
import type { CallBackend, CallPlan } from "../services/call-backend/index.js";

/**
 * Route tests for the public /api/v1/demo-funnel endpoints. The real tenant
 * auth middleware exempts this prefix (anonymous by design); here we mount
 * the plugin directly with the in-memory store, a recording fake SMS sender,
 * and a stub call backend — no network, no Supabase, no real SMS or calls.
 */

const VALID_NUMBER = "+18645550132";
const TEST_SECRET = "demo-funnel-test-secret";

/** Fake SMS sender that records every (to, code) pair. */
function makeSmsSender(): {
  sender: OtpSmsSender;
  sends: Array<{ to: string; code: string }>;
} {
  const sends: Array<{ to: string; code: string }> = [];
  return {
    sends,
    sender: {
      async sendOtp(to, code) {
        sends.push({ to, code });
        return { sent: true, simulated: true };
      },
    },
  };
}

/** Dispatch-recording stub backend with scripted status. */
function makeBackend(): { backend: CallBackend; plans: CallPlan[] } {
  const plans: CallPlan[] = [];
  let counter = 0;
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
      counter += 1;
      return { callId: `stub-call-${counter}` };
    },
    async getStatus(callId) {
      return {
        callId,
        state: "completed",
        completed: true,
        disposition: "completed",
        summary: "Demo call finished.",
      };
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

interface TestApp {
  app: FastifyInstance;
  store: InMemoryDemoFunnelStore;
  sends: Array<{ to: string; code: string }>;
  plans: CallPlan[];
}

async function buildApp(
  options: Partial<DemoFunnelRoutesOptions> = {},
): Promise<TestApp> {
  const store =
    (options.store as InMemoryDemoFunnelStore | undefined) ??
    new InMemoryDemoFunnelStore();
  const sms = makeSmsSender();
  const { backend, plans } = makeBackend();
  const app = Fastify({ logger: false });
  app.decorate("supabase", {} as never);
  await app.register(demoFunnelRoutes, {
    prefix: "/api/v1/demo-funnel",
    demoFunnelEnabled: () => true,
    otpHashSecret: TEST_SECRET,
    store,
    smsSender: options.smsSender ?? sms.sender,
    backend: options.backend ?? backend,
    ...options,
  });
  return { app, store, sends: sms.sends, plans };
}

function post(app: FastifyInstance, url: string, payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url: `/api/v1/demo-funnel${url}`, payload });
}

/** Full happy path up to a verification token for `phone`. */
async function getVerifiedToken(t: TestApp, phone = VALID_NUMBER): Promise<string> {
  const sent = await post(t.app, "/otp/send", { phoneNumber: phone });
  assert.equal(sent.statusCode, 200, sent.body);
  assert.equal(sent.json().status, "sent");
  const code = t.sends.at(-1)?.code;
  assert.ok(code, "fake sender captured a code");
  const verified = await post(t.app, "/otp/verify", { phoneNumber: phone, code });
  assert.equal(verified.statusCode, 200, verified.body);
  assert.equal(verified.json().status, "verified");
  return verified.json().verificationToken as string;
}

describe("demo-funnel — feature flag off", () => {
  test("every endpoint returns unavailable and nothing sends or dials", async () => {
    const t = await buildApp({ demoFunnelEnabled: () => false });
    const scenarios = await t.app.inject({
      method: "GET",
      url: "/api/v1/demo-funnel/scenarios",
    });
    assert.equal(scenarios.statusCode, 200);
    assert.equal(scenarios.json().status, "unavailable");

    const send = await post(t.app, "/otp/send", { phoneNumber: VALID_NUMBER });
    assert.equal(send.json().status, "unavailable");

    const verify = await post(t.app, "/otp/verify", {
      phoneNumber: VALID_NUMBER,
      code: "123456",
    });
    assert.equal(verify.json().status, "unavailable");

    const call = await post(t.app, "/call", {
      verificationToken: "x",
      scenarioId: "refund-request",
    });
    assert.equal(call.json().status, "unavailable");

    const status = await t.app.inject({
      method: "GET",
      url: "/api/v1/demo-funnel/call/some-id/status?token=x",
    });
    assert.equal(status.json().status, "unavailable");

    assert.equal(t.sends.length, 0, "no SMS while disabled");
    assert.equal(t.plans.length, 0, "no dial while disabled");
    await t.app.close();
  });
});

describe("GET /scenarios", () => {
  test("lists the catalog including the disabled custom entry, without scripts", async () => {
    const t = await buildApp();
    const res = await t.app.inject({
      method: "GET",
      url: "/api/v1/demo-funnel/scenarios",
    });
    assert.equal(res.statusCode, 200);
    const { scenarios } = res.json();
    const ids = scenarios.map((s: { id: string }) => s.id);
    assert.ok(ids.includes("refund-request"));
    assert.ok(ids.includes("hours-availability"));
    const custom = scenarios.find((s: { id: string }) => s.id === "custom");
    assert.equal(custom.enabled, false);
    assert.equal(custom.requiresMembership, true);
    for (const scenario of scenarios) {
      assert.equal(
        "callScript" in scenario,
        false,
        "server-side prompt content is not exposed",
      );
    }
    await t.app.close();
  });
});

describe("POST /otp/send", () => {
  test("rejects an invalid phone number with 400", async () => {
    const t = await buildApp();
    const res = await post(t.app, "/otp/send", { phoneNumber: "not-a-phone" });
    assert.equal(res.statusCode, 400);
    assert.equal(t.sends.length, 0);
    await t.app.close();
  });

  test("normalizes formatted US numbers and sends a 6-digit code", async () => {
    const t = await buildApp();
    const res = await post(t.app, "/otp/send", { phoneNumber: "(864) 555-0132" });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, "sent");
    assert.equal(t.sends[0]?.to, VALID_NUMBER);
    assert.match(t.sends[0]?.code ?? "", /^\d{6}$/);
    await t.app.close();
  });

  test("enforces the per-number send limit (3/hour) with retryAfter", async () => {
    const t = await buildApp();
    for (let i = 0; i < 3; i++) {
      const res = await post(t.app, "/otp/send", { phoneNumber: VALID_NUMBER });
      assert.equal(res.statusCode, 200);
    }
    const res = await post(t.app, "/otp/send", { phoneNumber: VALID_NUMBER });
    assert.equal(res.statusCode, 429);
    assert.ok(res.json().retryAfter >= 1);
    assert.ok(res.headers["retry-after"]);
    assert.equal(t.sends.length, 3, "the rate-limited request sent no SMS");
    await t.app.close();
  });

  test("enforces the per-IP send limit (5/hour) across distinct numbers", async () => {
    const t = await buildApp();
    const numbers = [
      "+18645550101",
      "+18645550105",
      "+18645550106",
      "+18645550107",
      "+18645550108",
    ];
    for (const phoneNumber of numbers) {
      const res = await post(t.app, "/otp/send", { phoneNumber });
      assert.equal(res.statusCode, 200, res.body);
    }
    const res = await post(t.app, "/otp/send", { phoneNumber: "+18645550109" });
    assert.equal(res.statusCode, 429);
    assert.ok(res.json().retryAfter >= 1);
    assert.equal(t.sends.length, 5);
    await t.app.close();
  });

  test("a number that already got its call short-circuits WITHOUT sending SMS", async () => {
    const t = await buildApp();
    await t.store.createDemoCall({
      phoneE164: VALID_NUMBER,
      scenarioId: "refund-request",
      consentCapturedAt: new Date().toISOString(),
      consentIp: null,
      disclosureVersion: "demo-disclosure-v1",
    });
    const res = await post(t.app, "/otp/send", { phoneNumber: VALID_NUMBER });
    assert.equal(res.statusCode, 200);
    assert.equal(res.json().status, "already_used");
    assert.equal(t.sends.length, 0, "no SMS for an already-used number");
    await t.app.close();
  });
});

describe("POST /otp/verify", () => {
  test("wrong code decrements attemptsRemaining then locks after 5 failures", async () => {
    const t = await buildApp();
    await post(t.app, "/otp/send", { phoneNumber: VALID_NUMBER });
    const realCode = t.sends[0]!.code;
    const wrongCode = realCode === "000000" ? "000001" : "000000";

    for (let attempt = 1; attempt <= 4; attempt++) {
      const res = await post(t.app, "/otp/verify", {
        phoneNumber: VALID_NUMBER,
        code: wrongCode,
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().status, "invalid");
      assert.equal(res.json().attemptsRemaining, 5 - attempt);
    }

    // 5th failure locks the code…
    const fifth = await post(t.app, "/otp/verify", {
      phoneNumber: VALID_NUMBER,
      code: wrongCode,
    });
    assert.equal(fifth.statusCode, 400);
    assert.equal(fifth.json().status, "locked");

    // …and even the RIGHT code is refused afterwards.
    const late = await post(t.app, "/otp/verify", {
      phoneNumber: VALID_NUMBER,
      code: realCode,
    });
    assert.equal(late.statusCode, 400);
    assert.equal(late.json().status, "locked");
    await t.app.close();
  });

  test("an expired code returns 410", async () => {
    const t = await buildApp();
    await post(t.app, "/otp/send", { phoneNumber: VALID_NUMBER });
    const record = t.store.otpRequests[0]!;
    record.expiresAt = new Date(Date.now() - 1000).toISOString();
    const res = await post(t.app, "/otp/verify", {
      phoneNumber: VALID_NUMBER,
      code: t.sends[0]!.code,
    });
    assert.equal(res.statusCode, 410);
    assert.equal(res.json().status, "expired");
    await t.app.close();
  });

  test("verifying with no code ever sent returns 410", async () => {
    const t = await buildApp();
    const res = await post(t.app, "/otp/verify", {
      phoneNumber: VALID_NUMBER,
      code: "123456",
    });
    assert.equal(res.statusCode, 410);
    await t.app.close();
  });

  test("the correct code yields a verification token and is single-use", async () => {
    const t = await buildApp();
    const token = await getVerifiedToken(t);
    assert.ok(token.length > 20);
    // The consumed code cannot be verified twice.
    const replay = await post(t.app, "/otp/verify", {
      phoneNumber: VALID_NUMBER,
      code: t.sends[0]!.code,
    });
    assert.equal(replay.statusCode, 410);
    await t.app.close();
  });
});

describe("POST /call — lifetime limit", () => {
  test("first call dispatches; a second call for the same number is 409 even with a fresh OTP", async () => {
    const t = await buildApp();
    const token = await getVerifiedToken(t);
    const first = await post(t.app, "/call", {
      verificationToken: token,
      scenarioId: "refund-request",
    });
    assert.equal(first.statusCode, 202, first.body);
    assert.equal(first.json().status, "dispatched");
    assert.ok(first.json().callId);
    assert.equal(t.plans.length, 1);

    // A fresh, validly-signed verification token for the SAME number (the
    // /otp/send route itself already short-circuits with already_used once a
    // call exists, so the live replay vector is a still-valid token).
    const freshToken = await issueVerificationToken(VALID_NUMBER, TEST_SECRET);
    const second = await post(t.app, "/call", {
      verificationToken: freshToken,
      scenarioId: "appointment-check",
    });
    assert.equal(second.statusCode, 409);
    assert.equal(second.json().status, "already_used");
    assert.equal(t.plans.length, 1, "no second dial for the same number");
    await t.app.close();
  });

  test("records consent metadata and updates the row with callId/backend", async () => {
    const t = await buildApp();
    const token = await getVerifiedToken(t);
    const res = await post(t.app, "/call", {
      verificationToken: token,
      scenarioId: "reservation-booking",
    });
    assert.equal(res.statusCode, 202);
    const record = t.store.demoCalls.get(VALID_NUMBER);
    assert.ok(record);
    assert.equal(record.scenarioId, "reservation-booking");
    assert.equal(record.disclosureVersion, "demo-disclosure-v1");
    assert.ok(record.consentCapturedAt);
    assert.equal(record.callId, res.json().callId);
    assert.equal(record.backend, "mock");
    await t.app.close();
  });
});

describe("POST /call — anti-abuse binding", () => {
  test("a body smuggling a different number still dials ONLY the token phone", async () => {
    const t = await buildApp();
    const token = await getVerifiedToken(t, VALID_NUMBER);
    const res = await post(t.app, "/call", {
      verificationToken: token,
      scenarioId: "quote-request",
      // Attacker-controlled extras: all must be ignored.
      phoneNumber: "+19998887777",
      phone: "+19998887777",
      to: "+19998887777",
    });
    assert.equal(res.statusCode, 202, res.body);
    assert.equal(t.plans.length, 1);
    assert.equal(
      t.plans[0]!.phoneNumber,
      VALID_NUMBER,
      "dial target comes exclusively from the verified token",
    );
    assert.equal(t.plans[0]!.userApproved, true);
    await t.app.close();
  });

  test("a garbage or unsigned token is rejected with 401", async () => {
    const t = await buildApp();
    const res = await post(t.app, "/call", {
      verificationToken: "not-a-jwt",
      scenarioId: "refund-request",
    });
    assert.equal(res.statusCode, 401);
    assert.equal(t.plans.length, 0);
    await t.app.close();
  });

  test("the disabled custom scenario cannot be dispatched", async () => {
    const t = await buildApp();
    const token = await getVerifiedToken(t);
    const res = await post(t.app, "/call", {
      verificationToken: token,
      scenarioId: "custom",
    });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().status, "membership_required");
    assert.equal(t.plans.length, 0);
    await t.app.close();
  });

  test("a dispatch failure releases the lifetime slot instead of burning it", async () => {
    const failing: CallBackend = {
      ...makeBackend().backend,
      async dispatchCall() {
        throw new Error("telephony boom");
      },
    };
    const t = await buildApp({ backend: failing });
    const token = await getVerifiedToken(t);
    const res = await post(t.app, "/call", {
      verificationToken: token,
      scenarioId: "refund-request",
    });
    assert.equal(res.statusCode, 502);
    assert.equal(
      t.store.demoCalls.size,
      0,
      "reserved row deleted after dispatch failure",
    );
    await t.app.close();
  });
});

describe("GET /call/:callId/status", () => {
  test("proxies backend status for the token's own call", async () => {
    const t = await buildApp();
    const token = await getVerifiedToken(t);
    const call = await post(t.app, "/call", {
      verificationToken: token,
      scenarioId: "order-status",
    });
    const callId = call.json().callId as string;
    const res = await t.app.inject({
      method: "GET",
      url: `/api/v1/demo-funnel/call/${callId}/status?token=${encodeURIComponent(token)}`,
    });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().state, "completed");
    assert.equal(res.json().completed, true);
    assert.equal(t.store.demoCalls.get(VALID_NUMBER)?.status, "completed");
    await t.app.close();
  });

  test("a token for a different number cannot read the call status", async () => {
    const t = await buildApp();
    const token = await getVerifiedToken(t, VALID_NUMBER);
    const call = await post(t.app, "/call", {
      verificationToken: token,
      scenarioId: "order-status",
    });
    const callId = call.json().callId as string;
    const otherToken = await getVerifiedToken(t, "+18645550177");
    const res = await t.app.inject({
      method: "GET",
      url: `/api/v1/demo-funnel/call/${callId}/status?token=${encodeURIComponent(otherToken)}`,
    });
    assert.equal(res.statusCode, 403);
    await t.app.close();
  });
});
