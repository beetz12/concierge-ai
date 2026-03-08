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
  assert.equal(config.openai.inputAudioNoiseReduction, undefined);
  assert.equal(config.voiceOptions.minInterruptionDuration, 900);
  assert.equal(
    config.gemini.model,
    "gemini-2.5-flash-native-audio-preview-12-2025",
  );
});

test("worker runtime accepts custom telephony noise thresholds", () => {
  const config = getWorkerRuntimeConfig({
    OPENAI_API_KEY: "test-key",
    OPENAI_REALTIME_TURN_THRESHOLD: "0.9",
    OPENAI_REALTIME_TURN_SILENCE_DURATION_MS: "1500",
    OPENAI_REALTIME_INPUT_AUDIO_NOISE_REDUCTION: "near_field",
  });

  assert.equal(config.openai.turnDetection.threshold, 0.9);
  assert.equal(config.openai.turnDetection.silence_duration_ms, 1500);
  assert.deepEqual(config.openai.inputAudioNoiseReduction, { type: "near_field" });
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
  assert.match(instructions, /Never say or imply 'thanks for calling'/i);
  assert.match(instructions, /use finishCall/i);
});

test("opening prompt verifies the business identity before the service question", () => {
  const opening = buildOpeningPrompt(qualificationMetadata);

  assert.match(opening, /calling on behalf of a client/i);
  assert.match(opening, /Is this Acme Landscaping\?/i);
});
