/**
 * R-27 task_type taxonomy (docs/compliance/product-requirements.md).
 *
 * The engine's load-bearing lookup: a STATIC table mapping each task type to
 * `{isSolicitation, defaultConsentTier}`. "Solicitation" is TCPA-sense — does
 * the call encourage the CALLED party to purchase/rent/invest? This product
 * is buyer-side by default (it calls a business to buy/verify/resolve on the
 * tenant's behalf), so the default types are non-solicitation. The engine
 * never infers `isSolicitation` at runtime; it reads this table, and
 * `unknown` fails safe to solicitation + prior express written consent.
 */
import type { ComplianceTaskType, ConsentTier } from "./types.js";

export interface TaskTypeRule {
  isSolicitation: boolean;
  defaultConsentTier: ConsentTier;
}

export const TASK_TYPE_RULES: Record<ComplianceTaskType, TaskTypeRule> = {
  availability_inquiry: {
    isSolicitation: false,
    defaultConsentTier: "prior_express",
  },
  rate_inquiry: {
    isSolicitation: false,
    defaultConsentTier: "prior_express",
  },
  rate_negotiation: {
    isSolicitation: false,
    defaultConsentTier: "prior_express",
  },
  appointment_booking: {
    isSolicitation: false,
    defaultConsentTier: "prior_express",
  },
  general_inquiry: {
    isSolicitation: false,
    defaultConsentTier: "prior_express",
  },
  complaint: {
    isSolicitation: false,
    defaultConsentTier: "prior_express",
  },
  dispute_followup: {
    isSolicitation: false,
    defaultConsentTier: "prior_express",
  },
  // Pitches/sells TO the callee — [legal] Q1, prior express WRITTEN consent.
  outbound_sales: {
    isSolicitation: true,
    defaultConsentTier: "prior_express_written",
  },
  promotional_notice: {
    isSolicitation: true,
    defaultConsentTier: "prior_express_written",
  },
  // Unclassified fails safe (R-27 rule b).
  unknown: {
    isSolicitation: true,
    defaultConsentTier: "prior_express_written",
  },
};

/** Fail-safe lookup: anything outside the taxonomy evaluates as `unknown`. */
export function getTaskTypeRule(taskType: ComplianceTaskType): TaskTypeRule {
  return TASK_TYPE_RULES[taskType] ?? TASK_TYPE_RULES.unknown;
}
