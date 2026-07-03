import assert from "node:assert/strict";
import test from "node:test";
import {
  getCallBackend,
  resolveCallBackendId,
} from "../index.js";
import { VapiCallBackend } from "./vapi-call-backend.js";
import type { CallPlan } from "../types.js";
import type { SupabaseClient } from "@supabase/supabase-js";

const mockSupabase = {} as SupabaseClient;

const samplePlan: CallPlan = {
  businessName: "Acme Plumbing",
  phoneNumber: "+18035550123",
  objective: "drain cleaning",
  context: "Kitchen sink is backing up.",
  mustAsk: ["Are you licensed?", "What is the hourly rate?"],
  callerIdentity: "Dave",
  callbackNumber: "+18035559999",
  voicemailPolicy: "hang_up",
  preAuthorizations: [{ key: "share_address", value: "123 Main St" }],
};

/** Build a fetch stub that records calls and returns canned JSON responses. */
function makeFetchStub(
  responder: (
    url: string,
    init: RequestInit | undefined,
  ) => { status: number; body: unknown },
) {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const stub = (async (url: string | URL, init?: RequestInit) => {
    const urlStr = url.toString();
    calls.push({ url: urlStr, init });
    const { status, body } = responder(urlStr, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }) as typeof fetch;
  return { stub, calls };
}

test("dispatchCall maps CallPlan fields into the VAPI create-call payload", async () => {
  const { stub, calls } = makeFetchStub(() => ({
    status: 201,
    body: { id: "call_123", status: "queued" },
  }));

  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  await backend.dispatchCall(samplePlan);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.vapi.ai/call");
  assert.equal(calls[0]!.init?.method, "POST");

  const payload = JSON.parse(calls[0]!.init!.body as string);
  assert.equal(payload.phoneNumberId, "phone_abc");
  assert.equal(payload.customer.number, "+18035550123");
  assert.equal(payload.customer.name, "Acme Plumbing");
  assert.match(payload.assistant.model.messages[0].content, /drain cleaning/);
  assert.match(payload.assistant.model.messages[0].content, /Kitchen sink is backing up\./);
  assert.match(payload.assistant.model.messages[0].content, /Are you licensed\?/);
  assert.match(payload.assistant.model.messages[0].content, /share_address: 123 Main St/);
  assert.match(payload.assistant.model.messages[0].content, /\+18035559999/);
});

test("dispatchCall returns the VAPI call id immediately without polling", async () => {
  const { stub } = makeFetchStub(() => ({
    status: 201,
    body: { id: "call_456", status: "queued" },
  }));

  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  const result = await backend.dispatchCall(samplePlan);
  assert.deepEqual(result, { callId: "call_456" });
});

test("createVapiCallBackendFromEnv throws when VAPI_API_KEY is missing", async () => {
  const { createVapiCallBackendFromEnv } = await import("./vapi-call-backend.js");
  assert.throws(
    () =>
      createVapiCallBackendFromEnv({
        VAPI_PHONE_NUMBER_ID: "phone_abc",
      } as NodeJS.ProcessEnv),
    /VAPI_API_KEY and VAPI_PHONE_NUMBER_ID/,
  );
});

test("createVapiCallBackendFromEnv throws when VAPI_PHONE_NUMBER_ID is missing", async () => {
  const { createVapiCallBackendFromEnv } = await import("./vapi-call-backend.js");
  assert.throws(
    () =>
      createVapiCallBackendFromEnv({
        VAPI_API_KEY: "test-key",
      } as NodeJS.ProcessEnv),
    /VAPI_API_KEY and VAPI_PHONE_NUMBER_ID/,
  );
});

test("dispatchCall refuses a non-US-E.164 destination number", async () => {
  const { stub, calls } = makeFetchStub(() => ({
    status: 201,
    body: { id: "call_999", status: "queued" },
  }));

  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  await assert.rejects(
    backend.dispatchCall({ ...samplePlan, phoneNumber: "555-0123" }),
    /US E\.164/,
  );
  await assert.rejects(
    backend.dispatchCall({ ...samplePlan, phoneNumber: "+442071234567" }),
    /US E\.164/,
  );
  assert.equal(calls.length, 0);
});

test("getStatus maps queued/ringing to queued", async () => {
  const { stub } = makeFetchStub(() => ({
    status: 200,
    body: { id: "call_1", status: "ringing" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  const status = await backend.getStatus("call_1");
  assert.equal(status.state, "queued");
  assert.equal(status.completed, false);
});

test("getStatus maps in-progress/forwarding to in_progress", async () => {
  const { stub } = makeFetchStub(() => ({
    status: 200,
    body: { id: "call_2", status: "forwarding" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  const status = await backend.getStatus("call_2");
  assert.equal(status.state, "in_progress");
  assert.equal(status.completed, false);
});

test("getStatus maps ended (normal) to completed", async () => {
  const { stub } = makeFetchStub(() => ({
    status: 200,
    body: {
      id: "call_3",
      status: "ended",
      endedReason: "customer-ended-call",
      analysis: { summary: "Available Tuesday at $120/hr" },
    },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  const status = await backend.getStatus("call_3");
  assert.equal(status.state, "completed");
  assert.equal(status.completed, true);
  assert.equal(status.summary, "Available Tuesday at $120/hr");
});

test("getStatus maps ended with a failure endedReason to failed", async () => {
  const { stub } = makeFetchStub(() => ({
    status: 200,
    body: { id: "call_4", status: "ended", endedReason: "assistant-error" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  const status = await backend.getStatus("call_4");
  assert.equal(status.state, "failed");
  assert.equal(status.completed, true);
});

test("getStatus maps ended with no-answer endedReason to failed", async () => {
  const { stub } = makeFetchStub(() => ({
    status: 200,
    body: { id: "call_5", status: "ended", endedReason: "customer-did-not-answer" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  const status = await backend.getStatus("call_5");
  assert.equal(status.state, "failed");
  assert.equal(status.completed, true);
});

test("getArtifacts extracts recording, transcript, and structured outcome", async () => {
  const { stub } = makeFetchStub(() => ({
    status: 200,
    body: {
      id: "call_6",
      status: "ended",
      endedReason: "customer-ended-call",
      recordingUrl: "https://vapi.example/rec.mp3",
      transcript: "Assistant: hi\nProvider: hello",
      analysis: {
        summary: "Great fit",
        structuredData: { availability: "available", estimated_rate: "$95/hr" },
      },
    },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  const artifacts = await backend.getArtifacts("call_6");
  assert.equal(artifacts.callId, "call_6");
  assert.equal(artifacts.recordingRef, "https://vapi.example/rec.mp3");
  assert.equal(artifacts.transcript, "Assistant: hi\nProvider: hello");
  assert.deepEqual(artifacts.structuredOutcome, {
    availability: "available",
    estimated_rate: "$95/hr",
  });
});

test("getArtifacts returns nulls when recording/transcript/analysis are absent", async () => {
  const { stub } = makeFetchStub(() => ({
    status: 200,
    body: { id: "call_7", status: "queued" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  const artifacts = await backend.getArtifacts("call_7");
  assert.deepEqual(artifacts, {
    callId: "call_7",
    recordingRef: null,
    transcript: null,
    structuredOutcome: null,
  });
});

test("cancelCall issues a PATCH to end the VAPI call", async () => {
  const { stub, calls } = makeFetchStub(() => ({
    status: 200,
    body: { id: "call_8", status: "ended" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  await backend.cancelCall("call_8");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://api.vapi.ai/call/call_8");
  assert.equal(calls[0]!.init?.method, "PATCH");
  const body = JSON.parse(calls[0]!.init!.body as string);
  assert.equal(body.status, "ended");
});

test("cancelCall throws on a non-ok response", async () => {
  const { stub } = makeFetchStub(() => ({
    status: 404,
    body: { message: "call not found" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  await assert.rejects(backend.cancelCall("missing_call"), /VAPI cancel-call failed \(404\)/);
});

test("voicemail policy hang_up instructs the assistant not to leave a message", async () => {
  const { stub, calls } = makeFetchStub(() => ({
    status: 201,
    body: { id: "call_9", status: "queued" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  await backend.dispatchCall({ ...samplePlan, voicemailPolicy: "hang_up" });
  const payload = JSON.parse(calls[0]!.init!.body as string);
  assert.match(
    payload.assistant.model.messages[0].content,
    /immediately end the call\. Do not leave a message\./,
  );
  assert.equal(payload.assistant.voicemailDetection.enabled, true);
});

test("voicemail policy leave_message instructs the assistant to leave a callback message", async () => {
  const { stub, calls } = makeFetchStub(() => ({
    status: 201,
    body: { id: "call_10", status: "queued" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  await backend.dispatchCall({ ...samplePlan, voicemailPolicy: "leave_message" });
  const payload = JSON.parse(calls[0]!.init!.body as string);
  assert.match(payload.assistant.model.messages[0].content, /leave a brief, clear message/);
});

test("voicemail policy retry_later instructs the assistant to end without a message", async () => {
  const { stub, calls } = makeFetchStub(() => ({
    status: 201,
    body: { id: "call_11", status: "queued" },
  }));
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
    fetchImpl: stub,
  });

  await backend.dispatchCall({ ...samplePlan, voicemailPolicy: "retry_later" });
  const payload = JSON.parse(calls[0]!.init!.body as string);
  assert.match(payload.assistant.model.messages[0].content, /will be retried later/);
});

test("VapiCallBackend advertises no wired-up optional capabilities", () => {
  const backend = new VapiCallBackend({
    apiKey: "test-key",
    phoneNumberId: "phone_abc",
  });
  assert.deepEqual(backend.capabilities, {
    supportsPause: false,
    supportsSupervision: false,
    supportsWarmTransfer: false,
    supportsDtmf: false,
  });
  assert.equal(backend.id, "vapi");
});

test("resolveCallBackendId resolves an explicit CALL_BACKEND=vapi", () => {
  assert.equal(resolveCallBackendId({ CALL_BACKEND: "vapi" }), "vapi");
});

test("getCallBackend builds a VapiCallBackend for CALL_BACKEND=vapi", () => {
  const backend = getCallBackend(
    { supabase: mockSupabase },
    {
      CALL_BACKEND: "vapi",
      VAPI_API_KEY: "test-key",
      VAPI_PHONE_NUMBER_ID: "phone_abc",
    } as NodeJS.ProcessEnv,
  );
  assert.ok(backend instanceof VapiCallBackend);
  assert.equal(backend.id, "vapi");
});

test("getCallBackend surfaces the missing-env error for CALL_BACKEND=vapi without VAPI env vars", () => {
  assert.throws(
    () =>
      getCallBackend(
        { supabase: mockSupabase },
        { CALL_BACKEND: "vapi" } as NodeJS.ProcessEnv,
      ),
    /VAPI_API_KEY and VAPI_PHONE_NUMBER_ID/,
  );
});
