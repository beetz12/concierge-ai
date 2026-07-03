/**
 * Pure per-call policy engine (R-5): `evaluate(context) -> decision`.
 *
 * NO I/O — every lookup the decision depends on (tenant kill switch,
 * suppression hit, callee-local time, consent record) is a declared input on
 * {@link ComplianceCallContext}, resolved by the dispatch orchestrator. The
 * engine consults only the static tables in `state-rules.ts` (policy matrix)
 * and `task-types.ts` (R-27 taxonomy), and fails closed on missing data (R-6).
 */
import {
  FEDERAL_QUIET_HOURS,
  requiresAllPartyRecording,
  STATE_RULES,
} from "./state-rules.js";
import { getTaskTypeRule, type TaskTypeRule } from "./task-types.js";
import type {
  ComplianceCallContext,
  DenyReason,
  PolicyDecision,
  QuietHoursWindow,
  RecordingMode,
} from "./types.js";

/**
 * Version of the rule set. Bump on ANY change to the decision logic,
 * state-rules table, task-type taxonomy, or disclosure language — it is
 * stamped into every dispatch_audit_log row (R-24) so a logged decision can
 * be traced to the exact rules that produced it.
 */
export const POLICY_VERSION = "2026.07.03-1";

const US_E164_REGEX = /^\+1\d{10}$/;

export function evaluate(context: ComplianceCallContext): PolicyDecision {
  const taskRule = getTaskTypeRule(context.taskType);
  const stateRule = context.targetState ? STATE_RULES[context.targetState] : null;
  // Unknown state fails closed to the federal window; the callee-local-time
  // input already carries every candidate zone in that case (see below).
  const quietHoursWindow = stateRule?.quietHours ?? FEDERAL_QUIET_HOURS;
  const reasons: DenyReason[] = [];

  if (!US_E164_REGEX.test(context.targetNumber)) {
    reasons.push("invalid_target_number");
  }

  // R-1 / two-gate dispatch: a human must have approved THIS plan.
  if (!context.userApproved) {
    reasons.push("missing_user_approval");
  }

  // Per-tenant kill switch (tenant_settings.outbound_kill_switch).
  if (context.killSwitchActive) {
    reasons.push("kill_switch");
  }

  // R-10: mandatory pre-dial suppression check (org-scoped + platform-wide).
  if (context.suppressionHit) {
    reasons.push("suppressed");
  }

  // The 24h same-number redial guard runs inside the call backend at
  // dispatch time; when the resolver already knows it would refuse, the
  // decision carries the deny instead of letting dispatch bounce later.
  if (context.redialBlocked) {
    reasons.push("redial_blocked");
  }

  // R-7 quiet hours on CALLEE-local time, with state deltas (FL 8a–8p).
  // Applied to every call, not just solicitations — stricter than the
  // federal floor by design ("consent moots quiet hours" is contested, Q3).
  // When the zone is unknown the context carries all candidate US zones and
  // the window must hold in every one of them (fail closed, R-6).
  if (!withinQuietHoursWindow(context, quietHoursWindow)) {
    reasons.push("quiet_hours");
  }

  // R-8: WA flat ban on AI/recorded-voice commercial solicitation,
  // regardless of consent (RCW 80.36.400; RCW 19.190 for SMS).
  if (taskRule.isSolicitation && context.targetState === "WA") {
    reasons.push("wa_adad_ban");
  }

  // R-3: consent tier is a function of call purpose. Solicitations require
  // prior express WRITTEN consent on record; the buyer-side default types
  // (non-solicitation calls to a business's published line) carry their
  // lawful basis in the R-27 table and are not consent-gated here.
  if (
    taskRule.isSolicitation &&
    context.recipientConsentTier !== "prior_express_written"
  ) {
    reasons.push("consent_insufficient");
  }

  // Recording posture: all-party states — including the disputed CT/NV/DE/MI
  // rows — and UNKNOWN states force announced all-party recording (R-6).
  const recordingMode: RecordingMode =
    !stateRule || requiresAllPartyRecording(stateRule.recordingConsent)
      ? "all_party_disclosed"
      : "one_party_disclosed";

  return {
    allow: reasons.length === 0,
    reasons,
    disclosureLines: buildDisclosureLines(context, taskRule, recordingMode),
    recordingMode,
    policyVersion: POLICY_VERSION,
    quietHoursWindow,
    consentTierRequired: taskRule.defaultConsentTier,
    suppressionChecked: true,
    redialGuard: "delegated_to_backend",
  };
}

function withinQuietHoursWindow(
  context: ComplianceCallContext,
  window: QuietHoursWindow,
): boolean {
  const times = context.calleeLocalTimes;
  if (times.length === 0) {
    return false; // Unresolvable local time: fail closed.
  }
  return times.every((time) => {
    const minutes = time.hour * 60 + time.minute;
    return (
      Number.isFinite(minutes) &&
      minutes >= window.startMinute &&
      minutes < window.endMinute
    );
  });
}

/**
 * R-12 universal opener, in mandated order: identity → AI → recording →
 * (solicitation only) interactive opt-out. Rendered on EVERY call in every
 * state: the AI line satisfies CA AB 2905 / UT SB 149 / CO SB 24-205 by
 * construction, and the recording line satisfies one-party states,
 * notice-based all-party states (RCW 9.73.030(3)), and MA.
 */
function buildDisclosureLines(
  context: ComplianceCallContext,
  taskRule: TaskTypeRule,
  recordingMode: RecordingMode,
): string[] {
  const identity = context.callbackNumber
    ? `This call is on behalf of ${context.onBehalfOfEntity}. You can reach us at ${context.callbackNumber}.`
    : `This call is on behalf of ${context.onBehalfOfEntity}.`;

  const lines = [
    identity,
    "I'm an AI assistant, not a human.",
    recordingMode === "all_party_disclosed"
      ? "This call is being recorded; by staying on the line you consent to the recording."
      : "This call is being recorded.",
  ];

  if (taskRule.isSolicitation) {
    lines.push(
      'You can say "stop calling" at any time and we will add you to our do-not-call list.',
    );
  }

  return lines;
}
