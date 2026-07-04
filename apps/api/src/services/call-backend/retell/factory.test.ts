import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCallBackend,
  resolveCallBackendId,
} from "../index.js";
import {
  createRetellCallBackendFromEnv,
  RetellCallBackend,
} from "./retell-backend.js";
import { RetellHttpClient } from "./retell-http.js";

const mockSupabase = {} as SupabaseClient;

test("resolveCallBackendId honors CALL_BACKEND=retell", () => {
  assert.equal(resolveCallBackendId({ CALL_BACKEND: "retell" }), "retell");
  // Default stays livekit; retell is opt-in.
  assert.equal(resolveCallBackendId({}), "livekit");
});

test("getCallBackend builds a Retell backend from the environment", () => {
  const backend = getCallBackend(
    { supabase: mockSupabase },
    {
      CALL_BACKEND: "retell",
      RETELL_API_KEY: "test-key",
      RETELL_FROM_NUMBER: "+18645550100",
      RETELL_AGENT_ID: "agent_123",
    },
  );
  assert.ok(backend instanceof RetellCallBackend);
  assert.equal(backend.id, "retell");
});

test("createRetellCallBackendFromEnv requires RETELL_API_KEY", () => {
  assert.throws(
    () => createRetellCallBackendFromEnv({ supabase: mockSupabase }, {}),
    /RETELL_API_KEY/,
  );
});

test("RetellHttpClient retries transient network failures, not HTTP errors", async () => {
  let networkAttempts = 0;
  const flaky = (async () => {
    networkAttempts += 1;
    if (networkAttempts < 3) {
      throw new TypeError("fetch failed");
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  const client = new RetellHttpClient({
    apiKey: "test-key",
    fetchImpl: flaky,
    retryDelayMs: 0,
  });
  const { status, json } = await client.request("GET", "/list-agents");
  assert.equal(networkAttempts, 3);
  assert.equal(status, 200);
  assert.deepEqual(json, { ok: true });

  // HTTP error responses are returned as-is, never retried.
  let httpAttempts = 0;
  const unauthorized = (async () => {
    httpAttempts += 1;
    return new Response(JSON.stringify({ message: "invalid key" }), {
      status: 401,
    });
  }) as typeof fetch;
  const client401 = new RetellHttpClient({
    apiKey: "bad-key",
    fetchImpl: unauthorized,
    retryDelayMs: 0,
  });
  const response = await client401.request("GET", "/list-agents");
  assert.equal(httpAttempts, 1);
  assert.equal(response.status, 401);

  // Persistent network failure eventually throws.
  const dead = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  const deadClient = new RetellHttpClient({
    apiKey: "test-key",
    fetchImpl: dead,
    retryDelayMs: 0,
    maxTries: 2,
  });
  await assert.rejects(
    deadClient.request("GET", "/list-agents"),
    /network failure after 2 tries/,
  );
});
