export interface VoiceAgentConfig {
  host: string;
  port: number;
  workerControlPort: number;
  callRuntimeProvider: string;
  apiBaseUrl: string;
  sharedSecret: string;
  recordingsDir?: string;
  livekit: {
    url?: string;
    apiKey?: string;
    apiSecret?: string;
    serverUrl?: string;
    agentName: string;
    sipOutboundTrunkId?: string;
    fromNumber?: string;
    sipKrispEnabled: boolean;
    configured: boolean;
    telephonyConfigured: boolean;
  };
}

const normalizeLiveKitServerUrl = (value: string | undefined): string | undefined => {
  if (!value) {
    return undefined;
  }

  if (value.startsWith("wss://")) {
    return `https://${value.slice("wss://".length)}`;
  }

  if (value.startsWith("ws://")) {
    return `http://${value.slice("ws://".length)}`;
  }

  return value;
};

const parsePort = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`VOICE_AGENT_PORT must be a positive integer. Received: ${value}`);
  }

  return parsed;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === "") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
};

export const getVoiceAgentConfig = (): VoiceAgentConfig => {
  const livekitUrl = process.env.LIVEKIT_URL;
  const livekitApiKey = process.env.LIVEKIT_API_KEY;
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitConfigured = Boolean(livekitUrl && livekitApiKey && livekitApiSecret);
  const sipOutboundTrunkId = process.env.LIVEKIT_SIP_OUTBOUND_TRUNK_ID;

  return {
    host: process.env.VOICE_AGENT_HOST || "0.0.0.0",
    port: parsePort(process.env.VOICE_AGENT_PORT, 8787),
    workerControlPort: parsePort(process.env.VOICE_AGENT_WORKER_CONTROL_PORT, 8788),
    callRuntimeProvider: process.env.CALL_RUNTIME_PROVIDER || "livekit",
    apiBaseUrl: process.env.VOICE_AGENT_API_BASE_URL || "http://127.0.0.1:8000/api/v1/voice-tools",
    sharedSecret:
      process.env.VOICE_AGENT_SHARED_SECRET || "dev-voice-agent-secret",
    recordingsDir: process.env.VOICE_AGENT_RECORDINGS_DIR,
    livekit: {
      url: livekitUrl,
      apiKey: livekitApiKey,
      apiSecret: livekitApiSecret,
      serverUrl: normalizeLiveKitServerUrl(livekitUrl),
      agentName: process.env.LIVEKIT_AGENT_NAME || "concierge-outbound-agent",
      sipOutboundTrunkId,
      fromNumber: process.env.LIVEKIT_SIP_FROM_NUMBER,
      sipKrispEnabled: parseBoolean(process.env.LIVEKIT_SIP_KRISP_ENABLED, true),
      configured: livekitConfigured,
      telephonyConfigured: Boolean(livekitConfigured && sipOutboundTrunkId),
    },
  };
};

export { normalizeLiveKitServerUrl };
