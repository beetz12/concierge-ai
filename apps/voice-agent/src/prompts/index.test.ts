import assert from "node:assert/strict";
import test from "node:test";
import { buildVoicePromptTemplate } from "./index.js";

const qualificationContext = {
  kind: "qualification" as const,
  providerName: "Acme Landscaping",
  serviceNeeded: "landscaping",
  location: "Los Angeles, CA",
};

test("qualification template uses an outbound business-identity opener", () => {
  const template = buildVoicePromptTemplate(qualificationContext);

  assert.equal(template.variant, "outbound_qualification");
  assert.match(template.openingPrompt, /calling on behalf of a client/i);
  assert.match(template.openingPrompt, /Is this Acme Landscaping\?/i);
  assert.doesNotMatch(template.openingPrompt, /thanks for calling/i);
});

test("qualification template uses the client name in the opener when available", () => {
  const template = buildVoicePromptTemplate({
    ...qualificationContext,
    clientName: "David",
  });

  assert.match(template.openingPrompt, /David's AI assistant calling on behalf of David/i);
  assert.match(template.openingPrompt, /Is this Acme Landscaping\?/i);
});

test("qualification template enforces sequential fact collection and edge-case handling", () => {
  const template = buildVoicePromptTemplate(qualificationContext);

  assert.match(template.systemInstructions, /First confirm that you reached the correct company/i);
  assert.match(template.systemInstructions, /Then ask for current pricing or rate structure/i);
  assert.match(template.systemInstructions, /Then ask for the earliest availability/i);
  assert.match(template.systemInstructions, /do not leave a message/i);
  assert.match(template.systemInstructions, /wrong business or wrong number/i);
});

test("booking template uses callback framing and requires exact appointment details", () => {
  const template = buildVoicePromptTemplate({
    kind: "booking",
    providerName: "Acme Landscaping",
    serviceNeeded: "landscaping",
    location: "Los Angeles, CA",
    clientName: "Jordan",
    preferredDateTime: "next Tuesday at 2:00 PM",
  });

  assert.equal(template.variant, "outbound_booking");
  assert.match(template.openingPrompt, /Jordan's assistant calling back/i);
  assert.match(template.systemInstructions, /Do not re-screen whether they offer the service/i);
  assert.match(template.systemInstructions, /Do not accept vague timeframes/i);
  assert.match(template.systemInstructions, /explicit confirmation/i);
});

test("direct-task template builds a deterministic outbound opener and purpose-specific rules", () => {
  const template = buildVoicePromptTemplate({
    kind: "direct_task",
    providerName: "Acme Landscaping",
    serviceNeeded: "landscaping",
    location: "Los Angeles, CA",
    directTaskType: "request_refund",
    taskDescription: "Request a refund for unfinished drainage work.",
  });

  assert.equal(template.variant, "direct_task_request_refund");
  assert.match(template.openingPrompt, /Is this Acme Landscaping\?/i);
  assert.match(template.systemInstructions, /refund advocate/i);
  assert.match(template.systemInstructions, /Request a refund or billing correction/i);
  assert.doesNotMatch(template.openingPrompt, /thanks for calling/i);
});
