import { voice } from "@livekit/agents";
import * as google from "@livekit/agents-plugin-google";
import * as livekit from "@livekit/agents-plugin-livekit";
import * as openai from "@livekit/agents-plugin-openai";
import type * as silero from "@livekit/agents-plugin-silero";
import type { LiveKitDispatchMetadata } from "./livekit-metadata.js";

const DEFAULT_STT_MODEL = "assemblyai/universal-streaming:en";
const DEFAULT_LLM_MODEL = "openai/gpt-4.1-mini";
const DEFAULT_TTS_MODEL = "cartesia/sonic-2:9626c31c-bec5-4cca-baa8-f8ba9e84c8bc";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";

export type WorkerModelProvider =
  | "openai-realtime"
  | "gemini-live"
  | "pipeline";

export interface WorkerRuntimeConfig {
  modelProvider: WorkerModelProvider;
  openai: {
    model?: string;
    voice: string;
    turnDetection: {
      type: "server_vad";
      threshold: number;
      prefix_padding_ms: number;
      silence_duration_ms: number;
      create_response: true;
      interrupt_response: boolean;
    };
    inputAudioNoiseReduction: {
      type: "near_field" | "far_field";
    };
  };
  gemini: {
    model: string;
    voice: string;
  };
  pipeline: {
    sttModel: string;
    llmModel: string;
    ttsModel: string;
  };
}

const parseProvider = (value: string | undefined): WorkerModelProvider => {
  switch (value) {
    case undefined:
    case "":
    case "openai-realtime":
      return "openai-realtime";
    case "gemini-live":
      return "gemini-live";
    case "pipeline":
      return "pipeline";
    default:
      throw new Error(
        `Unsupported VOICE_AGENT_MODEL_PROVIDER: ${value}. Expected openai-realtime, gemini-live, or pipeline.`,
      );
  }
};

export const getWorkerRuntimeConfig = (
  env: NodeJS.ProcessEnv = process.env,
): WorkerRuntimeConfig => {
  const modelProvider = parseProvider(env.VOICE_AGENT_MODEL_PROVIDER);

  if (modelProvider === "openai-realtime" && !env.OPENAI_API_KEY) {
    throw new Error(
      "VOICE_AGENT_MODEL_PROVIDER=openai-realtime requires OPENAI_API_KEY.",
    );
  }

  if (modelProvider === "gemini-live" && !env.GOOGLE_API_KEY && !env.GEMINI_API_KEY) {
    throw new Error(
      "VOICE_AGENT_MODEL_PROVIDER=gemini-live requires GOOGLE_API_KEY or GEMINI_API_KEY.",
    );
  }

  return {
    modelProvider,
    openai: {
      model: env.OPENAI_REALTIME_MODEL,
      voice: env.OPENAI_REALTIME_VOICE || "cedar",
      // For phone calls, prefer explicit server VAD over aggressive semantic interruption.
      // This keeps ambient PSTN noise from clipping the assistant's own words mid-sentence.
      turnDetection: {
        type: "server_vad",
        threshold: 0.72,
        prefix_padding_ms: 700,
        silence_duration_ms: 900,
        create_response: true,
        interrupt_response: false,
      },
      inputAudioNoiseReduction: {
        type: "far_field",
      },
    },
    gemini: {
      model: env.GEMINI_LIVE_MODEL || DEFAULT_GEMINI_MODEL,
      voice: env.GEMINI_LIVE_VOICE || "Puck",
    },
    pipeline: {
      sttModel: env.LIVEKIT_STT_MODEL || DEFAULT_STT_MODEL,
      llmModel: env.LIVEKIT_LLM_MODEL || DEFAULT_LLM_MODEL,
      ttsModel: env.LIVEKIT_TTS_MODEL || DEFAULT_TTS_MODEL,
    },
  };
};

export const buildAgentInstructions = (
  metadata: LiveKitDispatchMetadata,
): string => {
  if (metadata.kind === "booking") {
    return [
      "You are an AI concierge calling a service provider to finalize a booking.",
      `Provider: ${metadata.providerName}.`,
      `Service needed: ${metadata.serviceNeeded}.`,
      `Location: ${metadata.location}.`,
      metadata.preferredDateTime
        ? `Preferred appointment time: ${metadata.preferredDateTime}.`
        : "",
      metadata.clientName ? `Client name: ${metadata.clientName}.` : "",
      metadata.clientPhone ? `Client callback number: ${metadata.clientPhone}.` : "",
      metadata.clientAddress ? `Client address: ${metadata.clientAddress}.` : "",
      metadata.additionalNotes ? `Additional notes: ${metadata.additionalNotes}.` : "",
      "Sound like a normal human caller.",
      "Keep each turn short and natural.",
      "Speak smoothly, with warm professional energy, like a polished virtual assistant.",
      "Do not rush. Finish every word fully and avoid clipping the first or last word of a sentence.",
      "Ask for one thing at a time.",
      "When the booking conversation is complete, give one short closing sentence and immediately use the finishCall tool.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  return [
    "You are an AI concierge qualifying a local service provider by phone.",
    `Provider: ${metadata.providerName}.`,
    `Service needed: ${metadata.serviceNeeded}.`,
    `Location: ${metadata.location}.`,
    metadata.userCriteria ? `User criteria: ${metadata.userCriteria}.` : "",
    metadata.problemDescription ? `Problem description: ${metadata.problemDescription}.` : "",
    metadata.urgency ? `Urgency: ${metadata.urgency}.` : "",
    metadata.clientAddress ? `Job address: ${metadata.clientAddress}.` : "",
    "Sound like a normal business caller, not a chatbot.",
    "Keep your voice responses brief, warm, and conversational.",
    "Speak smoothly, with warm professional energy, like a polished virtual assistant.",
    "Do not rush. Finish every word fully and avoid clipping the first or last word of a sentence.",
    "Ask only one question at a time and wait for the answer before asking the next question.",
    "Never bombard the provider with multiple questions in one turn.",
    "Question order: first confirm whether they offer the requested service, then ask what specific services they offer, then ask pricing, then ask earliest availability.",
    "If they already answered a later question, do not ask it again.",
    "Once you have service confirmation, services offered, pricing, and earliest availability, give one short closing sentence and immediately use the finishCall tool.",
  ]
    .filter(Boolean)
    .join(" ");
};

export const buildOpeningPrompt = (metadata: LiveKitDispatchMetadata): string => {
  if (metadata.kind === "booking") {
    return [
      "Introduce yourself briefly.",
      `Say you are calling about scheduling ${metadata.serviceNeeded}.`,
      metadata.preferredDateTime
        ? `Ask whether ${metadata.preferredDateTime} is available.`
        : "Ask for the next available appointment window.",
      "Ask only that first question.",
    ].join(" ");
  }

  return `Introduce yourself briefly and ask only this first question: do you offer ${metadata.serviceNeeded}?`;
};

export const createAgentSession = (
  config: WorkerRuntimeConfig,
  vad: silero.VAD,
): voice.AgentSession => {
  switch (config.modelProvider) {
    case "gemini-live":
      return new voice.AgentSession({
        vad,
        llm: new google.beta.realtime.RealtimeModel({
          model: config.gemini.model,
          voice: config.gemini.voice,
          temperature: 0.7,
        }),
      });
    case "pipeline":
      return new voice.AgentSession({
        vad,
        stt: config.pipeline.sttModel,
        llm: config.pipeline.llmModel,
        tts: config.pipeline.ttsModel,
        turnDetection: new livekit.turnDetector.MultilingualModel(),
      });
    case "openai-realtime":
    default:
      return new voice.AgentSession({
        vad,
        llm: new openai.realtime.RealtimeModel({
          model: config.openai.model,
          voice: config.openai.voice,
          temperature: 0.7,
          inputAudioNoiseReduction: config.openai.inputAudioNoiseReduction,
          turnDetection: config.openai.turnDetection,
        }),
      });
  }
};
