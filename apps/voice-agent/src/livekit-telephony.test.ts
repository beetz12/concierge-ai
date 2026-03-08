import assert from "node:assert/strict";
import test from "node:test";
import { LiveKitTelephonyService } from "./livekit-telephony.js";
import type { VoiceAgentConfig } from "./config.js";

const baseConfig: VoiceAgentConfig = {
  host: "0.0.0.0",
  port: 8787,
  workerControlPort: 8788,
  callRuntimeProvider: "livekit",
  apiBaseUrl: "http://127.0.0.1:8000/api/v1/voice-tools",
  sharedSecret: "secret",
  livekit: {
    url: "wss://example.livekit.cloud",
    apiKey: "key",
    apiSecret: "secret",
    serverUrl: "https://example.livekit.cloud",
    agentName: "concierge-outbound-agent",
    sipOutboundTrunkId: "ST_123",
    fromNumber: "+15550001111",
    sipKrispEnabled: true,
    configured: true,
    telephonyConfigured: true,
  },
};

test("LiveKitTelephonyService dispatches agent and SIP participant into the same room", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const service = new LiveKitTelephonyService(baseConfig, {
    dispatchClient: {
      async createDispatch(roomName, agentName, options) {
        calls.push({
          type: "dispatch",
          roomName,
          agentName,
          metadata: options?.metadata,
        });
        return { id: "dispatch_123" };
      },
    },
    sipClient: {
      async createSipParticipant(sipTrunkId, phoneNumber, roomName, options) {
        calls.push({
          type: "sip",
          sipTrunkId,
          phoneNumber,
          roomName,
          options,
        });
        return { participantIdentity: options?.participantIdentity || "sip-participant" };
      },
    },
  });

  const result = await service.dispatchOutboundCall({
    roomName: "concierge-session_123",
    phoneNumber: "+15551234567",
    metadata: "{\"kind\":\"qualification\"}",
    participantIdentity: "provider-provider_123",
    displayName: "Acme Plumbing",
    participantAttributes: {
      sessionId: "session_123",
    },
  });

  assert.equal(result.dispatchId, "dispatch_123");
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.roomName, "concierge-session_123");
  assert.equal(calls[1]?.roomName, "concierge-session_123");
  assert.equal(calls[1]?.sipTrunkId, "ST_123");
  assert.equal((calls[1]?.options as { krispEnabled?: boolean })?.krispEnabled, true);
});

test("LiveKitTelephonyService rejects dispatch when telephony is not configured", async () => {
  const misconfigured: VoiceAgentConfig = {
    ...baseConfig,
    livekit: {
      ...baseConfig.livekit,
      sipOutboundTrunkId: undefined,
      telephonyConfigured: false,
    },
  };

  const service = new LiveKitTelephonyService(misconfigured, {
    dispatchClient: {
      async createDispatch() {
        throw new Error("should not be called");
      },
    },
    sipClient: {
      async createSipParticipant() {
        throw new Error("should not be called");
      },
    },
  });

  await assert.rejects(
    () =>
      service.dispatchOutboundCall({
        roomName: "concierge-session_123",
        phoneNumber: "+15551234567",
        metadata: "{}",
        participantIdentity: "provider-provider_123",
        displayName: "Acme Plumbing",
      }),
    /telephony is not configured/i,
  );
});

test("LiveKitTelephonyService can add a supervisor SIP participant into an existing room", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const service = new LiveKitTelephonyService(baseConfig, {
    dispatchClient: {
      async createDispatch() {
        throw new Error("dispatch should not be called");
      },
    },
    sipClient: {
      async createSipParticipant(sipTrunkId, phoneNumber, roomName, options) {
        calls.push({
          sipTrunkId,
          phoneNumber,
          roomName,
          options,
        });
        return {};
      },
    },
  });

  const result = await service.addSipParticipantToRoom({
    roomName: "concierge-session_123",
    phoneNumber: "+15557654321",
    participantIdentity: "supervisor-session_123",
    displayName: "Supervisor",
    metadata: "{\"role\":\"supervisor\"}",
    participantAttributes: {
      role: "supervisor",
    },
  });

  assert.equal(result.roomName, "concierge-session_123");
  assert.equal(result.participantIdentity, "supervisor-session_123");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.sipTrunkId, "ST_123");
  assert.equal(calls[0]?.phoneNumber, "+15557654321");
});
