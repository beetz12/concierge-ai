import assert from "node:assert/strict";
import test from "node:test";
import { ActiveSessionRegistry } from "./session-control.js";

test("ActiveSessionRegistry pauses and resumes registered sessions", async () => {
  let paused = false;
  const registry = new ActiveSessionRegistry();
  registry.register({
    sessionId: "session_123",
    roomName: "concierge-session_123",
    participantIdentity: "provider-123",
    pause: async () => {
      paused = true;
    },
    resume: async () => {
      paused = false;
    },
    getStatus: () => ({
      paused,
      roomName: "concierge-session_123",
      participantIdentity: "provider-123",
    }),
  });

  const pausedStatus = await registry.pause("session_123");
  assert.equal(pausedStatus.paused, true);

  const resumedStatus = await registry.resume("session_123");
  assert.equal(resumedStatus.paused, false);
});

test("ActiveSessionRegistry throws on unknown sessions", async () => {
  const registry = new ActiveSessionRegistry();

  await assert.rejects(() => registry.pause("missing-session"), /not found/i);
  await assert.rejects(() => registry.resume("missing-session"), /not found/i);
});
