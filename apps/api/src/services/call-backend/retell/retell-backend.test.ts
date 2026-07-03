import assert from "node:assert/strict";
import test from "node:test";
import { ZodError } from "zod";
import type { CallStatusState } from "../types.js";
import type { ArtifactFile, RetellArtifactStore } from "./artifacts.js";
import { CallGuardError } from "./guards.js";
import { createMockFetch, makePlan, type MockRoute } from "./mock-retell-api.js";
import {
  buildDispatchPayload,
  mapRetellCallStatus,
  RetellCallBackend,
} from "./retell-backend.js";
import { RetellHttpClient, RetellHttpError } from "./retell-http.js";

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0); // 2026-06-15

const NO_RECENT_CALLS: MockRoute = {
  method: "POST",
  path: "/v2/list-calls",
  json: [],
};

interface SavedArtifacts {
  callId: string;
  files: ArtifactFile[];
}

function makeBackend(routes: MockRoute[]) {
  const { fetchImpl, requests } = createMockFetch(routes);
  const client = new RetellHttpClient({
    apiKey: "test-key",
    fetchImpl,
    retryDelayMs: 0,
  });
  const saved: SavedArtifacts[] = [];
  const artifactStore: RetellArtifactStore = {
    async save(callId, files) {
      saved.push({ callId, files });
      return Object.fromEntries(
        files.map((file) => [file.name, `mem://${callId}/${file.name}`]),
      );
    },
  };
  const backend = new RetellCallBackend({
    client,
    artifactStore,
    fromNumber: "+18645550100",
    agentId: "agent_123",
    now: () => NOW,
    warn: () => {},
  });
  return { backend, requests, saved };
}

test("dispatchCall refuses an unapproved plan without touching the network", async () => {
  const { backend, requests } = makeBackend([]);
  await assert.rejects(
    backend.dispatchCall(makePlan({ userApproved: false })),
    (error: unknown) =>
      error instanceof CallGuardError &&
      error.code === "user_approval_required",
  );
  assert.equal(requests.length, 0);
});

test("dispatchCall refuses a non-US number without touching the network", async () => {
  const { backend, requests } = makeBackend([]);
  await assert.rejects(
    backend.dispatchCall(makePlan({ phoneNumber: "+448645550123" })),
    (error: unknown) =>
      error instanceof CallGuardError && error.code === "invalid_phone_number",
  );
  assert.equal(requests.length, 0);
});

test("dispatchCall sends the call-biz dispatch payload shape", async () => {
  const { backend, requests } = makeBackend([
    NO_RECENT_CALLS,
    {
      method: "POST",
      path: "/v2/create-phone-call",
      json: { call_id: "call_1", call_status: "registered" },
    },
  ]);

  const result = await backend.dispatchCall(makePlan({ tenantId: "tenant-a" }));
  assert.deepEqual(result, { callId: "call_1" });

  const dispatch = requests.find((request) =>
    request.url.includes("/v2/create-phone-call"),
  );
  assert.ok(dispatch);
  const body = dispatch.body as Record<string, any>;
  assert.equal(body.from_number, "+18645550100");
  assert.equal(body.to_number, "+18645550123");
  assert.equal(body.override_agent_id, "agent_123");
  assert.deepEqual(body.retell_llm_dynamic_variables, {
    business_name: "Acme Plumbing",
    objective: "Ask about drain cleaning availability and rates",
    context: "Kitchen sink is backing up.\nshare_address: 123 Main St",
    must_ask: "Are you licensed?; What is the hourly rate?",
    caller_identity:
      "Brian, an assistant calling on behalf of a local customer",
    callback_number: "+18645559999",
  });
  assert.deepEqual(body.metadata, {
    source: "concierge-api",
    business: "Acme Plumbing",
    date: "2026-06-15",
    tenant_id: "tenant-a",
  });
  // voicemailPolicy hang_up => machine-level guaranteed hangup override.
  assert.deepEqual(body.agent_override, {
    agent: { voicemail_option: { action: { type: "hangup" } } },
  });
});

test("buildDispatchPayload defers to the agent prompt for leave_message voicemail", () => {
  const payload = buildDispatchPayload(
    makePlan({ voicemailPolicy: "leave_message" }),
    { fromNumber: "+18645550100", agentId: "agent_123", now: () => NOW },
  );
  assert.equal(payload["agent_override"], undefined);

  const withDefaults = buildDispatchPayload(
    makePlan({
      context: "",
      preAuthorizations: [],
      mustAsk: [],
      callbackNumber: undefined,
    }),
    { fromNumber: "+18645550100", agentId: "agent_123", now: () => NOW },
  );
  const variables = withDefaults["retell_llm_dynamic_variables"] as Record<
    string,
    string
  >;
  assert.equal(variables["context"], "No additional context provided.");
  assert.equal(
    variables["must_ask"],
    "Ask about drain cleaning availability and rates",
  );
  assert.equal(variables["callback_number"], "");
});

test("dispatchCall surfaces Retell HTTP errors", async () => {
  const { backend } = makeBackend([
    NO_RECENT_CALLS,
    {
      method: "POST",
      path: "/v2/create-phone-call",
      status: 402,
      json: { message: "insufficient balance" },
    },
  ]);
  await assert.rejects(
    backend.dispatchCall(makePlan()),
    (error: unknown) =>
      error instanceof RetellHttpError &&
      error.status === 402 &&
      /insufficient balance/.test(error.message),
  );
});

test("dispatchCall rejects a malformed dispatch response at the boundary", async () => {
  const { backend } = makeBackend([
    NO_RECENT_CALLS,
    {
      method: "POST",
      path: "/v2/create-phone-call",
      json: { status: "ok" }, // missing call_id
    },
  ]);
  await assert.rejects(backend.dispatchCall(makePlan()), ZodError);
});

test("dispatchCall is blocked by a recent redial and allowed with allowRedial", async () => {
  const recent = [
    {
      call_id: "call_prev",
      call_status: "ended",
      start_timestamp: NOW - 3_600_000,
    },
  ];
  const routes: MockRoute[] = [
    { method: "POST", path: "/v2/list-calls", json: recent },
    {
      method: "POST",
      path: "/v2/create-phone-call",
      json: { call_id: "call_2", call_status: "registered" },
    },
  ];

  const blocked = makeBackend(routes);
  await assert.rejects(
    blocked.backend.dispatchCall(makePlan()),
    (error: unknown) =>
      error instanceof CallGuardError && error.code === "redial_blocked",
  );

  const allowed = makeBackend(routes);
  const result = await allowed.backend.dispatchCall(
    makePlan({ allowRedial: true }),
  );
  assert.deepEqual(result, { callId: "call_2" });
});

test("getStatus maps Retell call statuses onto CallStatusState", async () => {
  const cases: Array<[string, CallStatusState, boolean]> = [
    ["registered", "queued", false],
    ["ongoing", "in_progress", false],
    ["ended", "completed", true],
    ["error", "failed", true],
    ["not_connected", "failed", true],
    ["something_new", "in_progress", false],
  ];
  for (const [retellStatus, expectedState, expectedCompleted] of cases) {
    const { backend } = makeBackend([
      {
        method: "GET",
        path: "/v2/get-call/call_1",
        json: { call_id: "call_1", call_status: retellStatus },
      },
    ]);
    const status = await backend.getStatus("call_1");
    assert.equal(status.state, expectedState, `state for ${retellStatus}`);
    assert.equal(
      status.completed,
      expectedCompleted,
      `completed for ${retellStatus}`,
    );
  }
  assert.equal(mapRetellCallStatus("ended"), "completed");
});

test("getStatus surfaces disposition and post-call summary", async () => {
  const { backend } = makeBackend([
    {
      method: "GET",
      path: "/v2/get-call/call_1",
      json: {
        call_id: "call_1",
        call_status: "ended",
        disconnection_reason: "agent_hangup",
        call_analysis: {
          call_summary: "Licensed; $120/hr; available Tuesday.",
          call_successful: true,
          user_sentiment: "Positive",
        },
      },
    },
  ]);
  const status = await backend.getStatus("call_1");
  assert.deepEqual(status, {
    callId: "call_1",
    state: "completed",
    completed: true,
    disposition: "agent_hangup",
    summary: "Licensed; $120/hr; available Tuesday.",
  });
});

test("getArtifacts refuses while the call is still in progress", async () => {
  const { backend, saved } = makeBackend([
    {
      method: "GET",
      path: "/v2/get-call/call_1",
      json: { call_id: "call_1", call_status: "ongoing" },
    },
  ]);
  await assert.rejects(backend.getArtifacts("call_1"), /'ongoing'/);
  assert.equal(saved.length, 0);
});

test("getArtifacts persists transcript, slim call.json, and recording", async () => {
  const { backend, saved } = makeBackend([
    {
      method: "GET",
      path: "/v2/get-call/call_1",
      json: {
        call_id: "call_1",
        call_status: "ended",
        disconnection_reason: "agent_hangup",
        duration_ms: 95_000,
        start_timestamp: NOW - 100_000,
        end_timestamp: NOW - 5_000,
        from_number: "+18645550100",
        to_number: "+18645550123",
        transcript: "Agent: Hello\nUser: Hi",
        transcript_object: [{ role: "agent", content: "Hello" }],
        transcript_with_tool_calls: [{ role: "agent", content: "Hello" }],
        recording_url: "https://retell.example/recordings/call_1.wav",
        call_analysis: {
          call_summary: "Great fit",
          call_successful: true,
          user_sentiment: "Positive",
          custom_analysis_data: { rate: "$120/hr" },
        },
        metadata: { business: "Acme Plumbing" },
      },
    },
    {
      method: "GET",
      path: "recordings/call_1.wav",
      raw: Buffer.from("RIFFfake-audio"),
    },
  ]);

  const artifacts = await backend.getArtifacts("call_1");

  assert.equal(artifacts.callId, "call_1");
  assert.equal(artifacts.recordingRef, "mem://call_1/recording.wav");
  assert.equal(artifacts.transcript, "Agent: Hello\nUser: Hi");

  const outcome = artifacts.structuredOutcome as Record<string, unknown>;
  assert.equal(outcome["callStatus"], "ended");
  assert.equal(outcome["disconnectionReason"], "agent_hangup");
  assert.equal(outcome["durationMs"], 95_000);
  assert.equal(outcome["callSuccessful"], true);
  assert.equal(outcome["callSummary"], "Great fit");
  assert.equal(outcome["userSentiment"], "Positive");
  assert.deepEqual(outcome["customAnalysisData"], { rate: "$120/hr" });
  assert.deepEqual(outcome["artifacts"], {
    "transcript.txt": "mem://call_1/transcript.txt",
    "call.json": "mem://call_1/call.json",
    "recording.wav": "mem://call_1/recording.wav",
  });
  assert.equal(outcome["recordingError"], undefined);

  assert.equal(saved.length, 1);
  const files = saved[0]!.files;
  assert.deepEqual(
    files.map((file) => file.name),
    ["transcript.txt", "call.json", "recording.wav"],
  );
  const callJson = JSON.parse(
    files.find((file) => file.name === "call.json")!.data as string,
  ) as Record<string, unknown>;
  // Bulky transcript variants are stripped before persistence (call-biz slim).
  assert.equal(callJson["transcript_object"], undefined);
  assert.equal(callJson["transcript_with_tool_calls"], undefined);
  assert.equal(callJson["call_id"], "call_1");
  const recording = files.find((file) => file.name === "recording.wav")!;
  assert.equal(Buffer.from(recording.data as Uint8Array).toString(), "RIFFfake-audio");
});

test("getArtifacts tolerates an expired recording URL", async () => {
  const { backend } = makeBackend([
    {
      method: "GET",
      path: "/v2/get-call/call_1",
      json: {
        call_id: "call_1",
        call_status: "ended",
        transcript: "Agent: Hello",
        recording_url: "https://retell.example/recordings/expired.wav",
      },
    },
    {
      method: "GET",
      path: "recordings/expired.wav",
      status: 403,
      json: { message: "expired" },
    },
  ]);

  const artifacts = await backend.getArtifacts("call_1");
  assert.equal(artifacts.recordingRef, null);
  assert.equal(artifacts.transcript, "Agent: Hello");
  const outcome = artifacts.structuredOutcome as Record<string, unknown>;
  assert.match(String(outcome["recordingError"]), /recording URLs expire/);
});

test("cancelCall stops the ongoing call via /v2/stop-call", async () => {
  const { backend, requests } = makeBackend([
    { method: "POST", path: "/v2/stop-call/call_1", json: null },
  ]);
  await backend.cancelCall("call_1");
  assert.equal(requests.length, 1);
  assert.match(requests[0]!.url, /\/v2\/stop-call\/call_1$/);
});

test("RetellCallBackend advertises agent-tool-level warm transfer and DTMF", () => {
  const { backend } = makeBackend([]);
  assert.equal(backend.id, "retell");
  // No mid-call pause/supervision API; warm transfer and DTMF are backed by
  // the provisioned transfer_call (warm_transfer) and press_digit tools.
  assert.deepEqual(backend.capabilities, {
    supportsPause: false,
    supportsSupervision: false,
    supportsWarmTransfer: true,
    supportsDtmf: true,
  });
});
