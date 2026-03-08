import test from "node:test";
import assert from "node:assert/strict";
import { VoiceSessionManager } from "./session-manager.js";

test("createSession initializes a qualification session", () => {
  const manager = new VoiceSessionManager();
  const session = manager.createSession({
    id: "session_1",
    serviceRequestId: "request_1",
    providerId: "provider_1",
  });

  assert.equal(session.id, "session_1");
  assert.equal(session.activeAgent, "qualification");
  assert.equal(session.status, "active");
  assert.equal(session.agentHistory.length, 1);
});

test("recordTurn and updateMetadata persist conversational state", () => {
  const manager = new VoiceSessionManager();
  const session = manager.createSession({
    id: "session_2",
    serviceRequestId: "request_2",
    providerId: "provider_2",
  });

  manager.recordTurn(session.id, {
    speaker: "assistant",
    text: "Hi, I am calling to confirm availability.",
  });

  const updated = manager.updateMetadata(session.id, {
    requestedService: "landscaping",
  });

  assert.equal(updated.turns.length, 1);
  assert.equal(updated.metadata.requestedService, "landscaping");
});

test("handoffSession transfers ownership without losing history", () => {
  const manager = new VoiceSessionManager();
  const session = manager.createSession({
    id: "session_3",
    serviceRequestId: "request_3",
    providerId: "provider_3",
  });

  const handedOff = manager.handoffSession(session.id, {
    to: "booking",
    reason: "provider_qualified",
  });

  assert.equal(handedOff.activeAgent, "booking");
  assert.equal(handedOff.agentHistory.length, 2);
  assert.equal(handedOff.agentHistory.at(-1)?.reason, "provider_qualified");
});

test("tool executions can complete or fail independently", () => {
  const manager = new VoiceSessionManager();
  const session = manager.createSession({
    id: "session_4",
    serviceRequestId: "request_4",
    providerId: "provider_4",
  });

  const successfulTool = manager.startToolExecution(session.id, {
    name: "get_provider_context",
  });
  manager.completeToolExecution(session.id, successfulTool.id, {
    providerName: "Green Yard Co.",
  });

  const failedTool = manager.startToolExecution(session.id, {
    name: "save_quote",
  });
  const updated = manager.failToolExecution(session.id, failedTool.id, "timeout");

  assert.equal(updated.toolExecutions[0]?.status, "completed");
  assert.equal(updated.toolExecutions[1]?.status, "failed");
  assert.equal(updated.toolExecutions[1]?.error, "timeout");
});

test("closeSession records the final outcome and prevents further mutation", () => {
  const manager = new VoiceSessionManager();
  const session = manager.createSession({
    id: "session_5",
    serviceRequestId: "request_5",
    providerId: "provider_5",
  });

  const closed = manager.closeSession(session.id, {
    outcome: {
      disposition: "qualified",
      summary: "Provider can arrive tomorrow morning for $120.",
      availability: "Tomorrow at 9am",
      estimatedRate: "$120",
      nextStep: "handoff_to_booking",
    },
  });

  assert.equal(closed.status, "completed");
  assert.equal(closed.outcome?.disposition, "qualified");
  assert.throws(
    () =>
      manager.recordTurn(session.id, {
        speaker: "assistant",
        text: "This should fail after closure.",
      }),
    /already closed/,
  );
});
