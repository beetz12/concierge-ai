/**
 * Client for the /api/v1/members membership flow plus /api/v1/billing
 * checkout (SaaS membership slice).
 *
 * Mirrors dispatchService.ts: same-origin /api rewrite, Supabase bearer
 * auth, BLUF/ASCII-only user-facing strings.
 */

import { createClient } from "../supabase/client";

const MEMBERS_BASE = "/api/v1/members";
const BILLING_BASE = "/api/v1/billing";

// ---------------------------------------------------------------------------
// Types (mirrors apps/api/src/routes/members.ts + billing.ts contracts)
// ---------------------------------------------------------------------------

export type VoicemailPolicy = "leave_message" | "hang_up" | "retry_later";

export const VOICEMAIL_POLICY_OPTIONS: Array<{
  value: VoicemailPolicy;
  label: string;
}> = [
  { value: "hang_up", label: "Hang up (no message)" },
  { value: "leave_message", label: "Leave a message" },
  { value: "retry_later", label: "Hang up and retry later" },
];

export type OrgNumberStatus = "simulated" | "active" | "released";

export interface DedicatedNumber {
  id: string;
  phoneE164: string;
  status: OrgNumberStatus;
  areaCode: string | null;
  purchasedAt: string;
  releasedAt: string | null;
}

export interface MemberCallSettings {
  callerIdentity: string | null;
  voicemailPolicy: VoicemailPolicy;
  transferNumber: string | null;
  updatedAt: string | null;
}

export interface MemberSubscription {
  status: string | null;
  plan: string | null;
}

export interface MemberMeResponse {
  org: { id: string; name: string | null };
  subscription: MemberSubscription;
  dedicatedNumber: DedicatedNumber | null;
  settings: MemberCallSettings;
}

export interface ProvisionNumberResponse {
  number: DedicatedNumber;
  simulated: boolean;
  alreadyProvisioned: boolean;
}

export interface MemberCallSettingsPatch {
  callerIdentity?: string | null;
  voicemailPolicy?: VoicemailPolicy;
  transferNumber?: string | null;
}

export interface MemberCall {
  callId: string;
  businessName: string;
  status: string;
  disposition: string | null;
  summary: string | null;
  createdAt: string;
  hasArtifacts: boolean;
}

export interface MemberCallsResponse {
  calls: MemberCall[];
  nextCursor: string | null;
}

export type PlanId = "starter" | "pro";

export interface CheckoutSessionResponse {
  sessionId: string;
  url: string | null;
}

/** Subscription statuses that unlock the membership features. */
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "demo_active",
]);

/** Single US E.164 number, e.g. +18645551234 (same shape the API enforces). */
export const US_E164_REGEX = /^\+1\d{10}$/;

/** Normalize a US phone entry to E.164 when possible; otherwise pass through. */
export function normalizeUsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return raw.trim();
}

/** "+18645551234" -> "(864) 555-1234" for display; pass through otherwise. */
export function formatUsPhone(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (!match) return e164;
  return `(${match[1]}) ${match[2]}-${match[3]}`;
}

// ---------------------------------------------------------------------------
// Fetch plumbing (same auth pattern as dispatchService.ts)
// ---------------------------------------------------------------------------

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

export class MemberApiError extends Error {
  constructor(
    readonly status: number,
    readonly payload: unknown,
  ) {
    super(
      (payload as { message?: string })?.message ??
        `Request failed with status ${status}`,
    );
    this.name = "MemberApiError";
  }

  /** 402 subscription gate from POST /members/onboarding/number. */
  get subscriptionRequired(): boolean {
    return (
      this.status === 402 &&
      (this.payload as { reason?: string })?.reason === "subscription_required"
    );
  }

  /** Machine-readable failure code (e.g. retell_not_configured). */
  get code(): string | null {
    return (this.payload as { code?: string })?.code ?? null;
  }
}

async function requestJson<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers: {
      ...(init?.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(await authHeaders()),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const payload = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new MemberApiError(response.status, payload);
  }
  return payload;
}

// ---------------------------------------------------------------------------
// Members API
// ---------------------------------------------------------------------------

export const getMemberMe = (): Promise<MemberMeResponse> =>
  requestJson(`${MEMBERS_BASE}/me`);

export const provisionDedicatedNumber = (
  areaCode?: string,
): Promise<ProvisionNumberResponse> =>
  requestJson(`${MEMBERS_BASE}/onboarding/number`, {
    method: "POST",
    body: areaCode ? { areaCode } : {},
  });

export const getMemberSettings = (): Promise<{
  settings: MemberCallSettings;
}> => requestJson(`${MEMBERS_BASE}/settings`);

export const updateMemberSettings = (
  patch: MemberCallSettingsPatch,
): Promise<{ settings: MemberCallSettings }> =>
  requestJson(`${MEMBERS_BASE}/settings`, { method: "PUT", body: patch });

export const listMemberCalls = (options?: {
  limit?: number;
  cursor?: string;
}): Promise<MemberCallsResponse> => {
  const params = new URLSearchParams();
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.cursor) params.set("cursor", options.cursor);
  const query = params.toString();
  return requestJson(`${MEMBERS_BASE}/calls${query ? `?${query}` : ""}`);
};

// ---------------------------------------------------------------------------
// Billing API
// ---------------------------------------------------------------------------

export const createCheckoutSession = (body: {
  plan: PlanId;
  successUrl: string;
  cancelUrl: string;
}): Promise<CheckoutSessionResponse> =>
  requestJson(`${BILLING_BASE}/checkout`, { method: "POST", body });
