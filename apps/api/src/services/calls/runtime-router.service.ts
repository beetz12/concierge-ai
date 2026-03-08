import { getCallRuntimeConfig } from "../../config/call-runtime.js";
import type {
  BatchCallResult,
} from "../vapi/concurrent-call.service.js";
import { ProviderCallingService } from "../vapi/provider-calling.service.js";
import type { CallRequest, CallResult } from "../vapi/types.js";

interface Logger {
  info: (obj: Record<string, unknown>, msg?: string) => void;
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
}

export interface LiveKitDispatchResult {
  success: true;
  runtimeProvider: "livekit";
  accepted: true;
  sessionId: string;
  dispatchId: string;
  providerId?: string;
  serviceRequestId?: string;
}

export interface LiveKitBatchDispatchResult extends BatchCallResult {
  runtimeProvider: "livekit";
  accepted: true;
  dispatches: LiveKitDispatchResult[];
  resultsInDatabase: true;
}

type RuntimeCallResult = CallResult | LiveKitDispatchResult;
type RuntimeBatchResult = BatchCallResult | LiveKitBatchDispatchResult;

export class RuntimeRouterService {
  constructor(
    private readonly logger: Logger,
    private readonly providerCallingService: ProviderCallingService,
  ) {}

  async callProvider(request: CallRequest): Promise<RuntimeCallResult> {
    const config = getCallRuntimeConfig();

    if (config.provider === "livekit") {
      return this.dispatchLiveKitCall(request);
    }

    return this.providerCallingService.callProvider(request);
  }

  async callProvidersBatch(
    requests: CallRequest[],
    options?: { maxConcurrent?: number },
  ): Promise<RuntimeBatchResult> {
    const config = getCallRuntimeConfig();

    if (config.provider === "livekit") {
      return this.dispatchLiveKitBatch(requests);
    }

    return this.providerCallingService.callProvidersBatch(requests, options);
  }

  async getSystemStatus() {
    const baseStatus = await this.providerCallingService.getSystemStatus();
    const config = getCallRuntimeConfig();

    return {
      ...baseStatus,
      runtimeProvider: config.provider,
      livekitEnabled: config.livekitEnabled,
      voiceAgentUrl: process.env.VOICE_AGENT_SERVICE_URL || "http://127.0.0.1:8787",
    };
  }

  private async dispatchLiveKitCall(
    request: CallRequest,
  ): Promise<LiveKitDispatchResult> {
    const payload = (await this.postToVoiceAgent("/dispatch/provider-call", {
      request,
    })) as LiveKitDispatchResult;

    this.logger.info(
      {
        runtimeProvider: "livekit",
        sessionId: payload.sessionId,
        dispatchId: payload.dispatchId,
        provider: request.providerName,
      },
      "Dispatched provider call to voice-agent service",
    );

    return payload;
  }

  private async dispatchLiveKitBatch(
    requests: CallRequest[],
  ): Promise<LiveKitBatchDispatchResult> {
    const payload = (await this.postToVoiceAgent("/dispatch/provider-batch", {
      requests,
    })) as {
      dispatches: LiveKitDispatchResult[];
    };

    this.logger.info(
      {
        runtimeProvider: "livekit",
        providerCount: requests.length,
        dispatchCount: payload.dispatches.length,
      },
      "Dispatched provider batch to voice-agent service",
    );

    return {
      success: true,
      runtimeProvider: "livekit",
      accepted: true,
      dispatches: payload.dispatches,
      resultsInDatabase: true,
      results: [],
      stats: {
        total: requests.length,
        completed: requests.length,
        failed: 0,
        timeout: 0,
        noAnswer: 0,
        voicemail: 0,
        duration: 0,
        averageCallDuration: 0,
      },
      errors: [],
    };
  }

  private async postToVoiceAgent(pathname: string, payload: unknown) {
    const config = getCallRuntimeConfig();
    const voiceAgentUrl = process.env.VOICE_AGENT_SERVICE_URL || "http://127.0.0.1:8787";
    const response = await fetch(`${voiceAgentUrl}${pathname}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-voice-agent-key": config.voiceAgent.sharedSecret,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        `Voice agent dispatch failed (${response.status}): ${JSON.stringify(data)}`,
      );
    }

    return data;
  }
}
