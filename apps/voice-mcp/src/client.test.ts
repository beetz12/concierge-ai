import test from "node:test";
import assert from "node:assert/strict";
import { VoiceApiClient, summarizeStatus } from "./client.js";

test("VoiceApiClient.getCallArtifacts returns result subset", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        completed: true,
        session: { status: "completed" },
        events: [],
        result: {
          transcript: "Assistant: hi",
          recordingPath: "/tmp/audio.ogg",
          transcriptPath: "/tmp/transcript.txt",
          sessionReportPath: "/tmp/report.json",
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  const client = new VoiceApiClient({
    baseUrl: "http://127.0.0.1:8000/api/v1/voice",
    fetchImpl,
  });

  const result = await client.getCallArtifacts({ sessionId: "session_123" });
  assert.equal(result.sessionId, "session_123");
  assert.equal(result.completed, true);
  assert.equal(result.result.recordingPath, "/tmp/audio.ogg");
});

test("summarizeStatus includes disposition and last event", () => {
  const summary = summarizeStatus({
    completed: true,
    session: { status: "completed" },
    result: {
      disposition: "qualified",
      availability: "Tomorrow",
      estimatedRate: "$100",
    },
    events: [{ event_type: "session_completed" }],
  });

  assert.match(summary, /status=completed/);
  assert.match(summary, /disposition=qualified/);
  assert.match(summary, /last_event=session_completed/);
});

test("VoiceApiClient.sendSms posts to /sms/send and returns messageSid", async () => {
  let capturedUrl = "";
  let capturedBody = "";
  const fetchImpl: typeof fetch = async (input, init) => {
    capturedUrl = typeof input === "string" ? input : input.toString();
    capturedBody = typeof init?.body === "string" ? init.body : "";
    return new Response(
      JSON.stringify({
        success: true,
        messageSid: "SM1234567890abcdef1234567890abcdef",
        messageStatus: "queued",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const client = new VoiceApiClient({
    baseUrl: "http://127.0.0.1:8000/api/v1/voice",
    fetchImpl,
  });

  const result = await client.sendSms({ to: "+15558675309", body: "Hello from test" });
  assert.equal(result.success, true);
  assert.equal(result.messageSid, "SM1234567890abcdef1234567890abcdef");
  assert.equal(result.messageStatus, "queued");
  assert.match(capturedUrl, /\/sms\/send$/);
  assert.ok(capturedBody.includes("+15558675309"));
  assert.ok(capturedBody.includes("Hello from test"));
});

test("VoiceApiClient.checkSmsStatus fetches status by SID", async () => {
  let capturedUrl = "";
  const fetchImpl: typeof fetch = async (input) => {
    capturedUrl = typeof input === "string" ? input : input.toString();
    return new Response(
      JSON.stringify({
        success: true,
        messageSid: "SM1234567890abcdef1234567890abcdef",
        status: "delivered",
        to: "+15558675309",
        from: "+15551234567",
        dateSent: "2026-03-12T10:00:00.000Z",
        errorCode: null,
        errorMessage: null,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const client = new VoiceApiClient({
    baseUrl: "http://127.0.0.1:8000/api/v1/voice",
    fetchImpl,
  });

  const result = await client.checkSmsStatus({ messageSid: "SM1234567890abcdef1234567890abcdef" });
  assert.equal(result.success, true);
  assert.equal(result.status, "delivered");
  assert.equal(result.to, "+15558675309");
  assert.match(capturedUrl, /\/sms\/SM1234567890abcdef1234567890abcdef\/status$/);
});
