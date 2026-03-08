import { voice } from "@livekit/agents";
import * as google from "@livekit/agents-plugin-google";
import * as livekit from "@livekit/agents-plugin-livekit";
import * as openai from "@livekit/agents-plugin-openai";
import type * as silero from "@livekit/agents-plugin-silero";
import type { LiveKitDispatchMetadata } from "./livekit-metadata.js";
import { buildVoicePromptTemplate } from "./prompts/index.js";

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
  voiceOptions: {
    minInterruptionDuration: number;
    minEndpointingDelay: number;
    maxEndpointingDelay: number;
  };
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
    inputAudioNoiseReduction?: {
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

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Expected numeric value, received: ${value}`);
  }

  return parsed;
};

const parseNoiseReduction = (
  value: string | undefined,
): { type: "near_field" | "far_field" } | undefined => {
  if (value === undefined || value === "") {
    return undefined;
  }

  if (value === "near_field" || value === "far_field") {
    return { type: value };
  }

  throw new Error(
    `Unsupported OPENAI_REALTIME_INPUT_AUDIO_NOISE_REDUCTION: ${value}. Expected near_field or far_field.`,
  );
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
    voiceOptions: {
      minInterruptionDuration: parseNumber(
        env.VOICE_AGENT_MIN_INTERRUPTION_DURATION_MS,
        900,
      ),
      minEndpointingDelay: parseNumber(
        env.VOICE_AGENT_MIN_ENDPOINTING_DELAY_MS,
        900,
      ),
      maxEndpointingDelay: parseNumber(
        env.VOICE_AGENT_MAX_ENDPOINTING_DELAY_MS,
        6000,
      ),
    },
    openai: {
      model: env.OPENAI_REALTIME_MODEL,
      voice: env.OPENAI_REALTIME_VOICE || "cedar",
      // For phone calls, prefer explicit server VAD over aggressive semantic interruption.
      // This keeps ambient PSTN noise from clipping the assistant's own words mid-sentence.
      turnDetection: {
        type: "server_vad",
        threshold: parseNumber(env.OPENAI_REALTIME_TURN_THRESHOLD, 0.82),
        prefix_padding_ms: parseNumber(
          env.OPENAI_REALTIME_TURN_PREFIX_PADDING_MS,
          700,
        ),
        silence_duration_ms: parseNumber(
          env.OPENAI_REALTIME_TURN_SILENCE_DURATION_MS,
          1200,
        ),
        create_response: true,
        interrupt_response: false,
      },
      inputAudioNoiseReduction: parseNoiseReduction(
        env.OPENAI_REALTIME_INPUT_AUDIO_NOISE_REDUCTION,
      ),
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
  return buildVoicePromptTemplate(metadata).systemInstructions;
};

export const buildOpeningPrompt = (metadata: LiveKitDispatchMetadata): string => {
  return buildVoicePromptTemplate(metadata).openingPrompt;
};

export const createAgentSession = (
  config: WorkerRuntimeConfig,
  vad: silero.VAD,
): voice.AgentSession => {
  switch (config.modelProvider) {
    case "gemini-live":
      return new voice.AgentSession({
        vad,
        voiceOptions: config.voiceOptions,
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
        voiceOptions: config.voiceOptions,
        turnDetection: new livekit.turnDetector.MultilingualModel(),
      });
    case "openai-realtime":
    default:
      return new voice.AgentSession({
        vad,
        voiceOptions: config.voiceOptions,
        llm: new openai.realtime.RealtimeModel({
          model: config.openai.model,
          voice: config.openai.voice,
          temperature: 0.7,
          turnDetection: config.openai.turnDetection,
          inputAudioNoiseReduction: config.openai.inputAudioNoiseReduction,
        }),
      });
  }
};
