import assert from "node:assert/strict";
import test from "node:test";
import { finishCallCleanup } from "./call-cleanup.js";

test("finishCallCleanup shuts down immediately and removes the SIP participant", async () => {
  const calls: Array<Record<string, unknown>> = [];

  const result = await finishCallCleanup({
    session: {
      shutdown(options) {
        calls.push({ type: "shutdown", options });
      },
    },
    roomServiceClient: {
      async removeParticipant(room, identity) {
        calls.push({ type: "removeParticipant", room, identity });
      },
    },
    roomName: "concierge-session_123",
    participantIdentity: "provider-provider_123",
    reason: "assistant-ended-call",
  });

  assert.equal(result, undefined);
  assert.deepEqual(calls, [
    {
      type: "shutdown",
      options: { reason: "assistant-ended-call", drain: false },
    },
    {
      type: "removeParticipant",
      room: "concierge-session_123",
      identity: "provider-provider_123",
    },
  ]);
});

test("finishCallCleanup still shuts down when participant removal fails", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const errors: Array<{ message: string; error: unknown }> = [];

  await finishCallCleanup({
    session: {
      shutdown(options) {
        calls.push({ type: "shutdown", options });
      },
    },
    roomServiceClient: {
      async removeParticipant() {
        throw new Error("participant already disconnected");
      },
    },
    roomName: "concierge-session_456",
    participantIdentity: "provider-provider_456",
    reason: "assistant-ended-call",
    logger: {
      error(message, error) {
        errors.push({ message, error });
      },
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    type: "shutdown",
    options: { reason: "assistant-ended-call", drain: false },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0]?.message || "", /remove SIP participant/i);
});
