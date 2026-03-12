import { z } from "zod";

const previewCallSchema = z.object({
  mode: z.enum(["qualification", "booking", "direct_task"]).default("qualification"),
  contractorName: z.string().min(1),
  contractorPhone: z.string().regex(/^\+1\d{10}$/),
  serviceNeeded: z.string().min(1),
  location: z.string().min(1),
  userCriteria: z.string().optional(),
  problemDescription: z.string().optional(),
  urgency: z
    .enum(["immediate", "within_24_hours", "within_2_days", "flexible"])
    .optional(),
  clientName: z.string().optional(),
  clientPhone: z.string().regex(/^\+1\d{10}$/).optional(),
  clientAddress: z.string().optional(),
  preferredDateTime: z.string().optional(),
  additionalNotes: z.string().optional(),
  mustAskQuestions: z.array(z.string().min(1)).optional(),
  dealBreakers: z.array(z.string().min(1)).optional(),
  taskDescription: z.string().optional(),
});

const dispatchCallSchema = previewCallSchema;

const sessionIdSchema = z.object({
  sessionId: z.string().min(1),
});

const browserMonitorSchema = sessionIdSchema.extend({
  displayName: z.string().min(1).optional(),
  canPublishAudio: z.boolean().optional(),
});

const supervisorCallSchema = sessionIdSchema.extend({
  phoneNumber: z.string().regex(/^\+1\d{10}$/),
  displayName: z.string().min(1).optional(),
});

const sessionControlSchema = sessionIdSchema;

const sendSmsSchema = z.object({
  to: z.string().regex(/^\+1\d{10}$/),
  body: z.string().min(1).max(1600),
  mediaUrl: z.array(z.string().url()).max(10).optional(),
});

const checkSmsStatusSchema = z.object({
  messageSid: z.string().min(1),
});

const artifactResultSchema = z.object({
  disposition: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  availability: z.string().nullable().optional(),
  estimatedRate: z.string().nullable().optional(),
  transcript: z.string().nullable().optional(),
  recordingPath: z.string().nullable().optional(),
  transcriptPath: z.string().nullable().optional(),
  sessionReportPath: z.string().nullable().optional(),
});

export type PreviewCallInput = z.infer<typeof previewCallSchema>;
export type DispatchCallInput = z.infer<typeof dispatchCallSchema>;
export type GetCallStatusInput = z.infer<typeof sessionIdSchema>;
export type BrowserMonitorInput = z.infer<typeof browserMonitorSchema>;
export type SupervisorCallInput = z.infer<typeof supervisorCallSchema>;
export type SessionControlInput = z.infer<typeof sessionControlSchema>;
export type SendSmsInput = z.infer<typeof sendSmsSchema>;
export type CheckSmsStatusInput = z.infer<typeof checkSmsStatusSchema>;

export const inputSchemas = {
  previewCall: previewCallSchema,
  dispatchCall: dispatchCallSchema,
  getCallStatus: sessionIdSchema,
  getCallArtifacts: sessionIdSchema,
  createBrowserMonitor: browserMonitorSchema,
  joinSupervisorCall: supervisorCallSchema,
  pauseCall: sessionControlSchema,
  resumeCall: sessionControlSchema,
  sendSms: sendSmsSchema,
  checkSmsStatus: checkSmsStatusSchema,
} as const;

export interface VoiceApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:8000/api/v1/voice";

export class VoiceApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VoiceApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl || process.env.VOICE_MCP_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl || fetch;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers || {}),
      },
    });

    const json = (await response.json()) as T | { error?: string; message?: string };
    if (!response.ok) {
      const message =
        typeof json === "object" && json && "message" in json && typeof json.message === "string"
          ? json.message
          : `Voice API request failed (${response.status})`;
      throw new Error(message);
    }

    return json as T;
  }

  previewCall(input: PreviewCallInput) {
    return this.request("/preview-call", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  dispatchCall(input: DispatchCallInput) {
    return this.request("/call-contractor", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  getCallStatus({ sessionId }: GetCallStatusInput) {
    return this.request<{
      success: true;
      completed: boolean;
      session: Record<string, unknown>;
      provider: Record<string, unknown> | null;
      serviceRequest: Record<string, unknown> | null;
      events: Array<Record<string, unknown>>;
      result: z.infer<typeof artifactResultSchema>;
    }>(`/calls/${sessionId}`);
  }

  async getCallArtifacts({ sessionId }: GetCallStatusInput) {
    const status = await this.getCallStatus({ sessionId });
    return {
      sessionId,
      completed: status.completed,
      result: artifactResultSchema.parse(status.result),
    };
  }

  createBrowserMonitor(input: BrowserMonitorInput) {
    return this.request(`/calls/${input.sessionId}/supervisor/browser-token`, {
      method: "POST",
      body: JSON.stringify({
        displayName: input.displayName,
        canPublishAudio: input.canPublishAudio,
      }),
    });
  }

  joinSupervisorCall(input: SupervisorCallInput) {
    return this.request(`/calls/${input.sessionId}/supervisor/call`, {
      method: "POST",
      body: JSON.stringify({
        phoneNumber: input.phoneNumber,
        displayName: input.displayName,
      }),
    });
  }

  pauseCall({ sessionId }: SessionControlInput) {
    return this.request(`/calls/${sessionId}/pause`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  resumeCall({ sessionId }: SessionControlInput) {
    return this.request(`/calls/${sessionId}/resume`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  sendSms(input: SendSmsInput) {
    return this.request<{
      success: boolean;
      messageSid?: string;
      messageStatus?: string;
      error?: string;
    }>("/sms/send", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  checkSmsStatus({ messageSid }: CheckSmsStatusInput) {
    return this.request<{
      success: boolean;
      messageSid: string;
      status: string;
      to: string;
      from: string;
      dateSent: string | null;
      errorCode: number | null;
      errorMessage: string | null;
    }>(`/sms/${messageSid}/status`);
  }
}

export const summarizeStatus = (status: {
  completed: boolean;
  session: Record<string, unknown>;
  result: z.infer<typeof artifactResultSchema>;
  events: Array<Record<string, unknown>>;
}) => {
  const currentStatus =
    typeof status.session.status === "string" ? status.session.status : "unknown";
  const summaryParts = [`status=${currentStatus}`];

  if (status.result.disposition) {
    summaryParts.push(`disposition=${status.result.disposition}`);
  }

  if (status.result.availability) {
    summaryParts.push(`availability=${status.result.availability}`);
  }

  if (status.result.estimatedRate) {
    summaryParts.push(`rate=${status.result.estimatedRate}`);
  }

  const lastEvent = status.events.at(-1);
  if (lastEvent && typeof lastEvent.event_type === "string") {
    summaryParts.push(`last_event=${lastEvent.event_type}`);
  }

  return summaryParts.join(", ");
};
