/**
 * Retell-backed {@link CallBackend}.
 *
 * Wraps the Retell AI REST API using the exact request shapes proven by the
 * `call-biz` CLI: `/v2/create-phone-call` dispatch with
 * `retell_llm_dynamic_variables`, `/v2/get-call` status, `/v2/stop-call`
 * cancel, and a `/v2/list-calls` powered 24h redial guard. Artifacts are
 * copied out of Retell immediately (recording URLs expire) into a durable
 * artifact store.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CallArtifacts,
  CallBackend,
  CallBackendCapabilities,
  CallBackendId,
  CallPlan,
  CallStatus,
  CallStatusState,
} from "../types.js";
import {
  createArtifactStore,
  type ArtifactFile,
  type RetellArtifactStore,
} from "./artifacts.js";
import {
  assertRedialAllowed,
  assertSingleUsE164,
  assertUserApproved,
} from "./guards.js";
import { RetellProvisioner } from "./provisioning.js";
import {
  RetellHttpClient,
  RetellHttpError,
  describeApiError,
} from "./retell-http.js";
import {
  RETELL_TERMINAL_STATUSES,
  retellCallSchema,
  retellDispatchResponseSchema,
  type RetellCall,
} from "./schemas.js";

export interface RetellCallBackendOptions {
  client: RetellHttpClient;
  artifactStore: RetellArtifactStore;
  /** Outbound caller id (E.164) owned by the Retell account. */
  fromNumber?: string;
  /** Agent to dispatch with; lazily provisioned when omitted. */
  agentId?: string;
  /** Used to auto-provision the agent when no agentId is configured. */
  provisioner?: RetellProvisioner;
  /** Clock override for tests. */
  now?: () => number;
  /** Warning sink (default: console.warn). */
  warn?: (message: string) => void;
}

export class RetellCallBackend implements CallBackend {
  readonly id: CallBackendId = "retell";

  /**
   * Retell calls are fire-and-forget once dispatched: no pause/resume,
   * no live supervisor audio, and no warm transfer through this adapter.
   */
  readonly capabilities: CallBackendCapabilities = {
    supportsPause: false,
    supportsSupervision: false,
    supportsWarmTransfer: false,
    supportsDtmf: false,
  };

  private readonly client: RetellHttpClient;
  private readonly artifactStore: RetellArtifactStore;
  private readonly fromNumber: string | undefined;
  private readonly agentId: string | undefined;
  private readonly provisioner: RetellProvisioner | undefined;
  private readonly now: () => number;
  private readonly warn: (message: string) => void;
  private provisionedAgentId: Promise<string> | undefined;

  constructor(options: RetellCallBackendOptions) {
    this.client = options.client;
    this.artifactStore = options.artifactStore;
    this.fromNumber = options.fromNumber;
    this.agentId = options.agentId;
    this.provisioner = options.provisioner;
    this.now = options.now ?? Date.now;
    this.warn =
      options.warn ??
      ((message: string) => console.warn(`[retell-backend] ${message}`));
  }

  async dispatchCall(plan: CallPlan): Promise<{ callId: string }> {
    assertUserApproved(plan);
    assertSingleUsE164(plan.phoneNumber);
    await assertRedialAllowed(this.client, plan, {
      now: this.now,
      warn: this.warn,
    });

    const fromNumber = this.fromNumber;
    if (!fromNumber) {
      throw new Error(
        "Retell backend has no outbound number configured. Set RETELL_FROM_NUMBER.",
      );
    }
    const agentId = await this.resolveAgentId();

    const { status, json } = await this.client.request(
      "POST",
      "/v2/create-phone-call",
      buildDispatchPayload(plan, { fromNumber, agentId, now: this.now }),
    );
    if (status !== 200 && status !== 201) {
      throw new RetellHttpError(
        status,
        json,
        `Retell dispatch failed with HTTP ${status}: ${describeApiError(json)}`,
      );
    }
    const call = retellDispatchResponseSchema.parse(json);
    return { callId: call.call_id };
  }

  async getStatus(callId: string): Promise<CallStatus> {
    const call = await this.getCall(callId);
    return {
      callId,
      state: mapRetellCallStatus(call.call_status),
      completed: RETELL_TERMINAL_STATUSES.has(call.call_status),
      disposition: call.disconnection_reason ?? null,
      summary: call.call_analysis?.call_summary ?? null,
    };
  }

  async getArtifacts(callId: string): Promise<CallArtifacts> {
    const call = await this.getCall(callId);
    if (!RETELL_TERMINAL_STATUSES.has(call.call_status)) {
      throw new Error(
        `Call ${callId} is '${call.call_status}' — wait for it to end before collecting artifacts.`,
      );
    }

    const files: ArtifactFile[] = [];
    if (call.transcript) {
      files.push({
        name: "transcript.txt",
        data: call.transcript,
        contentType: "text/plain",
      });
    }
    files.push({
      name: "call.json",
      data: JSON.stringify(slimCallObject(call), null, 2),
      contentType: "application/json",
    });

    // Recording URLs expire — download and persist immediately.
    let recordingError: string | null = null;
    if (call.recording_url) {
      try {
        files.push({
          name: "recording.wav",
          data: await this.client.fetchBinary(call.recording_url),
          contentType: "audio/wav",
        });
      } catch (error) {
        recordingError =
          `${error instanceof Error ? error.message : String(error)} ` +
          "(recording URLs expire — collect artifacts soon after the call ends)";
        this.warn(`recording download failed for ${callId}: ${recordingError}`);
      }
    }

    const refs = await this.artifactStore.save(callId, files);
    const analysis = call.call_analysis ?? null;

    return {
      callId,
      recordingRef: refs["recording.wav"] ?? null,
      transcript: call.transcript ?? null,
      structuredOutcome: {
        callStatus: call.call_status,
        disconnectionReason: call.disconnection_reason ?? null,
        durationMs: call.duration_ms ?? null,
        startTimestamp: call.start_timestamp ?? null,
        endTimestamp: call.end_timestamp ?? null,
        fromNumber: call.from_number ?? null,
        toNumber: call.to_number ?? null,
        callSuccessful: analysis?.call_successful ?? null,
        callSummary: analysis?.call_summary ?? null,
        userSentiment: analysis?.user_sentiment ?? null,
        customAnalysisData: analysis?.custom_analysis_data ?? null,
        artifacts: refs,
        ...(recordingError ? { recordingError } : {}),
      },
    };
  }

  async cancelCall(callId: string): Promise<void> {
    await this.client.requestOk(
      "POST",
      `/v2/stop-call/${encodeURIComponent(callId)}`,
      undefined,
      [200, 201, 204],
    );
  }

  private async getCall(callId: string): Promise<RetellCall> {
    const json = await this.client.requestOk(
      "GET",
      `/v2/get-call/${encodeURIComponent(callId)}`,
    );
    return retellCallSchema.parse(json);
  }

  private resolveAgentId(): Promise<string> {
    if (this.agentId) {
      return Promise.resolve(this.agentId);
    }
    const provisioner = this.provisioner;
    if (!provisioner) {
      throw new Error(
        "Retell backend has no agent configured. Set RETELL_AGENT_ID or provide a provisioner.",
      );
    }
    this.provisionedAgentId ??= provisioner
      .ensureProvisioned()
      .then((result) => result.agentId);
    return this.provisionedAgentId;
  }
}

/**
 * Build the `/v2/create-phone-call` request body. Field-for-field mirror of
 * the call-biz dispatch payload (dynamic variables, metadata, and the
 * machine-level voicemail hangup override).
 */
export function buildDispatchPayload(
  plan: CallPlan,
  options: { fromNumber: string; agentId: string; now?: () => number },
): Record<string, unknown> {
  const now = options.now ?? Date.now;
  const contextParts = [
    plan.context,
    ...plan.preAuthorizations.map((auth) => `${auth.key}: ${auth.value}`),
  ]
    .map((part) => part.trim())
    .filter(Boolean);

  const payload: Record<string, unknown> = {
    from_number: options.fromNumber,
    to_number: plan.phoneNumber,
    override_agent_id: options.agentId,
    retell_llm_dynamic_variables: {
      business_name: plan.businessName || plan.phoneNumber,
      objective: plan.objective,
      context: contextParts.join("\n") || "No additional context provided.",
      must_ask:
        plan.mustAsk.length > 0 ? plan.mustAsk.join("; ") : plan.objective,
      caller_identity: plan.callerIdentity,
      callback_number: plan.callbackNumber ?? "",
    },
    metadata: {
      source: "concierge-api",
      business: plan.businessName || "",
      date: new Date(now()).toISOString().slice(0, 10),
      ...(plan.tenantId ? { tenant_id: plan.tenantId } : {}),
    },
  };

  // "leave_message" defers to the agent prompt; anything else gets the
  // machine-level guaranteed hangup (call-biz `--voicemail hangup`).
  if (plan.voicemailPolicy !== "leave_message") {
    payload["agent_override"] = {
      agent: { voicemail_option: { action: { type: "hangup" } } },
    };
  }

  return payload;
}

export function mapRetellCallStatus(callStatus: string): CallStatusState {
  switch (callStatus) {
    case "registered":
      return "queued";
    case "ongoing":
      return "in_progress";
    case "ended":
      return "completed";
    case "error":
    case "not_connected":
      return "failed";
    default:
      return "in_progress";
  }
}

/** Drop the bulky transcript variants before persisting call.json (call-biz). */
function slimCallObject(call: RetellCall): Record<string, unknown> {
  const {
    transcript_object: _transcriptObject,
    transcript_with_tool_calls: _transcriptWithToolCalls,
    scrubbed_transcript_with_tool_calls: _scrubbedTranscript,
    ...slim
  } = call as Record<string, unknown>;
  return slim;
}

/**
 * Build a Retell backend from environment configuration. Used by the
 * CallBackend factory when `CALL_BACKEND=retell`.
 */
export function createRetellCallBackendFromEnv(
  deps: { supabase: SupabaseClient },
  env: NodeJS.ProcessEnv = process.env,
): RetellCallBackend {
  const apiKey = env.RETELL_API_KEY?.trim() ?? "";
  if (!apiKey) {
    throw new Error("CALL_BACKEND=retell requires RETELL_API_KEY to be set.");
  }
  const client = new RetellHttpClient({ apiKey });
  const fromNumber = env.RETELL_FROM_NUMBER?.trim() || undefined;
  const agentId = env.RETELL_AGENT_ID?.trim() || undefined;
  const provisioner = new RetellProvisioner(client, {
    agentId,
    llmId: env.RETELL_LLM_ID?.trim() || undefined,
    fromNumber,
    agentName: env.RETELL_AGENT_NAME?.trim() || undefined,
    voiceId: env.RETELL_VOICE_ID?.trim() || undefined,
  });
  const artifactStore = createArtifactStore({
    supabase: deps.supabase,
    demoMode: env.DEMO_MODE === "true",
    localDir: env.RETELL_ARTIFACTS_DIR?.trim() || undefined,
  });
  return new RetellCallBackend({
    client,
    artifactStore,
    fromNumber,
    agentId,
    provisioner,
  });
}
