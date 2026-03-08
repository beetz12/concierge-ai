import assert from "node:assert/strict";
import test from "node:test";
import { DisconnectReason } from "@livekit/rtc-node";
import {
  buildFallbackCallOutcome,
  resolveSessionStatus,
} from "./session-finalization.js";

test("buildFallbackCallOutcome treats client disconnects as user-ended failures", () => {
  const outcome = buildFallbackCallOutcome({
    disconnectReason: DisconnectReason.CLIENT_INITIATED,
  });

  assert.deepEqual(outcome, {
    reason: "user-ended-call",
    disposition: "failed",
    summary: "The provider disconnected before a live conversation could happen.",
    servicesOffered: [],
  });
});

test("buildFallbackCallOutcome notes partial conversations", () => {
  const outcome = buildFallbackCallOutcome({
    transcript: "Assistant: Hello\n\nProvider: Hi",
    disconnectReason: "CLIENT_INITIATED",
  });

  assert.equal(
    outcome.summary,
    "The provider disconnected before the call could be completed.",
  );
});

test("resolveSessionStatus marks only failed outcomes as failed", () => {
  assert.equal(
    resolveSessionStatus({
      reason: "failed",
      disposition: "failed",
      summary: "Call failed",
      servicesOffered: [],
    }),
    "failed",
  );

  assert.equal(
    resolveSessionStatus({
      reason: "assistant-ended-call",
      disposition: "qualified",
      summary: "Qualified",
      servicesOffered: ["drainage"],
    }),
    "completed",
  );
});
