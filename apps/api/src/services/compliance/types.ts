/**
 * Compliance policy engine types (SaaS slice 6).
 *
 * The engine contract is R-5 in docs/compliance/product-requirements.md:
 * `evaluate(call_context) -> policy_decision` where the context is FULLY
 * RESOLVED before the call — every lookup (tenant kill switch, suppression
 * list, callee-local time) is a declared input, so `evaluate()` stays a pure
 * function with no I/O and no hidden reads. The per-state data it consults
 * lives in `state-rules.ts` (docs/compliance/policy-matrix.md transcribed)
 * and the task taxonomy in `task-types.ts` (R-27).
 */

/** Two-letter USPS code for the 50 states + DC (the 51 matrix rows). */
export type StateCode =
  | "AL" | "AK" | "AZ" | "AR" | "CA" | "CO" | "CT" | "DE" | "DC" | "FL"
  | "GA" | "HI" | "ID" | "IL" | "IN" | "IA" | "KS" | "KY" | "LA" | "ME"
  | "MD" | "MA" | "MI" | "MN" | "MS" | "MO" | "MT" | "NE" | "NV" | "NH"
  | "NJ" | "NM" | "NY" | "NC" | "ND" | "OH" | "OK" | "OR" | "PA" | "RI"
  | "SC" | "SD" | "TN" | "TX" | "UT" | "VT" | "VA" | "WA" | "WV" | "WI"
  | "WY";

/**
 * R-27 task_type taxonomy — a FIXED enum, never free text and never a
 * runtime classifier. Each value maps to `{isSolicitation,
 * defaultConsentTier}` in `task-types.ts`; new values must declare both
 * before use, and `unknown` fails safe to solicitation + written consent.
 */
export type ComplianceTaskType =
  | "availability_inquiry"
  | "rate_inquiry"
  | "rate_negotiation"
  | "appointment_booking"
  | "general_inquiry"
  | "complaint"
  | "dispute_followup"
  | "outbound_sales"
  | "promotional_notice"
  | "unknown";

/** Recipient consent tiers (R-2/R-3), ordered none < express < written. */
export type ConsentTier = "none" | "prior_express" | "prior_express_written";

export type ComplianceChannel = "voice" | "sms";

/** R-28 line type; `unknown` is treated as `wireless` (fail safe, R-6). */
export type TargetLineType = "wireless" | "landline" | "unknown";

/** Recording posture the dispatched call must use (R-5). */
export type RecordingMode =
  | "all_party_disclosed"
  | "one_party_disclosed"
  | "prohibited";

/** Per-state recording-consent mode from the policy matrix. */
export type RecordingConsentMode =
  | "one_party"
  | "all_party"
  /** Statute/case-law conflict (CT/NV/DE/MI): engine fails closed to all-party. */
  | "all_party_disputed";

/** Typed deny reasons (R-25: every deny is logged with machine reasons). */
export type DenyReason =
  | "missing_user_approval"
  | "kill_switch"
  | "suppressed"
  | "quiet_hours"
  | "wa_adad_ban"
  | "consent_insufficient"
  | "redial_blocked"
  | "invalid_target_number";

/**
 * Allowed calling window in the callee's local time, minutes from midnight.
 * Federal default is [480, 1260) = 8:00 a.m.–9:00 p.m. (47 CFR 64.1200(c)(1));
 * a call at exactly `endMinute` is OUTSIDE the window.
 */
export interface QuietHoursWindow {
  startMinute: number;
  endMinute: number;
}

/** A resolved wall-clock time in one candidate IANA zone for the callee. */
export interface CalleeLocalTime {
  zone: string;
  hour: number;
  minute: number;
}

/**
 * Fully-resolved evaluation context (R-5 inputs). The dispatch orchestrator
 * builds this from the call plan + database lookups; the engine only reads it.
 */
export interface ComplianceCallContext {
  /** Tenant the dispatch runs under. */
  orgId: string;
  /** Destination number in E.164 (+1XXXXXXXXXX). */
  targetNumber: string;
  /** Callee state derived from the number's area code; null = unknown (fails closed). */
  targetState: StateCode | null;
  /** R-28 line type; defaults to `unknown` → treated as wireless (R-6). */
  targetLineType?: TargetLineType;
  taskType: ComplianceTaskType;
  channel: ComplianceChannel;
  /** UTC instant the dispatch was requested (ISO 8601). */
  requestedAtUtc: string;
  /**
   * Callee wall-clock time(s) at `requestedAtUtc`. Exactly one entry when the
   * number's zone is known; when it is NOT resolvable this carries every
   * candidate US zone and the quiet-hours gate passes only if ALL of them are
   * inside the window (fail closed, R-6). Empty = unresolvable = deny.
   */
  calleeLocalTimes: CalleeLocalTime[];
  /** Entity the call is placed on behalf of (R-12 identity disclosure). */
  onBehalfOfEntity: string;
  /** Optional E.164 callback number included in the identity disclosure. */
  callbackNumber?: string;
  /** A human saw THIS plan and approved dispatch (two-gate UX, R-1). */
  userApproved: boolean;
  /** tenant_settings.outbound_kill_switch for the org. */
  killSwitchActive: boolean;
  /** Target matched a live suppression_entries row (org-scoped or global, R-9/R-10). */
  suppressionHit: boolean;
  /** Recipient consent on record (R-2); `none` when absent. */
  recipientConsentTier: ConsentTier;
  /**
   * The 24h same-number redial guard is enforced by the call backend at
   * dispatch time (see retell/guards.ts); when the caller already knows the
   * guard would refuse, it surfaces that here so the decision carries it.
   */
  redialBlocked?: boolean;
}

/** R-5 outputs. `policyVersion` is stamped into every audit row (R-24). */
export interface PolicyDecision {
  allow: boolean;
  /** Empty on allow; ordered by check sequence on deny. */
  reasons: DenyReason[];
  /**
   * Ordered disclosure lines the prompt layer MUST render verbatim at the
   * top of the call (R-12: identity, AI, recording, opt-out).
   */
  disclosureLines: string[];
  recordingMode: RecordingMode;
  policyVersion: string;
  /** The callee-local window this call was evaluated against. */
  quietHoursWindow: QuietHoursWindow;
  /** Consent tier the task type requires (R-27 lookup). */
  consentTierRequired: ConsentTier;
  /** Suppression was consulted for this decision (always true; R-10). */
  suppressionChecked: boolean;
  /** The 24h redial guard runs in the backend dispatch path, not here. */
  redialGuard: "delegated_to_backend";
}
