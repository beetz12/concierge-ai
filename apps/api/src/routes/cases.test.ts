import { test, describe } from "node:test";
import assert from "node:assert/strict";
import Fastify, { FastifyInstance } from "fastify";
import casesRoutes from "./cases.js";
import { FakeCasesDb } from "../services/cases/fake-cases-db.js";

/**
 * Route tests for /api/v1/cases with a stubbed auth context and the
 * in-memory fake Supabase client. The real slice-5 auth middleware is
 * covered by tests/auth-middleware.test.ts; here it is reduced to a hook
 * that injects request.auth.
 */

const USER_ID = "11111111-1111-1111-1111-111111111111";
const ORG_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const MISSING_CASE = "99999999-9999-9999-9999-999999999999";

async function buildApp(
  db: FakeCasesDb = new FakeCasesDb(),
  orgId: string | null = ORG_A,
): Promise<{ app: FastifyInstance; db: FakeCasesDb }> {
  const app = Fastify({ logger: false });
  app.decorate("supabase", db as never);
  app.addHook("onRequest", async (request) => {
    request.auth = { userId: USER_ID, orgId };
  });
  await app.register(casesRoutes, { prefix: "/api/v1/cases" });
  return { app, db };
}

async function createFixtureCase(app: FastifyInstance) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/cases",
    payload: {
      title: "Deck repair dispute",
      counterpartyName: "Mike",
      disputeType: "contractor",
      amountAtStake: 450,
    },
  });
  assert.equal(response.statusCode, 201);
  return response.json();
}

describe("POST /api/v1/cases", () => {
  test("creates an org-scoped case and stamps the creator", async () => {
    const { app } = await buildApp();
    const created = await createFixtureCase(app);
    assert.equal(created.org_id, ORG_A);
    assert.equal(created.created_by, USER_ID);
    assert.equal(created.escalation_stage, 1);
    assert.equal(created.status, "open");
    await app.close();
  });

  test("rejects invalid bodies with 400", async () => {
    const { app } = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cases",
      payload: { title: "", disputeType: "feud" },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json().error, "Bad Request");
    await app.close();
  });

  test("returns 403 when the caller has no org membership", async () => {
    const { app } = await buildApp(new FakeCasesDb(), null);
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/cases",
      payload: { title: "No org" },
    });
    assert.equal(response.statusCode, 403);
    await app.close();
  });
});

describe("GET /api/v1/cases", () => {
  test("lists cases with overdue next-actions first and filters by status", async () => {
    const { app } = await buildApp();
    const overdue = await createFixtureCase(app);
    const later = await createFixtureCase(app);

    await app.inject({
      method: "PUT",
      url: `/api/v1/cases/${overdue.id}/next-action`,
      payload: { at: "2020-01-01T00:00:00.000Z" },
    });

    const list = await app.inject({ method: "GET", url: "/api/v1/cases" });
    assert.equal(list.statusCode, 200);
    const { cases } = list.json();
    assert.equal(cases.length, 2);
    assert.equal(cases[0].id, overdue.id, "overdue case sorts first");
    assert.equal(cases[1].id, later.id);

    const filtered = await app.inject({
      method: "GET",
      url: "/api/v1/cases?status=resolved",
    });
    assert.equal(filtered.json().cases.length, 0);

    const badFilter = await app.inject({
      method: "GET",
      url: "/api/v1/cases?status=bogus",
    });
    assert.equal(badFilter.statusCode, 400);
    await app.close();
  });
});

describe("GET/PATCH/DELETE /api/v1/cases/:caseId", () => {
  test("fetches, updates, and deletes a case; 404s when gone", async () => {
    const { app } = await buildApp();
    const created = await createFixtureCase(app);

    const fetched = await app.inject({
      method: "GET",
      url: `/api/v1/cases/${created.id}`,
    });
    assert.equal(fetched.statusCode, 200);
    assert.equal(fetched.json().title, "Deck repair dispute");

    const patched = await app.inject({
      method: "PATCH",
      url: `/api/v1/cases/${created.id}`,
      payload: { status: "resolved", resolution: "Refund received" },
    });
    assert.equal(patched.statusCode, 200);
    assert.equal(patched.json().status, "resolved");
    assert.equal(patched.json().resolution, "Refund received");

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/v1/cases/${created.id}`,
    });
    assert.equal(deleted.statusCode, 204);

    const gone = await app.inject({
      method: "GET",
      url: `/api/v1/cases/${created.id}`,
    });
    assert.equal(gone.statusCode, 404);
    await app.close();
  });

  test("validates the caseId param and unknown ids", async () => {
    const { app } = await buildApp();
    const badId = await app.inject({
      method: "GET",
      url: "/api/v1/cases/not-a-uuid",
    });
    assert.equal(badId.statusCode, 400);

    const missing = await app.inject({
      method: "PATCH",
      url: `/api/v1/cases/${MISSING_CASE}`,
      payload: { title: "ghost" },
    });
    assert.equal(missing.statusCode, 404);
    await app.close();
  });
});

describe("timeline routes", () => {
  test("appends events and lists the timeline newest-first by default", async () => {
    const { app } = await buildApp();
    const created = await createFixtureCase(app);

    const first = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${created.id}/events`,
      payload: {
        kind: "note",
        summary: "Left voicemail",
        occurredAt: "2026-06-01T10:00:00.000Z",
      },
    });
    assert.equal(first.statusCode, 201);

    const second = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${created.id}/events`,
      payload: {
        kind: "evidence",
        summary: "Uploaded photos",
        occurredAt: "2026-06-05T10:00:00.000Z",
      },
    });
    assert.equal(second.statusCode, 201);

    const timeline = await app.inject({
      method: "GET",
      url: `/api/v1/cases/${created.id}/timeline`,
    });
    assert.equal(timeline.statusCode, 200);
    assert.deepEqual(
      timeline.json().events.map((e: { summary: string }) => e.summary),
      ["Uploaded photos", "Left voicemail"],
      "newest first by default",
    );

    const asc = await app.inject({
      method: "GET",
      url: `/api/v1/cases/${created.id}/timeline?order=asc`,
    });
    assert.deepEqual(
      asc.json().events.map((e: { summary: string }) => e.summary),
      ["Left voicemail", "Uploaded photos"],
    );

    const orphan = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${MISSING_CASE}/events`,
      payload: { kind: "note", summary: "orphan" },
    });
    assert.equal(orphan.statusCode, 404);
    await app.close();
  });
});

describe("POST /api/v1/cases/:caseId/stage", () => {
  test("advances monotonically, 409s on skips, honors override", async () => {
    const { app } = await buildApp();
    const created = await createFixtureCase(app);

    const step = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${created.id}/stage`,
      payload: { stage: 2 },
    });
    assert.equal(step.statusCode, 200);
    assert.equal(step.json().case.escalation_stage, 2);
    assert.equal(step.json().event.kind, "status_change");

    const skip = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${created.id}/stage`,
      payload: { stage: 4 },
    });
    assert.equal(skip.statusCode, 409);
    assert.match(skip.json().message, /override/);

    const override = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${created.id}/stage`,
      payload: { stage: 4, override: true },
    });
    assert.equal(override.statusCode, 200);
    assert.equal(override.json().case.escalation_stage, 4);
    await app.close();
  });
});

describe("PUT /api/v1/cases/:caseId/next-action", () => {
  test("sets and clears the next action", async () => {
    const { app } = await buildApp();
    const created = await createFixtureCase(app);

    const set = await app.inject({
      method: "PUT",
      url: `/api/v1/cases/${created.id}/next-action`,
      payload: { at: "2026-07-10T09:00:00.000Z" },
    });
    assert.equal(set.statusCode, 200);
    assert.equal(set.json().next_action_at, "2026-07-10T09:00:00.000Z");

    const clear = await app.inject({
      method: "PUT",
      url: `/api/v1/cases/${created.id}/next-action`,
      payload: { at: null },
    });
    assert.equal(clear.statusCode, 200);
    assert.equal(clear.json().next_action_at, null);

    const invalid = await app.inject({
      method: "PUT",
      url: `/api/v1/cases/${created.id}/next-action`,
      payload: { at: "someday" },
    });
    assert.equal(invalid.statusCode, 400);
    await app.close();
  });
});

describe("attach routes", () => {
  test("attach-call and attach-sms write timeline events with refs", async () => {
    const { app } = await buildApp();
    const created = await createFixtureCase(app);

    const call = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${created.id}/attach-call`,
      payload: {
        callId: "lk-room-9",
        summary: "Follow-up call, spoke with Dana",
        repName: "Dana",
        promises: [{ who: "Dana", what: "email confirmation", dueDate: "2026-07-04" }],
      },
    });
    assert.equal(call.statusCode, 201);
    assert.equal(call.json().kind, "call");
    assert.equal(call.json().payload.call_id, "lk-room-9");
    assert.equal(call.json().payload.promises.length, 1);

    const sms = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${created.id}/attach-sms`,
      payload: {
        messageId: "SM42",
        direction: "inbound",
        summary: "They confirmed the appointment",
      },
    });
    assert.equal(sms.statusCode, 201);
    assert.equal(sms.json().payload.message_id, "SM42");

    const missing = await app.inject({
      method: "POST",
      url: `/api/v1/cases/${MISSING_CASE}/attach-call`,
      payload: { callId: "x", summary: "orphan" },
    });
    assert.equal(missing.statusCode, 404);
    await app.close();
  });
});

describe("GET /api/v1/cases/:caseId/context", () => {
  test("returns the prior-interaction block for a CallPlan", async () => {
    const { app } = await buildApp();
    const created = await createFixtureCase(app);
    await app.inject({
      method: "POST",
      url: `/api/v1/cases/${created.id}/attach-call`,
      payload: {
        callId: "lk-room-1",
        summary: "Initial call",
        occurredAt: "2026-06-01T12:00:00.000Z",
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/v1/cases/${created.id}/context`,
    });
    assert.equal(response.statusCode, 200);
    const body = response.json();
    assert.equal(body.caseId, created.id);
    assert.match(body.context, /^PRIOR CASE CONTEXT/);
    assert.match(body.context, /- 2026-06-01 \[call\] Initial call/);

    const missing = await app.inject({
      method: "GET",
      url: `/api/v1/cases/${MISSING_CASE}/context`,
    });
    assert.equal(missing.statusCode, 404);
    await app.close();
  });
});
