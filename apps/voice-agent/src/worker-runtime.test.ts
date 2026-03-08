import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentInstructions,
  buildOpeningPrompt,
  getWorkerRuntimeConfig,
} from "./worker-runtime.js";

const qualificationMetadata = {
  kind: "qualification" as const,
  sessionId: "session_123",
  serviceRequestId: "request_123",
  providerId: "provider_123",
  providerName: "Acme Landscaping",
  providerPhone: "+15551234567",
  serviceNeeded: "landscaping",
  location: "Los Angeles, CA",
};

test("worker runtime defaults to OpenAI realtime", () => {
  const config = getWorkerRuntimeConfig({
    OPENAI_API_KEY: "test-key",
  });

  assert.equal(config.modelProvider, "openai-realtime");
  assert.equal(config.openai.voice, "cedar");
  assert.equal(config.openai.turnDetection.type, "server_vad");
  assert.equal(config.openai.turnDetection.interrupt_response, false);
  assert.equal(config.openai.inputAudioNoiseReduction.type, "far_field");
  assert.equal(
    config.gemini.model,
    "gemini-2.5-flash-native-audio-preview-12-2025",
  );
});

test("worker runtime accepts gemini-live override", () => {
  const config = getWorkerRuntimeConfig({
    VOICE_AGENT_MODEL_PROVIDER: "gemini-live",
    GOOGLE_API_KEY: "test-key",
    GEMINI_LIVE_VOICE: "Aoede",
  });

  assert.equal(config.modelProvider, "gemini-live");
  assert.equal(config.gemini.voice, "Aoede");
});

test("worker runtime rejects realtime providers without credentials", () => {
  assert.throws(
    () => getWorkerRuntimeConfig({ VOICE_AGENT_MODEL_PROVIDER: "openai-realtime" }),
    /OPENAI_API_KEY/i,
  );
  assert.throws(
    () => getWorkerRuntimeConfig({ VOICE_AGENT_MODEL_PROVIDER: "gemini-live" }),
    /GOOGLE_API_KEY|GEMINI_API_KEY/i,
  );
});

test("qualification instructions enforce one-question turns and explicit finish", () => {
  const instructions = buildAgentInstructions(qualificationMetadata);

  assert.match(instructions, /Ask only one question at a time/i);
  assert.match(instructions, /Never bombard the provider/i);
  assert.match(instructions, /finishCall tool/i);
});

test("opening prompt asks only the first service confirmation question", () => {
  const opening = buildOpeningPrompt(qualificationMetadata);

  assert.match(opening, /ask only this first question/i);
  assert.match(opening, /do you offer landscaping/i);
});
