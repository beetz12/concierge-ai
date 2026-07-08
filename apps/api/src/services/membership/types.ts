/**
 * Membership backend types (per-org dedicated number, call settings, and
 * durable subscription state).
 *
 * `MembershipStore` is the persistence seam: a Supabase implementation backs
 * real mode and an in-memory implementation backs DEMO_MODE and unit tests,
 * mirroring the cases-service store pattern.
 */
import type { VoicemailPolicy } from "../call-backend/types.js";

/** Lifecycle of an org's dedicated outbound number. */
export type OrgNumberStatus = "simulated" | "active" | "released";

/** A row in org_phone_numbers (camelCase view). */
export interface OrgPhoneNumber {
  id: string;
  orgId: string;
  phoneE164: string;
  /** Retell-side reference for purchased numbers; null when simulated. */
  retellNumberRef: string | null;
  status: OrgNumberStatus;
  areaCode: string | null;
  purchasedAt: string;
  releasedAt: string | null;
}

/** Insert shape for org_phone_numbers. */
export interface NewOrgPhoneNumber {
  orgId: string;
  phoneE164: string;
  retellNumberRef: string | null;
  status: OrgNumberStatus;
  areaCode: string | null;
}

/** A row in org_call_settings (camelCase view). */
export interface OrgCallSettings {
  orgId: string;
  callerIdentity: string | null;
  voicemailPolicy: VoicemailPolicy;
  transferNumber: string | null;
  updatedAt: string | null;
}

/** Partial update for org_call_settings (undefined = leave unchanged). */
export interface OrgCallSettingsPatch {
  callerIdentity?: string | null;
  voicemailPolicy?: VoicemailPolicy;
  transferNumber?: string | null;
}

/** Durable Stripe subscription state for an org (null fields = none yet). */
export interface OrgSubscriptionState {
  status: string | null;
  plan: string | null;
}

/** Minimal organization summary for GET /members/me. */
export interface OrgSummary {
  id: string;
  name: string | null;
}

/**
 * Thrown by {@link MembershipStore.insertOrgPhoneNumber} when the org already
 * holds a number (org_id is UNIQUE). Callers treat this as "already
 * provisioned" and re-read the existing row.
 */
export class OrgNumberConflictError extends Error {
  constructor(readonly orgId: string) {
    super(`Organization ${orgId} already has a dedicated number`);
    this.name = "OrgNumberConflictError";
  }
}

/** Persistence seam for the membership routes and the number purchaser. */
export interface MembershipStore {
  getOrgPhoneNumber(orgId: string): Promise<OrgPhoneNumber | null>;
  /** Lookup by E.164 across all orgs (simulated-number collision checks). */
  findOrgPhoneNumberByPhone(phoneE164: string): Promise<OrgPhoneNumber | null>;
  /** @throws {OrgNumberConflictError} when the org already has a number. */
  insertOrgPhoneNumber(input: NewOrgPhoneNumber): Promise<OrgPhoneNumber>;
  getCallSettings(orgId: string): Promise<OrgCallSettings | null>;
  upsertCallSettings(
    orgId: string,
    patch: OrgCallSettingsPatch,
  ): Promise<OrgCallSettings>;
  getSubscription(orgId: string): Promise<OrgSubscriptionState>;
  getOrganization(orgId: string): Promise<OrgSummary | null>;
}
