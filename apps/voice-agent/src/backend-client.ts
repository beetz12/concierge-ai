export interface VoiceToolsClientConfig {
  baseUrl: string;
  sharedSecret: string;
}

export interface SaveProviderOutcomeInput {
  providerId: string;
  sessionId: string;
  callStatus: string;
  summary: string;
  transcript?: string;
  availability?: string;
  estimatedRate?: string;
  outcome?: Record<string, unknown>;
}

export interface UpsertVoiceSessionInput {
  sessionId: string;
  serviceRequestId: string;
  providerId: string;
  runtimeProvider: string;
  status: string;
  activeAgent: string;
  metadata?: Record<string, string>;
  outcome?: Record<string, unknown> | null;
  startedAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
}

export interface AppendVoiceSessionEventInput {
  sessionId: string;
  serviceRequestId: string;
  providerId: string;
  eventType: string;
  agentRole?: string;
  payload?: Record<string, unknown>;
}

const normalizeBaseUrl = (baseUrl: string): string => {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
};

export class VoiceToolsClient {
  private readonly baseUrl: string;
  private readonly sharedSecret: string;

  constructor(config: VoiceToolsClientConfig) {
    this.baseUrl = normalizeBaseUrl(config.baseUrl);
    this.sharedSecret = config.sharedSecret;
  }

  async getServiceRequestContext(serviceRequestId: string) {
    return this.request(`/service-requests/${serviceRequestId}`);
  }

  async getProviderContext(providerId: string) {
    return this.request(`/providers/${providerId}`);
  }

  async getVoiceSession(sessionId: string) {
    return this.request(`/sessions/${sessionId}`);
  }

  async getVoiceSessionEvents(sessionId: string) {
    return this.request(`/sessions/${sessionId}/events`);
  }

  async upsertVoiceSession(input: UpsertVoiceSessionInput) {
    return this.request(`/sessions/${input.sessionId}`, {
      method: "PUT",
      body: JSON.stringify({
        serviceRequestId: input.serviceRequestId,
        providerId: input.providerId,
        runtimeProvider: input.runtimeProvider,
        status: input.status,
        activeAgent: input.activeAgent,
        metadata: input.metadata,
        outcome: input.outcome,
        startedAt: input.startedAt,
        updatedAt: input.updatedAt,
        closedAt: input.closedAt,
      }),
    });
  }

  async appendVoiceSessionEvent(input: AppendVoiceSessionEventInput) {
    return this.request(`/sessions/${input.sessionId}/events`, {
      method: "POST",
      body: JSON.stringify({
        serviceRequestId: input.serviceRequestId,
        providerId: input.providerId,
        eventType: input.eventType,
        agentRole: input.agentRole,
        payload: input.payload,
      }),
    });
  }

  async saveProviderOutcome(input: SaveProviderOutcomeInput) {
    return this.request(`/providers/${input.providerId}/outcome`, {
      method: "POST",
      body: JSON.stringify({
        sessionId: input.sessionId,
        callStatus: input.callStatus,
        summary: input.summary,
        transcript: input.transcript,
        availability: input.availability,
        estimatedRate: input.estimatedRate,
        outcome: input.outcome,
      }),
    });
  }

  private async request(pathname: string, init?: RequestInit) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-voice-agent-key": this.sharedSecret,
        ...(init?.headers || {}),
      },
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(
        `Voice tools request failed (${response.status}): ${JSON.stringify(data)}`,
      );
    }

    return data;
  }
}
