import assert from "node:assert/strict";
import test from "node:test";
import { resetCallRuntimeConfigForTests } from "../src/config/call-runtime.js";
import { RuntimeRouterService } from "../src/services/calls/runtime-router.service.js";

const logger = {
  info() {},
  debug() {},
  error() {},
  warn() {},
};

const baseEnv = {
  LIVEKIT_URL: "wss://example.livekit.invalid",
  LIVEKIT_API_KEY: "livekit-key",
  LIVEKIT_API_SECRET: "livekit-secret",
  VOICE_AGENT_SHARED_SECRET: "voice-secret",
  VAPI_API_KEY: "vapi-key",
  VAPI_PHONE_NUMBER_ID: "phone-number-id",
  VOICE_AGENT_SERVICE_URL: "http://voice-agent.test",
};

test("RuntimeRouterService dispatches to the voice-agent when LiveKit is selected", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  process.env = {
    ...process.env,
    ...baseEnv,
    CALL_RUNTIME_PROVIDER: "livekit",
    VAPI_ENABLED: "false",
  };
  resetCallRuntimeConfigForTests();

  const providerCallingService = {
    async callProvider() {
      throw new Error("VAPI path should not be used");
    },
    async callProvidersBatch() {
      throw new Error("VAPI path should not be used");
    },
    async getSystemStatus() {
      return { ok: true };
    },
  };

  const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(
      JSON.stringify({
        success: true,
        runtimeProvider: "livekit",
        accepted: true,
        sessionId: "session_livekit_1",
        dispatchId: "dispatch_livekit_1",
        providerId: "provider_1",
        serviceRequestId: "request_1",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const router = new RuntimeRouterService(
      logger,
      providerCallingService as never,
    );

    const result = await router.callProvider({
      providerId: "provider_1",
      providerName: "Acme Plumbing",
      phoneNumber: "+18035550123",
      serviceNeeded: "plumbing",
      location: "Greenville, SC",
      serviceRequestId: "request_1",
    });

    assert.equal(result.runtimeProvider, "livekit");
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.url, "http://voice-agent.test/dispatch/provider-call");
    assert.equal(
      (requests[0]?.init?.headers as Record<string, string>)["x-voice-agent-key"],
      "voice-secret",
    );
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetCallRuntimeConfigForTests();
  }
});

test("RuntimeRouterService falls back to the VAPI provider service when VAPI is selected", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  process.env = {
    ...process.env,
    ...baseEnv,
    CALL_RUNTIME_PROVIDER: "vapi",
    VAPI_ENABLED: "true",
  };
  resetCallRuntimeConfigForTests();

  const called: string[] = [];
  const providerCallingService = {
    async callProvider(request: unknown) {
      called.push("callProvider");
      return {
        success: true,
        providerName: "Acme Plumbing",
        callId: "call_vapi_1",
        ...request,
      };
    },
    async callProvidersBatch() {
      called.push("callProvidersBatch");
      return { success: true, results: [], stats: {}, errors: [] };
    },
    async getSystemStatus() {
      return { ok: true };
    },
  };

  globalThis.fetch = (async () => {
    throw new Error("Voice-agent fetch should not be called when VAPI is selected");
  }) as typeof fetch;

  try {
    const router = new RuntimeRouterService(
      logger,
      providerCallingService as never,
    );

    const result = await router.callProvider({
      providerId: "provider_2",
      providerName: "Fallback Electric",
      phoneNumber: "+18035550124",
      serviceNeeded: "electrical",
      location: "Greenville, SC",
      serviceRequestId: "request_2",
    });

    assert.equal(called[0], "callProvider");
    assert.equal((result as { callId: string }).callId, "call_vapi_1");
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
    resetCallRuntimeConfigForTests();
  }
});
