/**
 * CallBackend abstraction.
 *
 * A CallBackend is a pluggable telephony provider that can dispatch an
 * outbound voice call from a normalized {@link CallPlan}, report its
 * {@link CallStatus}, and surface {@link CallArtifacts} (recording,
 * transcript, structured outcome) once the call completes.
 *
 * The concrete backend is selected at runtime via the `CALL_BACKEND`
 * environment variable (see {@link getCallBackend}), defaulting to LiveKit.
 */

export type CallBackendId = "livekit" | "retell";

/**
 * How the agent should behave when a call reaches voicemail or an
 * automated greeting instead of a live person.
 */
export type VoicemailPolicy = "leave_message" | "hang_up" | "retry_later";

/**
 * A fact the agent is pre-authorized to disclose or an action it is
 * permitted to take on the caller's behalf (e.g. providing an address,
 * confirming a booking window, accepting a quoted rate).
 */
export interface CallPreAuthorization {
  /** Short label for the authorization, e.g. "share_address". */
  key: string;
  /** Human-readable value or instruction the agent may act on. */
  value: string;
}

/**
 * Provider-agnostic description of a single outbound call to place.
 */
export interface CallPlan {
  /** Business or contact name being called. */
  businessName: string;
  /** Destination number in E.164 format (e.g. +15551234567). */
  phoneNumber: string;
  /** What the call is trying to achieve. */
  objective: string;
  /** Background the agent needs to conduct the call. */
  context: string;
  /** Questions the agent must ask before ending the call. */
  mustAsk: string[];
  /** Who the agent presents itself as (client name / relationship). */
  callerIdentity: string;
  /** Optional E.164 number the provider can call back on. */
  callbackNumber?: string;
  /** Behavior when the call lands in voicemail. */
  voicemailPolicy: VoicemailPolicy;
  /** Facts/actions the agent is pre-cleared to disclose or perform. */
  preAuthorizations: CallPreAuthorization[];
  /**
   * Tenant identifier used for per-tenant dispatch guardrails (e.g. the
   * 24h same-number redial guard). When omitted, guards apply account-wide.
   */
  tenantId?: string;
  /**
   * Asserts that a human reviewed THIS call plan (number, objective,
   * questions) and explicitly approved the dispatch. Backends with dispatch
   * guards (e.g. Retell) refuse to dial without it.
   */
  userApproved?: boolean;
  /**
   * Overrides the 24h same-number redial guard for a retry that was
   * explicitly pre-approved by the user.
   */
  allowRedial?: boolean;
}

/**
 * Lifecycle state of a dispatched call.
 */
export type CallStatusState =
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

/**
 * Normalized status of a dispatched call, independent of provider.
 */
export interface CallStatus {
  callId: string;
  state: CallStatusState;
  /** True once the call has reached a terminal state. */
  completed: boolean;
  /** Short disposition label (e.g. "qualified", "no_answer"), if known. */
  disposition: string | null;
  /** One-line summary of the outcome, if known. */
  summary: string | null;
}

/**
 * Artifacts produced by a completed call.
 */
export interface CallArtifacts {
  callId: string;
  /** Reference (path or URL) to the call recording, if available. */
  recordingRef: string | null;
  /** Full transcript text, if available. */
  transcript: string | null;
  /**
   * Structured outcome extracted from the call (availability, rate,
   * disposition, etc.). Shape is backend-defined but always JSON-serializable.
   */
  structuredOutcome: Record<string, unknown> | null;
}

/**
 * Capabilities a backend advertises so callers can gate optional features
 * (pause/resume, supervisor listen-in, warm transfer, DTMF).
 */
export interface CallBackendCapabilities {
  supportsPause: boolean;
  supportsSupervision: boolean;
  supportsWarmTransfer: boolean;
  supportsDtmf: boolean;
}

/**
 * A pluggable telephony backend.
 */
export interface CallBackend {
  readonly id: CallBackendId;
  readonly capabilities: CallBackendCapabilities;

  /** Dispatch an outbound call and return its backend call id. */
  dispatchCall(plan: CallPlan): Promise<{ callId: string }>;

  /** Fetch the current normalized status for a dispatched call. */
  getStatus(callId: string): Promise<CallStatus>;

  /** Fetch artifacts (recording, transcript, structured outcome). */
  getArtifacts(callId: string): Promise<CallArtifacts>;

  /** Cancel an in-flight call. */
  cancelCall(callId: string): Promise<void>;
}
