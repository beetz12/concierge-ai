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

test("dispatch metadata parser rejects incomplete payloads", () => {
  assert.throws(
    () => parseDispatchMetadata(JSON.stringify({ kind: "qualification" })),
    /missing sessionId/i,
  );
});
