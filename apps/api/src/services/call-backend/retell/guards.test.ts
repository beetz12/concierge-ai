import assert from "node:assert/strict";
import test from "node:test";
import {
  assertRedialAllowed,
  assertSingleUsE164,
  assertUserApproved,
  CallGuardError,
} from "./guards.js";
import { createMockFetch, makePlan, type MockRoute } from "./mock-retell-api.js";
import { RetellHttpClient } from "./retell-http.js";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const HOUR_MS = 3_600_000;

function makeClient(routes: MockRoute[]) {
  const { fetchImpl, requests } = createMockFetch(routes);
  const client = new RetellHttpClient({
    apiKey: "test-key",
    fetchImpl,
    retryDelayMs: 0,
  });
  return { client, requests };
}

function priorCall(overrides: Record<string, unknown> = {}) {
  return {
    call_id: "call_prev",
    call_status: "ended",
    start_timestamp: NOW - 2 * HOUR_MS,
    metadata: {},
    ...overrides,
  };
}

test("assertUserApproved refuses a plan without explicit human approval", () => {
  assert.throws(
    () => assertUserApproved(makePlan({ userApproved: false })),
    (error: unknown) =>
      error instanceof CallGuardError &&
      error.code === "user_approval_required",
  );
  assert.throws(() => assertUserApproved(makePlan({ userApproved: undefined })));
  assert.doesNotThrow(() => assertUserApproved(makePlan()));
});

test("assertSingleUsE164 only accepts a single E.164 US number", () => {
  assert.doesNotThrow(() => assertSingleUsE164("+18645550123"));
  const invalid = [
    "+448645550123", // non-US
    "8645550123", // missing +1
    "+1864555012", // too short
    "+186455501234", // too long
    "+18645550123,+18645550124", // batch dialing refused by design
    "+1 864 555 0123", // formatting
  ];
  for (const phoneNumber of invalid) {
    assert.throws(
      () => assertSingleUsE164(phoneNumber),
      (error: unknown) =>
        error instanceof CallGuardError &&
        error.code === "invalid_phone_number",
      `expected ${phoneNumber} to be refused`,
    );
  }
});

test("redial guard refuses a number already called within 24h", async () => {
  const { client } = makeClient([
    { method: "POST", path: "/v2/list-calls", json: [priorCall()] },
  ]);
  await assert.rejects(
    assertRedialAllowed(client, makePlan(), { now: () => NOW }),
    (error: unknown) =>
      error instanceof CallGuardError &&
      error.code === "redial_blocked" &&
      /allowRedial/.test(error.message) &&
      /2\.0h ago/.test(error.message),
  );
});

test("redial guard is skipped entirely when allowRedial is set", async () => {
  const { client, requests } = makeClient([]);
  await assertRedialAllowed(client, makePlan({ allowRedial: true }), {
    now: () => NOW,
  });
  assert.equal(requests.length, 0);
});

test("redial guard allows calls older than 24h", async () => {
  const { client } = makeClient([
    {
      method: "POST",
      path: "/v2/list-calls",
      json: [priorCall({ start_timestamp: NOW - 25 * HOUR_MS })],
    },
  ]);
  await assertRedialAllowed(client, makePlan(), { now: () => NOW });
});

test("redial guard ignores calls that never rang", async () => {
  const { client } = makeClient([
    {
      method: "POST",
      path: "/v2/list-calls",
      json: [
        priorCall({ call_id: "call_err", call_status: "error" }),
        priorCall({ call_id: "call_nc", call_status: "not_connected" }),
        priorCall({ call_id: "call_nostart", start_timestamp: null }),
      ],
    },
  ]);
  await assertRedialAllowed(client, makePlan(), { now: () => NOW });
});

test("redial guard is scoped per tenant when tenantId is set", async () => {
  const otherTenant = [
    priorCall({ metadata: { tenant_id: "tenant-b" } }),
  ];
  const { client: clientA } = makeClient([
    { method: "POST", path: "/v2/list-calls", json: otherTenant },
  ]);
  // Another tenant's recent call does not block this tenant.
  await assertRedialAllowed(clientA, makePlan({ tenantId: "tenant-a" }), {
    now: () => NOW,
  });

  const sameTenant = [priorCall({ metadata: { tenant_id: "tenant-a" } })];
  const { client: clientB } = makeClient([
    { method: "POST", path: "/v2/list-calls", json: sameTenant },
  ]);
  await assert.rejects(
    assertRedialAllowed(clientB, makePlan({ tenantId: "tenant-a" }), {
      now: () => NOW,
    }),
    (error: unknown) =>
      error instanceof CallGuardError && error.code === "redial_blocked",
  );
});

test("redial guard proceeds with a warning when the lookup fails", async () => {
  const warnings: string[] = [];
  const { client } = makeClient([
    {
      method: "POST",
      path: "/v2/list-calls",
      status: 500,
      json: { message: "internal" },
    },
  ]);
  await assertRedialAllowed(client, makePlan(), {
    now: () => NOW,
    warn: (message) => warnings.push(message),
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /redial-guard lookup failed/);
});
