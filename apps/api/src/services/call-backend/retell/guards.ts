/**
 * Dispatch guardrails for the Retell backend.
 *
 * Ported from the proven `call-biz` CLI:
 * - dispatch requires explicit human approval of THIS call plan;
 * - one single E.164 US number per dispatch (batch dialing refused by design);
 * - a 24h same-number redial guard (scoped per tenant when `tenantId` is
 *   set) that can only be bypassed with an explicit `allowRedial` override.
 */
import type { CallPlan } from "../types.js";
import type { RetellHttpClient } from "./retell-http.js";
import { retellCallListSchema } from "./schemas.js";

export const US_E164_REGEX = /^\+1\d{10}$/;

export const REDIAL_WINDOW_MS = 24 * 60 * 60 * 1000;

export type CallGuardCode =
  | "user_approval_required"
  | "invalid_phone_number"
  | "redial_blocked";

/** A dispatch was refused by a safety guard (not a transport failure). */
export class CallGuardError extends Error {
  constructor(
    readonly code: CallGuardCode,
    message: string,
  ) {
    super(message);
    this.name = "CallGuardError";
  }
}

/**
 * Refuse dispatch unless a human saw the call plan (number, objective,
 * questions) and explicitly approved this specific call.
 */
export function assertUserApproved(plan: CallPlan): void {
  if (!plan.userApproved) {
    throw new CallGuardError(
      "user_approval_required",
      "REFUSED: dispatch requires userApproved. A human must see the call " +
        "plan (number, objective, questions) and explicitly approve THIS " +
        "call before it is dispatched.",
    );
  }
}

/**
 * Refuse anything that is not a single E.164 US number (+1XXXXXXXXXX).
 * Batch dialing is refused by design: one number per dispatch.
 */
export function assertSingleUsE164(phoneNumber: string): void {
  if (!US_E164_REGEX.test(phoneNumber)) {
    throw new CallGuardError(
      "invalid_phone_number",
      `phoneNumber must be a single E.164 US number (+1XXXXXXXXXX), got: ${phoneNumber}`,
    );
  }
}

export interface RedialGuardOptions {
  now?: () => number;
  warn?: (message: string) => void;
}

/**
 * Refuse dialing a number that was already called within the last 24h
 * (same-number redials read as spam and burn the contact), unless the plan
 * carries an explicit `allowRedial` override.
 *
 * The guard is scoped per tenant+number when `plan.tenantId` is set (only
 * prior calls tagged with the same `tenant_id` metadata count); without a
 * tenant it applies account-wide. If the lookup itself fails, the dispatch
 * proceeds with a warning — mirroring call-biz.
 */
export async function assertRedialAllowed(
  client: RetellHttpClient,
  plan: CallPlan,
  options: RedialGuardOptions = {},
): Promise<void> {
  if (plan.allowRedial) {
    return;
  }
  const now = options.now ?? Date.now;
  const warn =
    options.warn ??
    ((message: string) => console.warn(`[retell-backend] ${message}`));

  let calls;
  try {
    const { status, json } = await client.request("POST", "/v2/list-calls", {
      filter_criteria: { to_number: [plan.phoneNumber] },
      limit: 20,
      sort_order: "descending",
    });
    if (status !== 200 || !Array.isArray(json)) {
      warn("redial-guard lookup failed; proceeding without it");
      return;
    }
    calls = retellCallListSchema.parse(json);
  } catch {
    warn("redial-guard lookup failed; proceeding without it");
    return;
  }

  // Most recent call to this number that actually rang.
  const previous = calls.find(
    (call) =>
      call.call_status !== "error" &&
      call.call_status !== "not_connected" &&
      typeof call.start_timestamp === "number" &&
      tenantMatches(call.metadata, plan.tenantId),
  );
  if (!previous || typeof previous.start_timestamp !== "number") {
    return;
  }

  const ageMs = now() - previous.start_timestamp;
  if (ageMs < REDIAL_WINDOW_MS) {
    const ageHours = (ageMs / 3_600_000).toFixed(1);
    throw new CallGuardError(
      "redial_blocked",
      `REFUSED: ${plan.phoneNumber} was already called ${ageHours}h ago ` +
        `(${previous.call_id}, ${previous.call_status}). Same-number redials ` +
        "within 24h read as spam and burn the contact. If the user " +
        "explicitly pre-approved this retry, re-dispatch with allowRedial.",
    );
  }
}

function tenantMatches(
  metadata: Record<string, unknown> | null | undefined,
  tenantId: string | undefined,
): boolean {
  if (!tenantId) {
    // No tenant scope requested: any prior call to the number counts.
    return true;
  }
  return metadata?.["tenant_id"] === tenantId;
}
