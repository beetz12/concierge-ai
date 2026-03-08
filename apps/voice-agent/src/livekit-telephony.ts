import { AgentDispatchClient, SipClient } from "livekit-server-sdk";
import type { VoiceAgentConfig } from "./config.js";

export interface LiveKitDispatchClients {
  dispatchClient: {
    createDispatch(
      roomName: string,
      agentName: string,
      options?: { metadata?: string },
    ): Promise<{ id: string }>;
  };
  sipClient: {
    createSipParticipant(
      sipTrunkId: string,
      number: string,
      roomName: string,
      opts?: {
        fromNumber?: string;
        participantIdentity?: string;
        participantName?: string;
        displayName?: string;
        participantMetadata?: string;
        participantAttributes?: { [key: string]: string };
        waitUntilAnswered?: boolean;
      },
    ): Promise<unknown>;
  };
}

export interface OutboundCallDispatchInput {
  roomName: string;
  phoneNumber: string;
  metadata: string;
  participantIdentity: string;
  displayName: string;
  participantAttributes?: Record<string, string>;
}

export interface OutboundCallDispatchResult {
  dispatchId: string;
  participantIdentity: string;
  roomName: string;
}

const createClients = (config: VoiceAgentConfig): LiveKitDispatchClients => {
  if (!config.livekit.serverUrl || !config.livekit.apiKey || !config.livekit.apiSecret) {
    throw new Error(
      "LiveKit server credentials are incomplete. Expected LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.",
    );
  }

  return {
    dispatchClient: new AgentDispatchClient(
      config.livekit.serverUrl,
      config.livekit.apiKey,
      config.livekit.apiSecret,
    ),
    sipClient: new SipClient(
      config.livekit.serverUrl,
      config.livekit.apiKey,
      config.livekit.apiSecret,
    ),
  };
};

export class LiveKitTelephonyService {
  constructor(
    private readonly config: VoiceAgentConfig,
    private readonly clients: LiveKitDispatchClients = createClients(config),
  ) {}

  async dispatchOutboundCall(
    input: OutboundCallDispatchInput,
  ): Promise<OutboundCallDispatchResult> {
    if (!this.config.livekit.telephonyConfigured || !this.config.livekit.sipOutboundTrunkId) {
      throw new Error(
        "LiveKit telephony is not configured. Expected LIVEKIT_SIP_OUTBOUND_TRUNK_ID and valid LiveKit credentials.",
      );
    }

    const dispatch = await this.clients.dispatchClient.createDispatch(
      input.roomName,
      this.config.livekit.agentName,
      {
        metadata: input.metadata,
      },
    );

    await this.clients.sipClient.createSipParticipant(
      this.config.livekit.sipOutboundTrunkId,
      input.phoneNumber,
      input.roomName,
      {
        fromNumber: this.config.livekit.fromNumber,
        participantIdentity: input.participantIdentity,
        participantName: input.displayName,
        displayName: input.displayName,
        participantMetadata: input.metadata,
        participantAttributes: input.participantAttributes,
        waitUntilAnswered: false,
      },
    );

    return {
      dispatchId: dispatch.id,
      participantIdentity: input.participantIdentity,
      roomName: input.roomName,
    };
  }
}
