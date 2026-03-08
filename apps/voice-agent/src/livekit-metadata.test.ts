import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDispatchRoomName,
  parseDispatchMetadata,
  serializeDispatchMetadata,
} from "./livekit-metadata.js";

test("dispatch metadata round-trips and room names are sanitized", () => {
  const metadata = {
    kind: "qualification" as const,
    sessionId: "session_123",
    serviceRequestId: "request_123",
    providerId: "provider_123",
    providerName: "Acme Plumbing",
    providerPhone: "+15551234567",
    serviceNeeded: "water heater repair",
    location: "Greenville, SC",
    userCriteria: "licensed and insured",
  };

  const raw = serializeDispatchMetadata(metadata);
  assert.deepEqual(parseDispatchMetadata(raw), metadata);
  assert.equal(buildDispatchRoomName("session:123"), "concierge-session-123");
});

test("dispatch metadata parser accepts direct-task payloads with custom prompt context", () => {
  const metadata = {
    kind: "direct_task" as const,
    sessionId: "session_456",
    serviceRequestId: "request_456",
    providerId: "provider_456",
    providerName: "Acme Plumbing",
    providerPhone: "+15551234567",
    serviceNeeded: "billing inquiry",
    location: "Greenville, SC",
    taskDescription: "Request a refund for a mischarge.",
    directTaskType: "request_refund",
    mustAskQuestions: ["Can you confirm the refund amount?"],
    dealBreakers: ["No written confirmation"],
    customPrompt: {
      systemPrompt: "Ask for written confirmation before ending the call.",
      contextualQuestions: ["Can you email the confirmation today?"],
    },
  };

  assert.deepEqual(parseDispatchMetadata(serializeDispatchMetadata(metadata)), metadata);
});

test("dispatch metadata parser rejects incomplete payloads", () => {
  assert.throws(
    () => parseDispatchMetadata(JSON.stringify({ kind: "qualification" })),
    /missing sessionId/i,
  );
});
