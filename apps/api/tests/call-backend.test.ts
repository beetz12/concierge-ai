import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCallBackend,
  resolveCallBackendId,
} from "../src/services/call-backend/index.js";
import {
  LiveKitCallBackend,
  mapPlanToInput,
} from "../src/services/call-backend/livekit/livekit-call-backend.js";
import type { CallPlan } from "../src/services/call-backend/types.js";
import type { ContractorCallService } from "../src/services/voice/contractor-call.service.js";

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

test("resolveCallBackendId defaults to livekit when CALL_BACKEND is unset", () => {
  assert.equal(resolveCallBackendId({}), "livekit");
  assert.equal(resolveCallBackendId({ CALL_BACKEND: "" }), "livekit");
  assert.equal(resolveCallBackendId({ CALL_BACKEND: "  " }), "livekit");
});

test("resolveCallBackendId honors an explicit CALL_BACKEND value", () => {
  assert.equal(resolveCallBackendId({ CALL_BACKEND: "livekit" }), "livekit");
});

test("resolveCallBackendId throws on an unknown backend", () => {
  assert.throws(
    () => resolveCallBackendId({ CALL_BACKEND: "twilio" }),
    /Unsupported CALL_BACKEND: twilio/,
  );
});

test("getCallBackend builds a LiveKit backend by default", () => {
  const backend = getCallBackend({ supabase: mockSupabase }, {});
  assert.ok(backend instanceof LiveKitCallBackend);
  assert.equal(backend.id, "livekit");
});

test("LiveKitCallBackend advertises LiveKit capabilities", () => {
  const backend = new LiveKitCallBackend({} as ContractorCallService);
  assert.deepEqual(backend.capabilities, {
    supportsPause: true,
    supportsSupervision: true,
    supportsWarmTransfer: true,
    supportsDtmf: false,
  });
});

test("mapPlanToInput maps a CallPlan onto a qualification ContractorCallInput", () => {
  const input = mapPlanToInput(samplePlan);

  assert.equal(input.mode, "qualification");
  assert.equal(input.contractorName, "Acme Plumbing");
  assert.equal(input.contractorPhone, "+18035550123");
  assert.equal(input.serviceNeeded, "drain cleaning");
  assert.equal(input.clientName, "Dave");
  assert.equal(input.clientPhone, "+18035559999");
  assert.deepEqual(input.mustAskQuestions, [
    "Are you licensed?",
    "What is the hourly rate?",
  ]);
  assert.match(input.problemDescription || "", /Kitchen sink is backing up\./);
  assert.match(input.problemDescription || "", /share_address: 123 Main St/);
});

test("mapPlanToInput omits optional fields when absent", () => {
  const input = mapPlanToInput({
    businessName: "Solo Contractor",
    phoneNumber: "+18035550000",
    objective: "estimate",
    context: "",
    mustAsk: [],
    callerIdentity: "",
    voicemailPolicy: "hang_up",
    preAuthorizations: [],
  });

  assert.equal(input.mustAskQuestions, undefined);
  assert.equal(input.problemDescription, undefined);
  assert.equal(input.clientName, undefined);
  assert.equal(input.clientPhone, undefined);
});

test("LiveKitCallBackend.dispatchCall returns the session id as the call id", async () => {
  const stub = {
    async dispatchCall() {
      return { sessionId: "session_abc", dispatchId: "dispatch_1" };
    },
  } as unknown as ContractorCallService;

  const backend = new LiveKitCallBackend(stub);
  const result = await backend.dispatchCall(samplePlan);
  assert.deepEqual(result, { callId: "session_abc" });
});

test("LiveKitCallBackend.getStatus maps the service status onto CallStatus", async () => {
  const stub = {
    async getCallStatus(sessionId: string) {
      assert.equal(sessionId, "session_abc");
      return {
        session: { status: "completed" },
        provider: null,
        serviceRequest: null,
        events: [],
        completed: true,
        result: {
          disposition: "qualified",
          summary: "Available Tuesday at $120/hr",
          availability: "Tuesday",
          estimatedRate: "$120/hr",
          transcript: "Assistant: hi",
          recordingPath: "/rec/1.mp3",
          transcriptPath: "/tx/1.txt",
          sessionReportPath: "/report/1.json",
        },
      };
    },
  } as unknown as ContractorCallService;

  const backend = new LiveKitCallBackend(stub);
  const status = await backend.getStatus("session_abc");

  assert.deepEqual(status, {
    callId: "session_abc",
    state: "completed",
    completed: true,
    disposition: "qualified",
    summary: "Available Tuesday at $120/hr",
  });
});

test("LiveKitCallBackend.getStatus falls back to in_progress for unknown session states", async () => {
  const stub = {
    async getCallStatus() {
      return {
        session: { status: "ringing" },
        provider: null,
        serviceRequest: null,
        events: [],
        completed: false,
        result: {
          disposition: null,
          summary: null,
          availability: null,
          estimatedRate: null,
          transcript: null,
          recordingPath: null,
          transcriptPath: null,
          sessionReportPath: null,
        },
      };
    },
  } as unknown as ContractorCallService;

  const backend = new LiveKitCallBackend(stub);
  const status = await backend.getStatus("session_xyz");
  assert.equal(status.state, "in_progress");
  assert.equal(status.completed, false);
});

test("LiveKitCallBackend.getArtifacts maps recording, transcript, and structured outcome", async () => {
  const stub = {
    async getCallStatus() {
      return {
        session: { status: "completed" },
        provider: null,
        serviceRequest: null,
        events: [],
        completed: true,
        result: {
          disposition: "qualified",
          summary: "Great fit",
          availability: "Wednesday",
          estimatedRate: "$95/hr",
          transcript: "Assistant: hello\n\nProvider: hi",
          recordingPath: "/rec/2.mp3",
          transcriptPath: "/tx/2.txt",
          sessionReportPath: "/report/2.json",
        },
      };
    },
  } as unknown as ContractorCallService;

  const backend = new LiveKitCallBackend(stub);
  const artifacts = await backend.getArtifacts("session_abc");

  assert.equal(artifacts.callId, "session_abc");
  assert.equal(artifacts.recordingRef, "/rec/2.mp3");
  assert.equal(artifacts.transcript, "Assistant: hello\n\nProvider: hi");
  assert.deepEqual(artifacts.structuredOutcome, {
    disposition: "qualified",
    summary: "Great fit",
    availability: "Wednesday",
    estimatedRate: "$95/hr",
    transcriptPath: "/tx/2.txt",
    sessionReportPath: "/report/2.json",
  });
});

test("LiveKitCallBackend.cancelCall pauses the active session", async () => {
  const calls: Array<{ sessionId: string; action: string }> = [];
  const stub = {
    async controlActiveCall(input: { sessionId: string; action: string }) {
      calls.push(input);
      return {
        sessionId: input.sessionId,
        action: input.action,
        paused: true,
        roomName: "concierge-session_abc",
        participantIdentity: "provider-1",
      };
    },
  } as unknown as ContractorCallService;

  const backend = new LiveKitCallBackend(stub);
  await backend.cancelCall("session_abc");

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { sessionId: "session_abc", action: "pause" });
});
