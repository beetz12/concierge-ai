import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import { z } from "zod";
import errorHandlerPlugin from "../src/plugins/error-handler.js";
import { ComplianceDenyError } from "../src/services/compliance/dispatch.js";
import { CallGuardError } from "../src/services/call-backend/retell/guards.js";
import type { PolicyDecision } from "../src/services/compliance/types.js";

/**
 * Global error + not-found handler tests: consistent JSON envelope with the
 * request id, domain-error status mapping, and 5xx detail hiding.
 */

function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: false,
    genReqId: () => "test-req-id",
  });
  // Register synchronously enough for tests via a ready() below.
  app.register(errorHandlerPlugin);

  app.get("/boom", async () => {
    throw new Error("internal detail that must not leak");
  });
  app.get("/zod", async () => {
    z.object({ n: z.number() }).parse({ n: "nope" });
  });
  app.get("/deny", async () => {
    const decision: PolicyDecision = {
      allow: false,
      reasons: ["quiet_hours"],
      disclosureLines: [],
      recordingMode: "one_party",
      policyVersion: "test",
      quietHoursWindow: { startMinute: 480, endMinute: 1260 },
      consentTierRequired: "none",
    } as unknown as PolicyDecision;
    throw new ComplianceDenyError(decision);
  });
  app.get("/guard", async () => {
    throw new CallGuardError("redial_blocked", "blocked");
  });
  app.get("/badrequest", async () => {
    const err = Object.assign(new Error("bad input"), { statusCode: 400 });
    throw err;
  });

  return app;
}

describe("global error handler", () => {
  test("unhandled error -> 500 with request id, no leaked detail", async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/boom" });
    assert.equal(res.statusCode, 500);
    const body = res.json();
    assert.equal(body.statusCode, 500);
    assert.equal(body.requestId, "test-req-id");
    assert.equal(res.headers["x-request-id"] ?? "test-req-id", "test-req-id");
    assert.ok(!JSON.stringify(body).includes("internal detail"));
    await app.close();
  });

  test("ZodError -> 400 with details", async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/zod" });
    assert.equal(res.statusCode, 400);
    const body = res.json();
    assert.equal(body.error, "Bad Request");
    assert.ok(Array.isArray(body.details));
    assert.equal(body.requestId, "test-req-id");
    await app.close();
  });

  test("ComplianceDenyError -> 403", async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/deny" });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, "ComplianceDenied");
    await app.close();
  });

  test("CallGuardError redial_blocked -> 403", async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/guard" });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().error, "CallGuardRefused");
    await app.close();
  });

  test("error carrying statusCode 400 -> surfaced message", async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/badrequest" });
    assert.equal(res.statusCode, 400);
    assert.equal(res.json().message, "bad input");
    await app.close();
  });

  test("unknown route -> 404 envelope", async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({ method: "GET", url: "/nope" });
    assert.equal(res.statusCode, 404);
    const body = res.json();
    assert.equal(body.statusCode, 404);
    assert.equal(body.requestId, "test-req-id");
    await app.close();
  });
});
