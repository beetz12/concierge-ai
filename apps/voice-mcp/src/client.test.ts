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
