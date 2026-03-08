import { SignJWT } from "jose";
import { getCallRuntimeConfig } from "../config/call-runtime.js";

export interface LiveKitParticipantTokenRequest {
  identity: string;
  name?: string;
  room?: string;
  metadata?: string;
  ttl?: string;
  videoGrant?: {
    room?: string;
    roomJoin?: boolean;
    canPublish?: boolean;
    canSubscribe?: boolean;
  };
  attributes?: Record<string, string>;
}

function getLiveKitCredentials() {
  const runtimeConfig = getCallRuntimeConfig();

  if (!runtimeConfig.livekit.configured) {
    throw new Error(
      "LiveKit is not fully configured. Ensure LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are set.",
    );
  }

  return {
    url: runtimeConfig.livekit.url,
    apiKey: runtimeConfig.livekit.apiKey,
    apiSecret: runtimeConfig.livekit.apiSecret,
  };
}

export function getLiveKitUrl() {
  return getLiveKitCredentials().url!;
}

export function createLiveKitServiceHeaders() {
  const { apiKey, apiSecret } = getLiveKitCredentials();
  return {
    "x-livekit-api-key": apiKey!,
    "x-livekit-api-secret": apiSecret!,
  };
}

export async function createLiveKitParticipantToken(
  request: LiveKitParticipantTokenRequest,
) {
  const { apiKey, apiSecret } = getLiveKitCredentials();
  const now = Math.floor(Date.now() / 1000);
  const ttlSeconds = request.ttl ? parseDurationToSeconds(request.ttl) : 60 * 60;

  return await new SignJWT({
    name: request.name,
    metadata: request.metadata,
    attributes: request.attributes,
    video: {
      room: request.room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      ...request.videoGrant,
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(apiKey!)
    .setSubject(request.identity)
    .setIssuedAt(now)
    .setNotBefore(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(new TextEncoder().encode(apiSecret!));
}

function parseDurationToSeconds(duration: string) {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(
      `Unsupported LiveKit token ttl "${duration}". Use formats like 30m, 1h, or 1d.`,
    );
  }

  const amount = Number.parseInt(match[1]!, 10);
  const unit = match[2]!;

  switch (unit) {
    case "s":
      return amount;
    case "m":
      return amount * 60;
    case "h":
      return amount * 60 * 60;
    case "d":
      return amount * 60 * 60 * 24;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}
