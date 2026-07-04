/**
 * Client for the /api/v1/dispatch flow (SaaS slice 8).
 *
 * BLUF copy rules: every user-facing string here leads with the outcome.
 * ASCII only - these strings render in the dispatch UX and in prompts.
 */

import { createClient } from "../supabase/client";

const API_BASE = "/api/v1/dispatch";

export type DispatchTaskType =
  | "negotiate_price"
  | "request_refund"
  | "complain_issue"
  | "schedule_appointment"
  | "cancel_service"
  | "make_inquiry"
  | "deliver_message"
  | "general_task";

export type VoicemailPolicy = "leave_message" | "hang_up" | "retry_later";

export type DenyReason =
  | "missing_user_approval"
  | "kill_switch"
  | "suppressed"
  | "quiet_hours"
  | "wa_adad_ban"
  | "consent_insufficient"
  | "redial_blocked"
  | "invalid_target_number";

/** Human-readable copy for every policy-engine deny literal (slice 6). */
export const DENY_REASON_COPY: Record<DenyReason, string> = {
  missing_user_approval:
    "Approval missing: a human must review and approve this exact plan before dispatch.",
  kill_switch:
    "Outbound calling is switched off for your organization (kill switch).",
  suppressed:
    "This number is on a do-not-call suppression list and cannot be dialed.",
  quiet_hours:
    "Outside calling hours: it is currently outside the allowed window at the destination.",
  wa_adad_ban:
    "Washington state bans automated solicitation calls regardless of consent.",
  consent_insufficient:
    "Consent on file is not sufficient for this type of call.",
  redial_blocked:
    "Redial guard: this number was already called in the last 24 hours.",
  invalid_target_number:
    "The target phone number is not a valid US number (+1 followed by 10 digits).",
};

export interface PreAuthorizationEcho {
  key: string;
  description: string;
  requiresExplicitGrant: boolean;
  granted: boolean;
}

export interface GeneratedPromptView {
  systemPrompt: string;
  firstMessage: string;
  disclosureLine?: string;
  preAuthorizations?: PreAuthorizationEcho[];
}

export interface DispatchPlanResponse {
  taskAnalysis: {
    taskType: DispatchTaskType;
    intent: string;
    difficulty: "easy" | "moderate" | "complex";
  };
  strategicGuidance: {
    keyGoals: string[];
    talkingPoints: string[];
    objectionHandlers: Record<string, string>;
    successCriteria: string[];
  };
  generatedPrompt: GeneratedPromptView;
  mustAsk: string[];
  playbookId: string | null;
  complianceTaskType: string;
  case: {
    id: string;
    title: string;
    counterpartyName: string | null;
    counterpartyPhone: string | null;
    escalationStage: number;
  } | null;
  caseContext: string | null;
}

export interface QuietHoursWindow {
  startMinute: number;
  endMinute: number;
}

export interface PreflightResponse {
  allow: boolean;
  reasons: DenyReason[];
  disclosureLines: string[];
  recordingMode: string;
  quietHoursWindow: QuietHoursWindow;
  consentTierRequired: string;
  policyVersion: string;
  redialBlocked: boolean;
  targetState: string | null;
  complianceTaskType: string;
}

export interface DispatchRequestBody {
  contactName: string;
  phoneNumber: string;
  objective: string;
  context: string;
  mustAsk: string[];
  clientName?: string;
  callbackNumber?: string;
  voicemailPolicy: VoicemailPolicy;
  taskType: DispatchTaskType;
  userApproved: true;
  grantedPreAuthorizations: Array<{ key: string; value: string }>;
  caseId?: string;
  allowRedial?: boolean;
  channel?: "voice" | "sms";
  smsBody?: string;
}

export interface DispatchDeny {
  error: "ComplianceDenied";
  reasons: DenyReason[];
  quietHoursWindow?: QuietHoursWindow;
  policyVersion?: string;
  message: string;
}

export interface DispatchAccepted {
  callId: string;
  state: string;
  caseId: string | null;
  attachedEventId: string | null;
  decision: {
    disclosureLines: string[];
    recordingMode: string;
    policyVersion: string;
  };
}

export interface SmsAccepted {
  channel: "sms";
  messageId: string;
  status: string;
}

export interface CallStatusResponse {
  callId: string;
  state: "queued" | "in_progress" | "completed" | "failed" | "cancelled";
  completed: boolean;
  disposition: string | null;
  summary: string | null;
  caseId: string | null;
  attachedEventId: string | null;
  plan: {
    contactName: string;
    phoneNumber: string;
    objective: string;
    context: string;
    mustAsk: string[];
    clientName: string;
    callbackNumber: string | null;
    voicemailPolicy: VoicemailPolicy;
    taskType: DispatchTaskType;
    grantedPreAuthorizations: Array<{ key: string; value: string }>;
  } | null;
}

export interface CallArtifactsResponse {
  callId: string;
  recordingRef: string | null;
  transcript: string | null;
  structuredOutcome: {
    disposition?: string;
    summary?: string;
    mustAskAnswers?: Array<{ question: string; answer: string }>;
    costUsd?: number;
    durationSeconds?: number;
    [key: string]: unknown;
  } | null;
  caseId: string | null;
  attachedEventId: string | null;
}

export interface CaseSummary {
  id: string;
  title: string;
  status: string;
  counterparty_name: string | null;
  counterparty_phone: string | null;
}

/** UI terminal-state label for a normalized call status. */
export function terminalLabel(status: CallStatusResponse): string | null {
  if (!status.completed) return null;
  switch (status.disposition) {
    case "voicemail":
      return "Voicemail";
    case "no_answer":
      return "No answer";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
    default:
      return status.state === "failed" ? "Error" : "Completed";
  }
}

/** "8:00 AM" style label for minutes-from-midnight. */
export function formatWindowMinute(minute: number): string {
  const hour24 = Math.floor(minute / 60) % 24;
  const minutes = minute % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** Normalize a US phone entry to E.164 when possible; otherwise pass through. */
export function normalizeUsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.trim();
}

const authHeaders = async (): Promise<Record<string, string>> => {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") return {};
  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
  } catch {
    return {};
  }
};

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new DispatchApiError(response.status, payload);
  }
  return payload;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: await authHeaders() });
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new DispatchApiError(response.status, payload);
  }
  return payload;
}

export class DispatchApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(
      (payload as { message?: string })?.message ??
        `Request failed with status ${status}`,
    );
    this.name = "DispatchApiError";
  }

  get deny(): DispatchDeny | null {
    const payload = this.payload as DispatchDeny | undefined;
    return payload?.error === "ComplianceDenied" ? payload : null;
  }
}

export const generateDispatchPlan = (body: {
  taskDescription: string;
  contactName: string;
  contactPhone?: string;
  clientName?: string;
  grantedPreAuthorizations?: string[];
  caseId?: string;
}): Promise<DispatchPlanResponse> => postJson(`${API_BASE}/plan`, body);

export const runPreflight = (body: {
  phoneNumber: string;
  taskType: DispatchTaskType;
  contactName?: string;
  clientName?: string;
  callbackNumber?: string;
  channel?: "voice" | "sms";
}): Promise<PreflightResponse> => postJson(`${API_BASE}/preflight`, body);

export const dispatchCall = (
  body: DispatchRequestBody,
): Promise<DispatchAccepted | SmsAccepted> => postJson(API_BASE, body);

export const getCallStatus = (callId: string): Promise<CallStatusResponse> =>
  getJson(`${API_BASE}/${encodeURIComponent(callId)}`);

export const getCallArtifacts = (
  callId: string,
): Promise<CallArtifactsResponse> =>
  getJson(`${API_BASE}/${encodeURIComponent(callId)}/artifacts`);

export const attachCallToCase = (
  callId: string,
  caseId: string,
  summary?: string,
): Promise<{ eventId: string; caseId: string }> =>
  postJson(`${API_BASE}/${encodeURIComponent(callId)}/attach-case`, {
    caseId,
    summary,
  });

export const listCases = async (): Promise<CaseSummary[]> => {
  const payload = await getJson<{ cases: CaseSummary[] }>("/api/v1/cases");
  return payload.cases;
};

export const getCaseSummary = (caseId: string): Promise<CaseSummary> =>
  getJson(`/api/v1/cases/${encodeURIComponent(caseId)}`);
